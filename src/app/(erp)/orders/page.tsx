export const dynamic = "force-dynamic";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { createServiceSupabase } from "@/lib/supabase/server";
import Link from "next/link";
import { OrderFilters } from "./filters";
import { ImportCSV } from "./import-csv";
import { ImportPDF } from "./import-pdf";

interface Props {
  searchParams: Promise<{ status?: string; search?: string; page?: string }>;
}

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  acknowledged: "bg-blue-100 text-blue-800",
  processing: "bg-indigo-100 text-indigo-800",
  shipped: "bg-green-100 text-green-800",
  delivered: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-red-100 text-red-800",
  returned: "bg-orange-100 text-orange-800",
};

const PAGE_SIZE = 50;

async function getOrders(filters: { status?: string; search?: string; page?: string }) {
  const supabase = await createServiceSupabase();
  const page = parseInt(filters.page || "1");
  const offset = (page - 1) * PAGE_SIZE;

  let query = supabase
    .from("orders")
    .select("id, channel_source, channel_order_id, buyer_id, status, total, order_date, raw_payload", { count: "exact" })
    .order("order_date", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  if (filters.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }
  if (filters.search) {
    query = query.or(
      `channel_order_id.ilike.%${filters.search}%,buyer_id.ilike.%${filters.search}%`
    );
  }

  const { data, count, error } = await query;
  if (error) throw error;

  return { orders: data ?? [], total: count ?? 0, page, totalPages: Math.ceil((count ?? 0) / PAGE_SIZE) };
}

async function getStatusCounts() {
  const supabase = await createServiceSupabase();
  const { data } = await supabase.from("orders").select("status");
  const counts: Record<string, number> = { all: 0 };
  data?.forEach((o: { status: string }) => {
    counts.all++;
    counts[o.status] = (counts[o.status] || 0) + 1;
  });
  return counts;
}

export default async function OrdersPage({ searchParams }: Props) {
  const params = await searchParams;
  const [{ orders, total, page, totalPages }, statusCounts] = await Promise.all([
    getOrders(params),
    getStatusCounts(),
  ]);

  const activeStatus = params.status || "all";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Orders</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {total.toLocaleString()} orders total
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ImportPDF />
          <ImportCSV />
        </div>
      </div>

      <OrderFilters statusCounts={statusCounts} />

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PO Number</TableHead>
                <TableHead>Consumer Order</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Order Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center text-muted-foreground py-12"
                  >
                    No orders found.
                  </TableCell>
                </TableRow>
              ) : (
                orders.map((order: any) => {
                  const consumerOrder = order.raw_payload?.consumer_order || order.buyer_id || "—";
                  return (
                    <TableRow key={order.id}>
                      <TableCell>
                        <Link
                          href={`/orders/${order.id}`}
                          className="font-mono text-sm hover:underline font-medium"
                        >
                          {order.channel_order_id}
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {consumerOrder}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {order.raw_payload?.retailer || order.channel_source}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={statusColors[order.status] || ""}
                        >
                          {order.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        ${order.total?.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {order.order_date}
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={`/orders?${new URLSearchParams({ ...params, page: String(page - 1) }).toString()}`}
                className="inline-flex items-center justify-center rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
              >
                Previous
              </Link>
            )}
            {page < totalPages && (
              <Link
                href={`/orders?${new URLSearchParams({ ...params, page: String(page + 1) }).toString()}`}
                className="inline-flex items-center justify-center rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
              >
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
