export const dynamic = "force-dynamic";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createServiceSupabase } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { normalizeRetailer } from "@/lib/retailers";
import { MonthDetail } from "../month-detail";

interface Props {
  params: Promise<{ month: string }>;
  searchParams: Promise<{ channel?: string }>;
}

async function fetchAll<T = Record<string, any>>(
  supabase: any, table: string, select: string,
  filter?: { col: string; op: string; val: any },
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  while (true) {
    let q = supabase.from(table).select(select).range(from, from + 999);
    if (filter) {
      if (filter.op === "gte") q = q.gte(filter.col, filter.val);
      if (filter.op === "lt") q = q.lt(filter.col, filter.val);
    }
    const { data } = await q;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return all;
}

function monthLabel(m: string) {
  const [y, mo] = m.split("-");
  const names = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[parseInt(mo)]} ${y}`;
}

async function getMonthData(month: string) {
  const supabase = await createServiceSupabase();

  // Calculate date range for this month
  const [y, m] = month.split("-").map(Number);
  const startDate = `${month}-01`;
  const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;

  // Fetch orders for this month only
  const orders = await fetchAll(supabase, "orders", "id, channel_order_id, order_date, total, raw_payload",
    { col: "order_date", op: "gte", val: startDate }
  );
  // Filter client-side for < nextMonth (fetchAll only supports one filter)
  const monthOrders = orders.filter(o => (o.order_date || "") < nextMonth);

  // Fetch all remittance lines that match these orders
  const orderIds = new Set(monthOrders.map(o => o.id));

  // Get all remittance lines (usually not too many)
  const allLines = await fetchAll(supabase, "remittance_lines",
    "id, remittance_id, order_id, po_number, invoice_number, invoice_date, invoice_amount, line_amount, discount, adjustment_date, adjustment_number, adjustment_reason, line_type, remittances(eft_number, payment_date, file_name, retailer)"
  );

  // Split lines
  const matchedLines: any[] = [];
  const unmatchedLines: any[] = [];
  const noPOLines: any[] = [];

  // Lines matched to orders in this month
  const linesByOrderId: Record<string, any[]> = {};
  for (const l of allLines) {
    if (l.order_id && orderIds.has(l.order_id)) {
      if (!linesByOrderId[l.order_id]) linesByOrderId[l.order_id] = [];
      linesByOrderId[l.order_id].push(l);
      matchedLines.push(l);
    }
  }

  // Unmatched/noPO lines for this month (by invoice_date, payment_date, or adjustment_date)
  for (const l of allLines) {
    if (l.order_id && orderIds.has(l.order_id)) continue; // already counted
    const lineMonth = (l.remittances?.payment_date || l.payment_date || "").slice(0, 7);
    if (lineMonth !== month) continue;
    if (!l.po_number) noPOLines.push(l);
    else if (!l.order_id) unmatchedLines.push(l);
  }

  const allMonthLines = [...matchedLines, ...unmatchedLines, ...noPOLines];

  // Compute totals
  let orderTotal = 0;
  let invoiceTotal = 0;
  let deductions = 0;
  let netReceived = 0;
  const byChannel: Record<string, { orderCount: number; orderTotal: number; invoiceTotal: number; deductions: number; netReceived: number }> = {};

  function ensureCh(ch: string) {
    if (!byChannel[ch]) byChannel[ch] = { orderCount: 0, orderTotal: 0, invoiceTotal: 0, deductions: 0, netReceived: 0 };
    return byChannel[ch];
  }

  for (const o of monthOrders) {
    const total = parseFloat(o.total) || 0;
    const retailer = normalizeRetailer(o.raw_payload?.retailer || "");
    const ch = ensureCh(retailer);
    orderTotal += total;
    ch.orderCount++;
    ch.orderTotal += total;

    const oLines = linesByOrderId[o.id] || [];
    for (const l of oLines) {
      const inv = parseFloat(l.invoice_amount) || 0;
      const disc = parseFloat(l.discount) || 0;
      const amt = parseFloat(l.line_amount) || 0;
      invoiceTotal += inv; ch.invoiceTotal += inv;
      deductions += disc; ch.deductions += disc;
      if (amt < 0) { deductions += Math.abs(amt); ch.deductions += Math.abs(amt); }
      netReceived += amt; ch.netReceived += amt;
    }
  }

  // Add unmatched/noPO amounts
  for (const l of [...unmatchedLines, ...noPOLines]) {
    const inv = parseFloat(l.invoice_amount) || 0;
    const disc = parseFloat(l.discount) || 0;
    const amt = parseFloat(l.line_amount) || 0;
    const retailer = normalizeRetailer(l.remittances?.retailer || "");
    const ch = ensureCh(retailer);
    invoiceTotal += inv; ch.invoiceTotal += inv;
    deductions += disc; ch.deductions += disc;
    if (amt < 0) { deductions += Math.abs(amt); ch.deductions += Math.abs(amt); }
    netReceived += amt; ch.netReceived += amt;
  }

  const outstanding = Math.max(0, orderTotal - netReceived);
  const pctCollected = orderTotal > 0 ? Math.max(0, Math.min((netReceived / orderTotal) * 100, 100)) : 0;

  return {
    month,
    orderCount: monthOrders.length,
    orderTotal,
    invoiceTotal,
    deductions,
    netReceived,
    outstanding,
    pctCollected,
    byChannel,
    orders: monthOrders,
    lines: allMonthLines,
    unmatchedLines,
    noPOLines,
  };

}

function fmt(n: number, d = 2) {
  return n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
}

export default async function MonthReconciliationPage({ params, searchParams }: Props) {
  const { month } = await params;
  const { channel: channelFilter = "all" } = await searchParams;

  // Validate month format
  if (!/^\d{4}-\d{2}$/.test(month)) notFound();

  const data = await getMonthData(month);
  const label = monthLabel(month);
  const channels = Object.keys(data.byChannel).sort();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/finance/reconciliation" className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h2 className="text-2xl font-bold">{label}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {(channelFilter !== "all" && data.byChannel[channelFilter] ? data.byChannel[channelFilter].orderCount : data.orderCount).toLocaleString()} orders &middot; Monthly reconciliation
          </p>
        </div>
      </div>

      {/* Channel filter */}
      {channels.length > 1 && (
        <div className="flex gap-2">
          <Link
            href={`/finance/reconciliation/${month}`}
            className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${channelFilter === "all" ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"}`}
          >
            All
          </Link>
          {channels.map(ch => (
            <Link
              key={ch}
              href={`/finance/reconciliation/${month}?channel=${encodeURIComponent(ch)}`}
              className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${channelFilter === ch ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"}`}
            >
              {ch}
            </Link>
          ))}
        </div>
      )}

      {/* Summary Cards */}
      {(() => {
        const ch = channelFilter !== "all" ? data.byChannel[channelFilter] : null;
        const orderTotal = ch ? ch.orderTotal : data.orderTotal;
        const orderCount = ch ? ch.orderCount : data.orderCount;
        const invoiceTotal = ch ? ch.invoiceTotal : data.invoiceTotal;
        const deductions = ch ? ch.deductions : data.deductions;
        const netReceived = ch ? ch.netReceived : data.netReceived;
        const outstanding = Math.max(0, orderTotal - netReceived);
        const pctCollected = orderTotal > 0 ? Math.max(0, Math.min((netReceived / orderTotal) * 100, 100)) : 0;
        return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Order Total</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">${fmt(orderTotal)}</p>
            <p className="text-xs text-muted-foreground mt-1">{orderCount} orders</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Invoiced</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">${fmt(invoiceTotal)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Deductions</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-600">-${fmt(deductions)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Net Received</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">${fmt(netReceived)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Outstanding</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-orange-600">${fmt(outstanding)}</p>
            <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${pctCollected}%` }} />
            </div>
            <p className="text-xs text-muted-foreground mt-1">{pctCollected.toFixed(1)}% collected</p>
          </CardContent>
        </Card>
      </div>
        );
      })()}

      <MonthDetail month={data.month} monthLabel={label} data={data} channelFilter={channelFilter} />
    </div>
  );
}
