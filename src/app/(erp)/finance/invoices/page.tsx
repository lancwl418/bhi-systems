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
import { UploadInvoices } from "./upload-invoices";

import { InvoiceSearch } from "./search-input";

interface Props {
  searchParams: Promise<{ month?: string; view?: string; q?: string }>;
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

interface InvoiceRow {
  invoice_number: string;
  po_number: string;
  order_id: string | null;
  invoice_date: string | null;
  invoice_month: string;
  invoice_amount: number;
  sku_code: string | null;
  payment_amount: number;
  deductions: number;
  net_received: number;
  paid: boolean;
}

async function getInvoiceData() {
  const supabase = await createServiceSupabase();

  const invoices = await fetchAll(supabase, "order_invoices",
    "invoice_number, po_number, order_id, invoice_date, invoice_amount, sku_code"
  );

  const remittancePayments = await fetchAll(supabase, "remittance_lines",
    "invoice_number, line_amount, discount"
  );

  const remittanceDeductions = await fetchAll(supabase, "remittance_lines",
    "adjustment_number, line_amount"
  );

  const paymentMap: Record<string, { payment: number; discount: number }> = {};
  for (const l of remittancePayments) {
    if (!l.invoice_number) continue;
    if (!paymentMap[l.invoice_number]) paymentMap[l.invoice_number] = { payment: 0, discount: 0 };
    paymentMap[l.invoice_number].payment += parseFloat(l.line_amount) || 0;
    paymentMap[l.invoice_number].discount += parseFloat(l.discount) || 0;
  }

  const deductionMap: Record<string, number> = {};
  for (const l of remittanceDeductions) {
    if (!l.adjustment_number) continue;
    const amt = parseFloat(l.line_amount) || 0;
    if (amt < 0) {
      if (!deductionMap[l.adjustment_number]) deductionMap[l.adjustment_number] = 0;
      deductionMap[l.adjustment_number] += Math.abs(amt);
    }
  }

  const rows: InvoiceRow[] = invoices.map((inv: any) => {
    const pay = paymentMap[inv.invoice_number];
    const ded = deductionMap[inv.invoice_number] || 0;
    const paymentAmount = pay?.payment || 0;
    const discount = pay?.discount || 0;
    const dateStr = inv.invoice_date ? String(inv.invoice_date).slice(0, 10) : null;
    return {
      invoice_number: inv.invoice_number,
      po_number: inv.po_number,
      order_id: inv.order_id,
      invoice_date: dateStr,
      invoice_month: dateStr ? dateStr.slice(0, 7) : "unknown",
      invoice_amount: parseFloat(inv.invoice_amount) || 0,
      sku_code: inv.sku_code,
      payment_amount: paymentAmount,
      deductions: discount + ded,
      net_received: paymentAmount - ded,
      paid: paymentAmount > 0,
    };
  });

  rows.sort((a, b) => {
    if (a.invoice_date && b.invoice_date) return b.invoice_date.localeCompare(a.invoice_date);
    if (a.invoice_date) return -1;
    if (b.invoice_date) return 1;
    return 0;
  });

  // Collect months
  const monthSet = new Set<string>();
  rows.forEach((r) => { if (r.invoice_month !== "unknown") monthSet.add(r.invoice_month); });
  const months = [...monthSet].sort((a, b) => b.localeCompare(a));

  const unmatchedCount = rows.filter((r) => !r.order_id).length;

  return { rows, months, unmatchedCount };
}

function fmt(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function monthLabel(m: string) {
  const [y, mo] = m.split("-");
  const names = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[parseInt(mo)]} ${y}`;
}

export default async function InvoicesPage({ searchParams }: Props) {
  const params = await searchParams;
  const data = await getInvoiceData();
  const activeMonth = params.month || "all";
  const activeView = params.view || "all";
  const searchQuery = (params.q || "").toLowerCase();

  // Filter rows
  let filtered = data.rows;
  if (searchQuery) {
    filtered = filtered.filter((r) =>
      r.invoice_number.toLowerCase().includes(searchQuery) ||
      r.po_number.toLowerCase().includes(searchQuery)
    );
  }
  if (activeView === "unmatched") {
    filtered = filtered.filter((r) => !r.order_id);
  }
  if (activeMonth !== "all") {
    filtered = filtered.filter((r) => r.invoice_month === activeMonth);
  }

  // Stats for filtered
  let totalInvoiced = 0, totalReceived = 0, totalDeducted = 0;
  let paidCount = 0, unpaidCount = 0;
  for (const r of filtered) {
    totalInvoiced += r.invoice_amount;
    totalReceived += r.net_received;
    totalDeducted += r.deductions;
    if (r.paid) paidCount++; else unpaidCount++;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Invoices</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {filtered.length} invoices {activeMonth !== "all" ? `in ${monthLabel(activeMonth)}` : ""} {activeView === "unmatched" ? "(unmatched only)" : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <InvoiceSearch defaultValue={searchQuery} />
          <UploadInvoices />
        </div>
      </div>

      {/* View filter */}
      <div className="flex gap-2 flex-wrap">
        <Link
          href="/finance/invoices"
          className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${activeView === "all" && activeMonth === "all" ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"}`}
        >
          All ({data.rows.length})
        </Link>
        {data.unmatchedCount > 0 && (
          <Link
            href="/finance/invoices?view=unmatched"
            className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${activeView === "unmatched" && activeMonth === "all" ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"}`}
          >
            Unmatched
            <Badge variant="destructive" className="ml-2 text-xs px-1.5 py-0">{data.unmatchedCount}</Badge>
          </Link>
        )}
        <div className="w-px bg-border mx-1" />
        {data.months.map((m) => (
          <Link
            key={m}
            href={`/finance/invoices?month=${m}${activeView === "unmatched" ? "&view=unmatched" : ""}`}
            className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${activeMonth === m ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"}`}
          >
            {monthLabel(m)}
          </Link>
        ))}
      </div>

      {/* Summary */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Invoices</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{filtered.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Invoiced Amount</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">${fmt(totalInvoiced)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Net Received</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">${fmt(totalReceived)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Paid</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">{paidCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Unpaid</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-orange-600">{unpaidCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Invoice Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            {activeView === "unmatched" ? "Unmatched Invoices" : "Invoices"}
            {activeMonth !== "all" && ` — ${monthLabel(activeMonth)}`}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice #</TableHead>
                <TableHead>PO Number</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Invoice Date</TableHead>
                <TableHead className="text-right">Invoice Amount</TableHead>
                <TableHead className="text-right">Received</TableHead>
                <TableHead className="text-right">Deductions</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-12">
                    No invoices found.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((inv) => (
                  <TableRow key={inv.invoice_number}>
                    <TableCell className="font-mono text-sm font-medium">{inv.invoice_number}</TableCell>
                    <TableCell>
                      {inv.order_id ? (
                        <Link href={`/orders/${inv.order_id}`} className="font-mono text-sm hover:underline text-blue-600">
                          {inv.po_number}
                        </Link>
                      ) : (
                        <span className="font-mono text-sm text-orange-600">{inv.po_number || "—"}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{inv.sku_code || "—"}</TableCell>
                    <TableCell className="text-sm">{inv.invoice_date || "—"}</TableCell>
                    <TableCell className="text-right font-mono text-sm">${fmt(inv.invoice_amount)}</TableCell>
                    <TableCell className={`text-right font-mono text-sm ${inv.net_received > 0 ? "text-green-600" : ""}`}>
                      {inv.net_received !== 0 ? `$${fmt(inv.net_received)}` : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-red-600">
                      {inv.deductions > 0 ? `-$${fmt(inv.deductions)}` : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {!inv.order_id && (
                          <Badge variant="outline" className="text-orange-600 border-orange-300 text-xs">No Order</Badge>
                        )}
                        {inv.paid ? (
                          <Badge variant="secondary" className="bg-green-100 text-green-800 text-xs">Paid</Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground text-xs">Unpaid</Badge>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
