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
import { DollarSign, FileSpreadsheet, AlertTriangle } from "lucide-react";
import { UploadRemittance } from "../upload-remittance";
import { ResolveAllButton, ResolveSingleButton } from "./resolve-button";

interface Props {
  searchParams: Promise<{ view?: string }>;
}

async function getFinanceData() {
  const supabase = await createServiceSupabase();

  const { data: remittances } = await supabase
    .from("remittances")
    .select("*")
    .order("created_at", { ascending: false });

  let invoiceTotal = 0;
  let totalDeductions = 0;
  let totalBalanceDue = 0;
  (remittances ?? []).forEach((r: any) => {
    invoiceTotal += parseFloat(r.total_paid) || 0;
    totalDeductions += parseFloat(r.total_deductions) || 0;
    totalBalanceDue += parseFloat(r.balance_due) || 0;
  });

  // Unmatched lines (have PO but no matching order) — paginate past 1000 limit
  const unmatchedLines: any[] = [];
  let umFrom = 0;
  while (true) {
    const { data } = await supabase
      .from("remittance_lines")
      .select("*, remittances(retailer, payment_date, eft_number, file_name)")
      .is("order_id", null)
      .neq("po_number", "")
      .order("created_at", { ascending: false })
      .range(umFrom, umFrom + 999);
    if (!data || data.length === 0) break;
    unmatchedLines.push(...data);
    if (data.length < 1000) break;
    umFrom += 1000;
  }

  // No-PO adjustments — paginate past 1000 limit
  const noPOLines: any[] = [];
  let npFrom = 0;
  while (true) {
    const { data } = await supabase
      .from("remittance_lines")
      .select("*, remittances(retailer, payment_date, eft_number, file_name)")
      .eq("po_number", "")
      .order("created_at", { ascending: false })
      .range(npFrom, npFrom + 999);
    if (!data || data.length === 0) break;
    noPOLines.push(...data);
    if (data.length < 1000) break;
    npFrom += 1000;
  }

  return {
    remittances: remittances ?? [],
    invoiceTotal,
    totalDeductions,
    totalBalanceDue,
    unmatchedLines: unmatchedLines ?? [],
    noPOLines: noPOLines ?? [],
  };
}

export default async function FinancePage({ searchParams }: Props) {
  const params = await searchParams;
  const data = await getFinanceData();
  const activeView = params.view || "history";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Payments</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Remittance tracking & payment records
          </p>
        </div>
        <UploadRemittance />
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Invoice Total Amount
            </CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${data.invoiceTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Deductions
            </CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              -${data.totalDeductions.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Actual Received
            </CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              ${data.totalBalanceDue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
          </CardContent>
        </Card>

        <Link href="/finance/payments?view=attention">
          <Card className={`cursor-pointer transition-colors hover:border-orange-300 ${activeView === "attention" ? "border-orange-400 bg-orange-50" : ""}`}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Needs Attention
              </CardTitle>
              <AlertTriangle className="h-4 w-4 text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{data.unmatchedLines.length + data.noPOLines.length}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {data.unmatchedLines.length} unmatched PO &middot; {data.noPOLines.length} no PO
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* View tabs */}
      <div className="flex gap-2">
        <Link
          href="/finance/payments"
          className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
            activeView === "history" ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"
          }`}
        >
          Remittance History
        </Link>
        <Link
          href="/finance/payments?view=attention"
          className={`rounded-md border px-3 py-1.5 text-sm transition-colors ${
            activeView === "attention" ? "bg-primary text-primary-foreground border-primary" : "hover:bg-accent"
          }`}
        >
          Needs Attention
          {(data.unmatchedLines.length + data.noPOLines.length) > 0 && (
            <Badge variant="destructive" className="ml-2 text-xs px-1.5 py-0">
              {data.unmatchedLines.length + data.noPOLines.length}
            </Badge>
          )}
        </Link>
      </div>

      {activeView === "history" && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium">Remittance History</CardTitle>
            <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead>Retailer</TableHead>
                  <TableHead>Payment Date</TableHead>
                  <TableHead>EFT Number</TableHead>
                  <TableHead className="text-right">Invoice Total</TableHead>
                  <TableHead className="text-right">Deductions</TableHead>
                  <TableHead className="text-right">Actual Received</TableHead>
                  <TableHead>Uploaded</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.remittances.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-12">
                      No remittances uploaded yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  data.remittances.map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <Link
                          href={`/finance/${r.id}`}
                          className="text-sm font-medium hover:underline text-blue-600"
                        >
                          {r.file_name}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{r.retailer}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">{r.payment_date}</TableCell>
                      <TableCell className="font-mono text-sm">{r.eft_number}</TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        ${parseFloat(r.total_paid).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-red-600">
                        -${parseFloat(r.total_deductions).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-green-600">
                        ${parseFloat(r.balance_due).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(r.created_at).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {activeView === "attention" && (
        <>
          {/* Unmatched PO lines */}
          {data.unmatchedLines.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  Unmatched PO Lines
                  <Badge variant="destructive">{data.unmatchedLines.length}</Badge>
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  These lines have a PO number but no matching order in the system
                </p>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>PO Number</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Invoice #</TableHead>
                      <TableHead>Retailer</TableHead>
                      <TableHead>Payment Date</TableHead>
                      <TableHead>Source File</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.unmatchedLines.map((l: any) => {
                      const amt = parseFloat(l.line_amount);
                      return (
                        <TableRow key={l.id}>
                          <TableCell className="font-mono text-sm font-medium">{l.po_number}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className={
                              l.line_type === "payment" ? "bg-green-100 text-green-800" :
                              "bg-red-100 text-red-800"
                            }>
                              {l.line_type}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-sm text-muted-foreground">
                            {l.invoice_number || l.adjustment_number || "—"}
                          </TableCell>
                          <TableCell className="text-sm">{l.remittances?.retailer}</TableCell>
                          <TableCell className="text-sm">{l.remittances?.payment_date}</TableCell>
                          <TableCell>
                            <Link href={`/finance/${l.remittance_id}`} className="text-sm hover:underline text-blue-600">
                              {l.remittances?.file_name}
                            </Link>
                          </TableCell>
                          <TableCell className={`text-right font-mono text-sm font-medium ${amt < 0 ? "text-red-600" : "text-green-600"}`}>
                            ${amt.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* No-PO adjustments */}
          {data.noPOLines.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    Standalone Adjustments (No PO)
                    <Badge variant="outline" className="text-orange-600 border-orange-300">{data.noPOLines.length}</Badge>
                  </span>
                  <ResolveAllButton />
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Adjustments without a purchase order — try auto-resolve or find individually
                </p>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Adjustment #</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Retailer</TableHead>
                      <TableHead>Source File</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.noPOLines.map((l: any) => {
                      const amt = parseFloat(l.line_amount);
                      return (
                        <TableRow key={l.id}>
                          <TableCell className="font-mono text-sm">{l.adjustment_number || "—"}</TableCell>
                          <TableCell className="text-sm">{l.adjustment_date || "—"}</TableCell>
                          <TableCell className="text-sm">{l.adjustment_reason || "—"}</TableCell>
                          <TableCell className="text-sm">{l.remittances?.retailer}</TableCell>
                          <TableCell>
                            <Link href={`/finance/${l.remittance_id}`} className="text-sm hover:underline text-blue-600">
                              {l.remittances?.file_name}
                            </Link>
                          </TableCell>
                          <TableCell className={`text-right font-mono text-sm font-medium ${amt < 0 ? "text-red-600" : "text-green-600"}`}>
                            ${amt.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell>
                            {l.adjustment_number && <ResolveSingleButton lineId={l.id} />}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {data.unmatchedLines.length === 0 && data.noPOLines.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                All lines are matched. Nothing needs attention.
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
