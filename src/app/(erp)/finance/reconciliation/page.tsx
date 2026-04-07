export const dynamic = "force-dynamic";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createServiceSupabase } from "@/lib/supabase/server";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { normalizeRetailer } from "@/lib/retailers";

interface Props {
  searchParams: Promise<{ channel?: string }>;
}

async function fetchAll<T = Record<string, any>>(
  supabase: any, table: string, select: string,
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  while (true) {
    const { data } = await supabase.from(table).select(select).range(from, from + 999);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return all;
}

interface ChannelStats {
  orderCount: number;
  orderTotal: number;
  invoiceTotal: number;
  deductions: number;
  netReceived: number;
}

function emptyChannelStats(): ChannelStats {
  return { orderCount: 0, orderTotal: 0, invoiceTotal: 0, deductions: 0, netReceived: 0 };
}

interface MonthData {
  month: string;
  orderCount: number;
  orderTotal: number;
  invoiceTotal: number;
  deductions: number;
  netReceived: number;
  outstanding: number;
  pctCollected: number;
  byChannel: Record<string, ChannelStats>;
  orders: any[];
  lines: any[];
  unmatchedLines: any[];
  noPOLines: any[];
}

async function getReconciliationData() {
  const supabase = await createServiceSupabase();

  const allOrders = await fetchAll(supabase, "orders", "id, channel_order_id, order_date, total, raw_payload");
  const allLines = await fetchAll(supabase, "remittance_lines",
    "id, remittance_id, order_id, po_number, invoice_number, invoice_amount, line_amount, discount, adjustment_date, adjustment_number, adjustment_reason, line_type, remittances(eft_number, payment_date, file_name, retailer)"
  );

  // Index lines by order_id
  const linesByOrderId: Record<string, any[]> = {};
  const unmatchedLines: any[] = [];
  const noPOLines: any[] = [];
  for (const l of allLines) {
    if (l.order_id) {
      if (!linesByOrderId[l.order_id]) linesByOrderId[l.order_id] = [];
      linesByOrderId[l.order_id].push(l);
    } else if (!l.po_number) {
      noPOLines.push(l);
    } else {
      unmatchedLines.push(l);
    }
  }

  // Build order→retailer map
  const orderRetailer: Record<string, string> = {};
  for (const o of allOrders) {
    orderRetailer[o.id] = o.raw_payload?.retailer || "Unknown";
  }

  // Group by month
  const monthMap: Record<string, {
    orderCount: number; orderTotal: number; invoiceTotal: number; deductions: number; netReceived: number;
    byChannel: Record<string, ChannelStats>;
    orders: any[]; lines: any[]; unmatchedLines: any[]; noPOLines: any[];
  }> = {};

  function ensureMonth(month: string) {
    if (!monthMap[month]) {
      monthMap[month] = {
        orderCount: 0, orderTotal: 0, invoiceTotal: 0, deductions: 0, netReceived: 0,
        byChannel: {}, orders: [], lines: [], unmatchedLines: [], noPOLines: [],
      };
    }
    return monthMap[month];
  }

  function ensureChannel(m: typeof monthMap[string], ch: string) {
    if (!m.byChannel[ch]) m.byChannel[ch] = emptyChannelStats();
    return m.byChannel[ch];
  }

  for (const o of allOrders) {
    const month = (o.order_date || "").slice(0, 7);
    if (!month) continue;
    const m = ensureMonth(month);
    const retailer = normalizeRetailer(o.raw_payload?.retailer || "");
    const ch = ensureChannel(m, retailer);
    const total = parseFloat(o.total) || 0;

    m.orderCount++;
    m.orderTotal += total;
    ch.orderCount++;
    ch.orderTotal += total;
    m.orders.push(o);

    const oLines = linesByOrderId[o.id] || [];
    for (const l of oLines) {
      const inv = parseFloat(l.invoice_amount) || 0;
      const disc = parseFloat(l.discount) || 0;
      const amt = parseFloat(l.line_amount) || 0;
      m.invoiceTotal += inv; ch.invoiceTotal += inv;
      m.deductions += disc; ch.deductions += disc;
      if (amt < 0) { m.deductions += Math.abs(amt); ch.deductions += Math.abs(amt); }
      m.netReceived += amt; ch.netReceived += amt;
      m.lines.push(l);
    }
  }

  // Assign unmatched/noPO lines
  function assignLine(l: any, list: "unmatchedLines" | "noPOLines") {
    const month = (l.invoice_date || l.adjustment_date || "").slice(0, 7) || "unknown";
    const m = ensureMonth(month);
    m[list].push(l);
    m.lines.push(l);
    const inv = parseFloat(l.invoice_amount) || 0;
    const disc = parseFloat(l.discount) || 0;
    const amt = parseFloat(l.line_amount) || 0;
    // Determine channel from remittance retailer
    const ch = ensureChannel(m, normalizeRetailer(l.remittances?.retailer || ""));
    m.invoiceTotal += inv; ch.invoiceTotal += inv;
    m.deductions += disc; ch.deductions += disc;
    if (amt < 0) { m.deductions += Math.abs(amt); ch.deductions += Math.abs(amt); }
    m.netReceived += amt; ch.netReceived += amt;
  }
  for (const l of unmatchedLines) assignLine(l, "unmatchedLines");
  for (const l of noPOLines) assignLine(l, "noPOLines");

  // Collect all channels
  const allChannels = new Set<string>();
  Object.values(monthMap).forEach(m => Object.keys(m.byChannel).forEach(ch => allChannels.add(ch)));

  const months: MonthData[] = Object.entries(monthMap)
    .filter(([k]) => k !== "unknown")
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, m]) => {
      const outstanding = Math.max(0, m.orderTotal - m.netReceived);
      const pctCollected = m.orderTotal > 0 ? Math.max(0, Math.min((m.netReceived / m.orderTotal) * 100, 100)) : 0;
      return { month, ...m, outstanding, pctCollected };
    });

  // Overall by channel
  const overallByChannel: Record<string, ChannelStats> = {};
  months.forEach(m => {
    for (const [ch, stats] of Object.entries(m.byChannel)) {
      if (!overallByChannel[ch]) overallByChannel[ch] = emptyChannelStats();
      overallByChannel[ch].orderCount += stats.orderCount;
      overallByChannel[ch].orderTotal += stats.orderTotal;
      overallByChannel[ch].invoiceTotal += stats.invoiceTotal;
      overallByChannel[ch].deductions += stats.deductions;
      overallByChannel[ch].netReceived += stats.netReceived;
    }
  });

  let totalOrderAmount = 0, totalInvoiced = 0, totalDeducted = 0, totalNet = 0;
  months.forEach(m => {
    totalOrderAmount += m.orderTotal;
    totalInvoiced += m.invoiceTotal;
    totalDeducted += m.deductions;
    totalNet += m.netReceived;
  });

  return { months, totalOrderAmount, totalInvoiced, totalDeducted, totalNet, channels: Array.from(allChannels).sort(), overallByChannel };
}

function monthLabel(m: string) {
  const [y, mo] = m.split("-");
  const names = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[parseInt(mo)]} ${y}`;
}

function fmt(n: number, decimals = 0) {
  return n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

export default async function ReconciliationPage({ searchParams }: Props) {
  const params = await searchParams;
  const data = await getReconciliationData();
  const channelFilter = params.channel || "all";

  // Apply channel filter to month rows
  function getStats(m: MonthData) {
    if (channelFilter === "all") {
      return { orderCount: m.orderCount, orderTotal: m.orderTotal, invoiceTotal: m.invoiceTotal, deductions: m.deductions, netReceived: m.netReceived, outstanding: m.outstanding, pctCollected: m.pctCollected };
    }
    const ch = m.byChannel[channelFilter] || emptyChannelStats();
    const outstanding = Math.max(0, ch.orderTotal - ch.netReceived);
    const pctCollected = ch.orderTotal > 0 ? Math.max(0, Math.min((ch.netReceived / ch.orderTotal) * 100, 100)) : 0;
    return { orderCount: ch.orderCount, orderTotal: ch.orderTotal, invoiceTotal: ch.invoiceTotal, deductions: ch.deductions, netReceived: ch.netReceived, outstanding, pctCollected };
  }

  // Overall stats for selected channel
  const overall = channelFilter === "all"
    ? { orderTotal: data.totalOrderAmount, invoiceTotal: data.totalInvoiced, deductions: data.totalDeducted, netReceived: data.totalNet }
    : data.overallByChannel[channelFilter] || emptyChannelStats();
  const overallPct = overall.orderTotal > 0 ? Math.max(0, Math.min((overall.netReceived / overall.orderTotal) * 100, 100)) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/finance" className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h2 className="text-2xl font-bold">Monthly Reconciliation</h2>
          <p className="text-sm text-muted-foreground mt-1">Order invoices vs. actual payments received</p>
        </div>
      </div>

      {/* Channel filter */}
      <div className="flex gap-2">
        <Link
          href="/finance/reconciliation"
          className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${channelFilter === "all" ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"}`}
        >
          All Channels
        </Link>
        {data.channels.map(ch => (
          <Link
            key={ch}
            href={`/finance/reconciliation?channel=${encodeURIComponent(ch)}`}
            className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${channelFilter === ch ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"}`}
          >
            {ch}
          </Link>
        ))}
      </div>

      {/* Overall Summary */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Order Total (Expected)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">${fmt(overall.orderTotal, 2)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Invoiced (from Remittance)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">${fmt(overall.invoiceTotal, 2)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Net Received</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">${fmt(overall.netReceived, 2)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Outstanding</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-orange-600">${fmt(Math.max(0, overall.orderTotal - overall.netReceived), 2)}</p>
            <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${Math.max(0, overallPct)}%` }} />
            </div>
            <p className="text-xs text-muted-foreground mt-1">{overallPct.toFixed(1)}% collected</p>
          </CardContent>
        </Card>
      </div>

      {/* Per-channel summary (only when "all") */}
      {channelFilter === "all" && Object.keys(data.overallByChannel).length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">By Channel</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {Object.entries(data.overallByChannel)
                .sort(([, a], [, b]) => b.orderTotal - a.orderTotal)
                .map(([ch, stats]) => {
                  const pct = stats.orderTotal > 0 ? Math.max(0, Math.min((stats.netReceived / stats.orderTotal) * 100, 100)) : 0;
                  return (
                    <div key={ch} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
                      <div className="w-32">
                        <p className="text-sm font-medium">{ch}</p>
                        <p className="text-xs text-muted-foreground">{stats.orderCount.toLocaleString()} orders</p>
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Expected: ${fmt(stats.orderTotal, 0)}</span>
                          <span>Received: ${fmt(stats.netReceived, 0)}</span>
                        </div>
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                      <div className="text-right w-20">
                        <p className="text-sm font-semibold">{pct.toFixed(1)}%</p>
                      </div>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Monthly Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Monthly Breakdown {channelFilter !== "all" && `— ${channelFilter}`}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Order Total</TableHead>
                <TableHead className="text-right">Invoiced</TableHead>
                <TableHead className="text-right">Deductions</TableHead>
                <TableHead className="text-right">Net Received</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
                <TableHead className="w-[120px]">Progress</TableHead>
                <TableHead>Issues</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.months.map(m => {
                const s = getStats(m);
                if (channelFilter !== "all" && s.orderCount === 0 && s.invoiceTotal === 0) return null;
                return (
                  <TableRow key={m.month} className="">
                    <TableCell>
                      <Link
                        href={`/finance/reconciliation/${m.month}${channelFilter !== "all" ? `?channel=${encodeURIComponent(channelFilter)}` : ""}`}
                        className="text-sm font-medium hover:underline text-blue-600"
                      >
                        {monthLabel(m.month)}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right text-sm">{s.orderCount.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono text-sm">${fmt(s.orderTotal, 0)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {s.invoiceTotal > 0 ? `$${fmt(s.invoiceTotal, 0)}` : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-red-600">
                      {s.deductions > 0 ? `-$${fmt(s.deductions, 0)}` : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-green-600">
                      {s.netReceived > 0 ? `$${fmt(s.netReceived, 0)}` : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-orange-600">
                      {s.outstanding > 0 ? `$${fmt(s.outstanding, 0)}` : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${Math.max(0, s.pctCollected)}%` }} />
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{s.pctCollected.toFixed(1)}%</p>
                    </TableCell>
                    <TableCell>
                      {(m.unmatchedLines.length + m.noPOLines.length) > 0 && channelFilter === "all" && (
                        <div className="flex gap-1">
                          {m.unmatchedLines.length > 0 && (
                            <Badge variant="outline" className="text-orange-600 border-orange-300 text-xs">
                              {m.unmatchedLines.length} unmatched
                            </Badge>
                          )}
                          {m.noPOLines.length > 0 && (
                            <Badge variant="outline" className="text-red-600 border-red-300 text-xs">
                              {m.noPOLines.length} no PO
                            </Badge>
                          )}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

    </div>
  );
}
