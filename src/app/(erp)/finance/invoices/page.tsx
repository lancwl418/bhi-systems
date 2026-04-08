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
  invoice_amount: number;
  sku_code: string | null;
  // From remittance data
  payment_amount: number;
  deductions: number;
  net_received: number;
  paid: boolean;
}

async function getInvoiceData() {
  const supabase = await createServiceSupabase();

  // Get all invoices from order_invoices table
  const invoices = await fetchAll(supabase, "order_invoices",
    "invoice_number, po_number, order_id, invoice_date, invoice_amount, sku_code"
  );

  // Get payment data from remittance_lines (grouped by invoice_number)
  const remittancePayments = await fetchAll(supabase, "remittance_lines",
    "invoice_number, line_amount, discount"
  );

  // Get deduction data (adjustment_number = invoice_number)
  const remittanceDeductions = await fetchAll(supabase, "remittance_lines",
    "adjustment_number, line_amount"
  );

  // Build payment lookup: invoice_number → { payment, deductions }
  const paymentMap: Record<string, { payment: number; discount: number }> = {};
  for (const l of remittancePayments) {
    if (!l.invoice_number) continue;
    if (!paymentMap[l.invoice_number]) paymentMap[l.invoice_number] = { payment: 0, discount: 0 };
    paymentMap[l.invoice_number].payment += parseFloat(l.line_amount) || 0;
    paymentMap[l.invoice_number].discount += parseFloat(l.discount) || 0;
  }

  // Build deduction lookup: adjustment_number (= invoice_number) → total deductions
  const deductionMap: Record<string, number> = {};
  for (const l of remittanceDeductions) {
    if (!l.adjustment_number) continue;
    const amt = parseFloat(l.line_amount) || 0;
    if (amt < 0) {
      if (!deductionMap[l.adjustment_number]) deductionMap[l.adjustment_number] = 0;
      deductionMap[l.adjustment_number] += Math.abs(amt);
    }
  }

  // Combine
  const rows: InvoiceRow[] = invoices.map((inv: any) => {
    const pay = paymentMap[inv.invoice_number];
    const ded = deductionMap[inv.invoice_number] || 0;
    const paymentAmount = pay?.payment || 0;
    const discount = pay?.discount || 0;
    return {
      invoice_number: inv.invoice_number,
      po_number: inv.po_number,
      order_id: inv.order_id,
      invoice_date: inv.invoice_date,
      invoice_amount: parseFloat(inv.invoice_amount) || 0,
      sku_code: inv.sku_code,
      payment_amount: paymentAmount,
      deductions: discount + ded,
      net_received: paymentAmount - ded,
      paid: paymentAmount > 0,
    };
  });

  // Sort by invoice_date desc
  rows.sort((a, b) => {
    if (a.invoice_date && b.invoice_date) return b.invoice_date.localeCompare(a.invoice_date);
    if (a.invoice_date) return -1;
    if (b.invoice_date) return 1;
    return 0;
  });

  // Stats
  let totalInvoiced = 0, totalReceived = 0, totalDeducted = 0;
  let paidCount = 0, unpaidCount = 0;
  for (const r of rows) {
    totalInvoiced += r.invoice_amount;
    totalReceived += r.net_received;
    totalDeducted += r.deductions;
    if (r.paid) paidCount++; else unpaidCount++;
  }

  return { rows, totalInvoiced, totalReceived, totalDeducted, paidCount, unpaidCount };
}

function fmt(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default async function InvoicesPage() {
  const data = await getInvoiceData();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Invoices</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Invoice tracking — {data.rows.length} invoices
          </p>
        </div>
        <UploadInvoices />
      </div>

      {/* Summary */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Invoices</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{data.rows.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Invoiced Amount</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">${fmt(data.totalInvoiced)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Net Received</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">${fmt(data.totalReceived)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Paid</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">{data.paidCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Unpaid</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-orange-600">{data.unpaidCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Invoice Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">All Invoices</CardTitle>
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
                <TableHead>Payment Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-12">
                    No invoices yet. Upload an invoice report to get started.
                  </TableCell>
                </TableRow>
              ) : (
                data.rows.map((inv) => (
                  <TableRow key={inv.invoice_number}>
                    <TableCell className="font-mono text-sm font-medium">{inv.invoice_number}</TableCell>
                    <TableCell>
                      {inv.order_id ? (
                        <Link href={`/orders/${inv.order_id}`} className="font-mono text-sm hover:underline text-blue-600">
                          {inv.po_number}
                        </Link>
                      ) : (
                        <span className="font-mono text-sm">{inv.po_number || "—"}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{inv.sku_code || "—"}</TableCell>
                    <TableCell className="text-sm">{inv.invoice_date ? inv.invoice_date.slice(0, 10) : "—"}</TableCell>
                    <TableCell className="text-right font-mono text-sm">${fmt(inv.invoice_amount)}</TableCell>
                    <TableCell className={`text-right font-mono text-sm ${inv.net_received > 0 ? "text-green-600" : ""}`}>
                      {inv.net_received !== 0 ? `$${fmt(inv.net_received)}` : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-red-600">
                      {inv.deductions > 0 ? `-$${fmt(inv.deductions)}` : "—"}
                    </TableCell>
                    <TableCell>
                      {inv.paid ? (
                        <Badge variant="secondary" className="bg-green-100 text-green-800 text-xs">Paid</Badge>
                      ) : (
                        <Badge variant="outline" className="text-orange-600 border-orange-300 text-xs">Unpaid</Badge>
                      )}
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
