export const dynamic = "force-dynamic";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createServiceSupabase } from "@/lib/supabase/server";
import Link from "next/link";
import { DollarSign, CreditCard, FileText, BarChart3, AlertTriangle } from "lucide-react";

async function getDashboardData() {
  const supabase = await createServiceSupabase();

  // Run ALL queries in parallel
  const [invoiceTotal, remittanceResult, totalOrders, totalRemittances, matchedLines, unmatchedLines, noPOLines] = await Promise.all([
    // Invoice total (paginated)
    (async () => {
      let total = 0;
      let from = 0;
      while (true) {
        const { data } = await supabase.from("order_invoices").select("invoice_amount").range(from, from + 999);
        if (!data || data.length === 0) break;
        for (const d of data) total += parseFloat(d.invoice_amount) || 0;
        if (data.length < 1000) break;
        from += 1000;
      }
      return total;
    })(),
    supabase.from("remittances").select("total_deductions, balance_due"),
    supabase.from("orders").select("*", { count: "exact", head: true }),
    supabase.from("remittances").select("*", { count: "exact", head: true }),
    supabase.from("remittance_lines").select("*", { count: "exact", head: true }).not("order_id", "is", null),
    supabase.from("remittance_lines").select("*", { count: "exact", head: true }).is("order_id", null).neq("po_number", ""),
    supabase.from("remittance_lines").select("*", { count: "exact", head: true }).is("order_id", null).eq("po_number", ""),
  ]);

  let totalDeductions = 0, totalReceived = 0;
  (remittanceResult.data ?? []).forEach((r: any) => {
    totalDeductions += parseFloat(r.total_deductions) || 0;
    totalReceived += parseFloat(r.balance_due) || 0;
  });

  return { invoiceTotal, totalDeductions, totalReceived, totalOrders: totalOrders.count || 0, totalRemittances: totalRemittances.count || 0, matchedLines: matchedLines.count || 0, unmatchedLines: unmatchedLines.count || 0, noPOLines: noPOLines.count || 0 };
}

function fmt(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default async function FinanceDashboardPage() {
  const data = await getDashboardData();
  const attentionCount = data.unmatchedLines + data.noPOLines;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Finance</h2>
        <p className="text-sm text-muted-foreground mt-1">Overview of payments, invoices, and reconciliation</p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Invoice Total</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">${fmt(data.invoiceTotal)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Deductions</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-600">-${fmt(data.totalDeductions)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Net Received</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">${fmt(data.totalReceived)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Matched Lines</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{data.matchedLines.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">of {(data.matchedLines + data.unmatchedLines + data.noPOLines).toLocaleString()} total</p>
          </CardContent>
        </Card>
      </div>

      {/* Sub-sections */}
      <div className="grid gap-4 md:grid-cols-3">
        <Link href="/finance/payments">
          <Card className="cursor-pointer transition-colors hover:border-primary/50">
            <CardHeader className="flex flex-row items-center gap-3">
              <CreditCard className="h-5 w-5 text-muted-foreground" />
              <div>
                <CardTitle className="text-base">Payments</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">Remittance history & upload</p>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{data.totalRemittances}</p>
              <p className="text-xs text-muted-foreground">remittance records</p>
              {attentionCount > 0 && (
                <div className="flex items-center gap-1 mt-2 text-orange-600 text-xs font-medium">
                  <AlertTriangle className="h-3 w-3" />
                  {attentionCount} need attention
                </div>
              )}
            </CardContent>
          </Card>
        </Link>

        <Link href="/finance/invoices">
          <Card className="cursor-pointer transition-colors hover:border-primary/50">
            <CardHeader className="flex flex-row items-center gap-3">
              <FileText className="h-5 w-5 text-muted-foreground" />
              <div>
                <CardTitle className="text-base">Invoices</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">Invoice tracking by order</p>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{data.totalOrders.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">orders</p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/finance/reconciliation">
          <Card className="cursor-pointer transition-colors hover:border-primary/50">
            <CardHeader className="flex flex-row items-center gap-3">
              <BarChart3 className="h-5 w-5 text-muted-foreground" />
              <div>
                <CardTitle className="text-base">Reconciliation</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">Monthly order vs payment</p>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-2 rounded-full bg-muted overflow-hidden mt-1">
                <div className="h-full rounded-full bg-green-500" style={{ width: `${data.invoiceTotal > 0 ? Math.min((data.totalReceived / data.invoiceTotal) * 100, 100) : 0}%` }} />
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {data.invoiceTotal > 0 ? ((data.totalReceived / data.invoiceTotal) * 100).toFixed(1) : 0}% collected
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
