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
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

interface Props {
  params: Promise<{ id: string }>;
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

async function getOrder(id: string) {
  const supabase = await createServiceSupabase();

  const { data: order, error } = await supabase
    .from("orders")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !order) return null;

  const { data: items } = await supabase
    .from("order_items")
    .select("*")
    .eq("order_id", id)
    .order("sku_code");

  const { data: shipments } = await supabase
    .from("shipments")
    .select("*")
    .eq("order_id", id)
    .order("created_at", { ascending: false });

  const { data: payments } = await supabase
    .from("remittance_lines")
    .select("*, remittances(retailer, payment_date, eft_number, file_name)")
    .eq("order_id", id)
    .order("created_at");

  // Payment summary
  let totalPaid = 0;
  let totalDeducted = 0;
  (payments ?? []).forEach((p: any) => {
    const amt = parseFloat(p.line_amount) || 0;
    if (amt >= 0) totalPaid += amt;
    else totalDeducted += Math.abs(amt);
  });

  return {
    ...order,
    items: items ?? [],
    shipments: shipments ?? [],
    payments: payments ?? [],
    totalPaid,
    totalDeducted,
    netPayment: totalPaid - totalDeducted,
  };
}

export default async function OrderDetailPage({ params }: Props) {
  const { id } = await params;
  const order = await getOrder(id);

  if (!order) notFound();

  const consumerOrder = order.raw_payload?.consumer_order || order.buyer_id || "—";
  const retailer = order.raw_payload?.retailer || order.channel_source;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/orders"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h2 className="text-2xl font-bold font-mono">{order.channel_order_id}</h2>
          <p className="text-sm text-muted-foreground">
            {retailer} &middot; Consumer Order: {consumerOrder}
          </p>
        </div>
        <Badge
          variant="secondary"
          className={`text-sm px-3 py-1 ${statusColors[order.status] || ""}`}
        >
          {order.status}
        </Badge>
      </div>

      {/* Order Info Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Order Date
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-medium">{order.order_date}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Ship By
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-medium">
              {order.ship_by_date
                ? new Date(order.ship_by_date).toLocaleDateString()
                : "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Channel
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant="outline">{retailer}</Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">${order.total?.toFixed(2)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Customer & Shipping Info */}
      <div className="grid gap-4 md:grid-cols-2">
        {order.raw_payload?.customer_name && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Customer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <p className="text-sm font-medium">{order.raw_payload.customer_name}</p>
              {order.raw_payload.company && (
                <p className="text-sm text-muted-foreground">{order.raw_payload.company}</p>
              )}
              {order.raw_payload.customer_phone && (
                <p className="text-sm text-muted-foreground">{order.raw_payload.customer_phone}</p>
              )}
              {order.raw_payload.address_type && (
                <Badge variant="outline" className="mt-1">{order.raw_payload.address_type}</Badge>
              )}
            </CardContent>
          </Card>
        )}

        {order.shipping_address?.line1 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Shipping Address</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <p className="text-sm">{order.shipping_address.line1}</p>
              {order.shipping_address.line2 && (
                <p className="text-sm">{order.shipping_address.line2}</p>
              )}
              <p className="text-sm">
                {order.shipping_address.city}, {order.shipping_address.state} {order.shipping_address.zip}
              </p>
              {order.shipping_method && (
                <p className="text-sm text-muted-foreground mt-2">
                  Ship via: {order.shipping_method}
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Order Items */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Order Items ({order.items.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead>
                <TableHead className="w-[400px]">Product</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Unit Price</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {order.items.map((item: any) => (
                <TableRow key={item.id}>
                  <TableCell className="font-mono text-sm">
                    {item.sku_code}
                  </TableCell>
                  <TableCell>
                    <p className="text-sm">{item.product_name}</p>
                  </TableCell>
                  <TableCell className="text-right">{item.quantity}</TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    ${item.unit_price?.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm font-medium">
                    ${item.total_price?.toFixed(2)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Shipments */}
      {order.shipments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Shipments</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Carrier</TableHead>
                  <TableHead>Tracking</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Shipped</TableHead>
                  <TableHead>Delivered</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.shipments.map((s: any) => (
                  <TableRow key={s.id}>
                    <TableCell>{s.carrier}</TableCell>
                    <TableCell className="font-mono text-sm">
                      {s.tracking_number}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{s.status}</Badge>
                    </TableCell>
                    <TableCell>{s.shipped_date ?? "—"}</TableCell>
                    <TableCell>{s.delivered_date ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Payment / Remittance */}
      {order.payments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center justify-between">
              <span>Payment Records ({order.payments.length})</span>
              <span className="text-sm font-mono">
                Net: <span className={order.netPayment >= 0 ? "text-green-600" : "text-red-600"}>
                  ${order.netPayment.toFixed(2)}
                </span>
                {" "}/ Order Total: ${order.total?.toFixed(2)}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>EFT / File</TableHead>
                  <TableHead>Payment Date</TableHead>
                  <TableHead>Invoice #</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Discount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.payments.map((p: any) => {
                  const amt = parseFloat(p.line_amount);
                  return (
                    <TableRow key={p.id}>
                      <TableCell>
                        <Badge variant="secondary" className={
                          p.line_type === "payment" ? "bg-green-100 text-green-800" :
                          p.line_type === "deduction" ? "bg-red-100 text-red-800" :
                          "bg-orange-100 text-orange-800"
                        }>
                          {p.line_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        <Link href={`/finance/${p.remittance_id}`} className="hover:underline text-blue-600">
                          {p.remittances?.eft_number || p.remittances?.file_name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm">{p.remittances?.payment_date || "—"}</TableCell>
                      <TableCell className="font-mono text-sm">{p.invoice_number || p.adjustment_number || "—"}</TableCell>
                      <TableCell className={`text-right font-mono text-sm font-medium ${amt < 0 ? "text-red-600" : "text-green-600"}`}>
                        ${amt.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground">
                        {parseFloat(p.discount) > 0 ? `-$${parseFloat(p.discount).toFixed(2)}` : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Notes */}
      {order.notes && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{order.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
