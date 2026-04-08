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

async function fetchAll<T = Record<string, any>>(
  supabase: any, table: string, select: string, filters?: { col: string; op: string; val: any }[],
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  while (true) {
    let q = supabase.from(table).select(select).range(from, from + 999);
    if (filters) {
      for (const f of filters) {
        if (f.op === "neq") q = q.neq(f.col, f.val);
        if (f.op === "not.is") q = q.not(f.col, "is", f.val);
      }
    }
    const { data } = await q;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
  return all;
}

interface InvoiceGroup {
  invoice_number: string;
  po_number: string;
  order_id: string | null;
  order_total: number;
  invoice_amount: number;
  invoice_date: string | null;
  net_received: number;
  deductions: number;
  deduction_lines: { adjustment_number: string; amount: number; reason: string; date: string | null }[];
  eft_number: string;
  retailer: string;
}

async function getInvoiceData() {
  const supabase = await createServiceSupabase();

  // Get all remittance lines with invoice_number (payment lines)
  const paymentLines = await fetchAll(supabase, "remittance_lines",
    "invoice_number, invoice_date, invoice_amount, line_amount, discount, po_number, order_id, eft_number, remittances(retailer), orders(channel_order_id, total)",
    [{ col: "invoice_number", op: "neq", val: "" }]
  );

  // Get all deduction lines (have adjustment_number, linked to orders)
  const deductionLines = await fetchAll(supabase, "remittance_lines",
    "adjustment_number, adjustment_date, adjustment_reason, line_amount, po_number, order_id, eft_number",
    [{ col: "adjustment_number", op: "neq", val: "" }]
  );

  // Build invoice groups
  const invoiceMap: Record<string, InvoiceGroup> = {};

  for (const l of paymentLines) {
    const inv = l.invoice_number;
    if (!inv) continue;
    if (!invoiceMap[inv]) {
      invoiceMap[inv] = {
        invoice_number: inv,
        po_number: l.po_number || "",
        order_id: l.order_id,
        order_total: parseFloat(l.orders?.total) || 0,
        invoice_amount: parseFloat(l.invoice_amount) || 0,
        invoice_date: l.invoice_date,
        net_received: 0,
        deductions: 0,
        deduction_lines: [],
        eft_number: l.eft_number || "",
        retailer: l.remittances?.retailer || "",
      };
    }
    invoiceMap[inv].net_received += parseFloat(l.line_amount) || 0;
    invoiceMap[inv].deductions += parseFloat(l.discount) || 0;
  }

  // Match deductions to invoices via adjustment_number = invoice_number
  for (const l of deductionLines) {
    const adj = l.adjustment_number;
    if (!adj || !invoiceMap[adj]) continue;
    const amt = parseFloat(l.line_amount) || 0;
    invoiceMap[adj].deductions += Math.abs(amt);
    invoiceMap[adj].net_received += amt;
    invoiceMap[adj].deduction_lines.push({
      adjustment_number: adj,
      amount: amt,
      reason: l.adjustment_reason || "",
      date: l.adjustment_date,
    });
  }

  const invoices = Object.values(invoiceMap).sort((a, b) => {
    if (a.invoice_date && b.invoice_date) return b.invoice_date.localeCompare(a.invoice_date);
    return 0;
  });

  // Summary stats
  let totalInvoiced = 0, totalReceived = 0, totalDeducted = 0;
  for (const inv of invoices) {
    totalInvoiced += inv.invoice_amount;
    totalReceived += inv.net_received;
    totalDeducted += inv.deductions;
  }

  return { invoices, totalInvoiced, totalReceived, totalDeducted };
}

function fmt(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default async function InvoicesPage() {
  const data = await getInvoiceData();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Invoices</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Invoice tracking — payments and deductions per invoice
        </p>
      </div>

      {/* Summary */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Invoices</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{data.invoices.length}</p>
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
            <CardTitle className="text-sm font-medium text-muted-foreground">Deductions</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-600">-${fmt(data.totalDeducted)}</p>
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
                <TableHead>Retailer</TableHead>
                <TableHead>Invoice Date</TableHead>
                <TableHead>EFT</TableHead>
                <TableHead className="text-right">Invoice Amount</TableHead>
                <TableHead className="text-right">Deductions</TableHead>
                <TableHead className="text-right">Net Received</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.invoices.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-12">
                    No invoices found
                  </TableCell>
                </TableRow>
              ) : (
                data.invoices.map((inv) => {
                  const hasDeductions = inv.deductions > 0;
                  return (
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
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{inv.retailer || "—"}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">{inv.invoice_date || "—"}</TableCell>
                      <TableCell className="font-mono text-sm text-muted-foreground">{inv.eft_number || "—"}</TableCell>
                      <TableCell className="text-right font-mono text-sm">${fmt(inv.invoice_amount)}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-red-600">
                        {hasDeductions ? `-$${fmt(inv.deductions)}` : "—"}
                      </TableCell>
                      <TableCell className={`text-right font-mono text-sm font-medium ${inv.net_received < 0 ? "text-red-600" : "text-green-600"}`}>
                        ${fmt(inv.net_received)}
                      </TableCell>
                      <TableCell>
                        {hasDeductions ? (
                          <Badge variant="outline" className="text-orange-600 border-orange-300 text-xs">
                            Deducted
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="bg-green-100 text-green-800 text-xs">
                            Paid
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
