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

async function getReturnsData() {
  const supabase = await createServiceSupabase();

  const all: any[] = [];
  let from = 0;
  while (true) {
    const { data } = await supabase
      .from("returns")
      .select("*, orders(channel_order_id, total, raw_payload)")
      .order("created_at", { ascending: false })
      .range(from, from + 999);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }

  let totalAmount = 0;
  let pendingCount = 0;
  let confirmedCount = 0;
  for (const r of all) {
    totalAmount += Math.abs(parseFloat(r.amount) || 0);
    if (r.status === "pending") pendingCount++;
    else if (r.status === "confirmed") confirmedCount++;
  }

  return { returns: all, totalAmount, pendingCount, confirmedCount };
}

function fmt(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  confirmed: "bg-red-100 text-red-800",
  disputed: "bg-blue-100 text-blue-800",
};

export default async function ReturnsPage() {
  const data = await getReturnsData();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Returns</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Return deductions linked to orders and invoices
        </p>
      </div>

      {/* Summary */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Returns</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{data.returns.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Amount</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-600">-${fmt(data.totalAmount)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-yellow-600">{data.pendingCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Confirmed</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-600">{data.confirmedCount}</p>
          </CardContent>
        </Card>
      </div>

      {/* Returns Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">All Returns</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PO Number</TableHead>
                <TableHead>Invoice #</TableHead>
                <TableHead>Adjustment #</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Retailer</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.returns.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-12">
                    No returns yet. Use Auto-resolve on the Payments page to match adjustments.
                  </TableCell>
                </TableRow>
              ) : (
                data.returns.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      {r.order_id ? (
                        <Link href={`/orders/${r.order_id}`} className="font-mono text-sm hover:underline text-blue-600">
                          {r.po_number || r.orders?.channel_order_id}
                        </Link>
                      ) : (
                        <span className="font-mono text-sm text-muted-foreground">{r.po_number || "—"}</span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-sm">{r.invoice_number || "—"}</TableCell>
                    <TableCell className="font-mono text-sm">{r.adjustment_number}</TableCell>
                    <TableCell className="text-sm">{r.adjustment_date || "—"}</TableCell>
                    <TableCell className="text-sm">{r.adjustment_reason || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{r.retailer || "—"}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm font-medium text-red-600">
                      ${fmt(Math.abs(parseFloat(r.amount) || 0))}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={statusColors[r.status] || ""}>
                        {r.status}
                      </Badge>
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
