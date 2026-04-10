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
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CustomerEditForm } from "./edit-form";

interface Props {
  params: Promise<{ email: string }>;
}

async function getCustomerData(email: string) {
  const supabase = await createServiceSupabase();

  // Get customer record from customers table (by email)
  const { data: customerRecord } = await supabase
    .from("customers")
    .select("*")
    .eq("email", email)
    .limit(1)
    .maybeSingle();

  // Get warranty records for this email
  const { data: warranties } = await supabase
    .from("warranties")
    .select("*, warranty_parts(*)")
    .eq("customer_email", email)
    .order("order_date", { ascending: false });

  // Get warranty registrations for this email
  const { data: registrations } = await supabase
    .from("warranty_registrations")
    .select("*")
    .eq("customer_email", email)
    .order("submitted_at", { ascending: false });

  // Get orders linked to this customer (via customer_id or raw_payload email)
  let orders: any[] = [];
  if (customerRecord) {
    const { data } = await supabase
      .from("orders")
      .select("id, channel_order_id, channel_source, order_date, status, total, raw_payload, shipping_address")
      .eq("customer_id", customerRecord.id)
      .order("order_date", { ascending: false });
    orders = data ?? [];
  }

  if (
    (!warranties || warranties.length === 0) &&
    (!registrations || registrations.length === 0) &&
    !customerRecord &&
    orders.length === 0
  ) {
    return null;
  }

  // Derive customer info — prefer customers table, then warranty, then registration
  const w = warranties?.[0];
  const r = registrations?.[0];

  return {
    email,
    name: customerRecord?.name || w?.customer_name || r?.customer_name || "",
    phone: customerRecord?.phone || w?.customer_phone || "",
    address: customerRecord?.address || w?.shipping_address || {},
    warranties: warranties ?? [],
    registrations: registrations ?? [],
    orders,
  };
}

const statusColors: Record<string, string> = {
  open: "bg-yellow-100 text-yellow-800",
  diagnosing: "bg-blue-100 text-blue-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  resolved: "bg-gray-100 text-gray-800",
  pending: "bg-yellow-100 text-yellow-800",
  shipped: "bg-green-100 text-green-800",
  delivered: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-red-100 text-red-800",
};

export default async function CustomerDetailPage({ params }: Props) {
  const { email: rawEmail } = await params;
  const email = decodeURIComponent(rawEmail);
  const customer = await getCustomerData(email);
  if (!customer) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/customers"
          className="text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h2 className="text-2xl font-bold">
          {customer.name || customer.email}
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Customer Info (editable) */}
        <CustomerEditForm
          email={customer.email}
          initialName={customer.name}
          initialPhone={customer.phone}
          address={customer.address}
        />

        {/* Stats */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Warranty Records</span>
              <span className="font-medium">{customer.warranties.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Registrations</span>
              <span className="font-medium">
                {customer.registrations.length}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total Parts Cost</span>
              <span className="font-medium">
                $
                {customer.warranties
                  .reduce((sum: number, w: any) => sum + Number(w.total || 0), 0)
                  .toFixed(2)}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Warranty Records */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">
            Warranty Records ({customer.warranties.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>No.</TableHead>
                <TableHead>Parts</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customer.warranties.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center text-muted-foreground py-8"
                  >
                    No warranty records
                  </TableCell>
                </TableRow>
              ) : (
                customer.warranties.map((w: any) => (
                  <TableRow key={w.id}>
                    <TableCell className="font-mono text-sm">
                      <Link
                        href={`/warranties/records/${w.id}`}
                        className="hover:underline font-medium"
                      >
                        {w.warranty_number || "—"}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-0.5">
                        {(w.warranty_parts || []).map((p: any, i: number) => (
                          <p key={i} className="text-xs">
                            {p.part_name}
                            {p.quantity > 1 && ` x${p.quantity}`}
                          </p>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs max-w-[250px]">
                      <p className="line-clamp-2">{w.notes || "—"}</p>
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={statusColors[w.status] || ""}
                        variant="secondary"
                      >
                        {w.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {w.order_date
                        ? new Date(w.order_date).toLocaleDateString()
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Orders */}
      {customer.orders.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">
              Orders ({customer.orders.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>PO Number</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Order Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Shipping Address</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customer.orders.map((o: any) => {
                  const addr = o.shipping_address || {};
                  const addrLine = [
                    addr.line1 || addr.address1,
                    addr.city,
                    addr.state,
                  ].filter(Boolean).join(", ");
                  return (
                    <TableRow key={o.id}>
                      <TableCell className="font-mono text-sm">
                        <Link
                          href={`/orders/${o.id}`}
                          className="hover:underline text-blue-600 font-medium"
                        >
                          {o.channel_order_id}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {o.raw_payload?.retailer || o.channel_source}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {o.order_date ? new Date(o.order_date).toLocaleDateString() : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={statusColors[o.status] || ""}
                          variant="secondary"
                        >
                          {o.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                        {addrLine || "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm font-medium">
                        ${parseFloat(o.total || 0).toFixed(2)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Registrations */}
      {customer.registrations.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">
              Registrations ({customer.registrations.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Indoor Model</TableHead>
                  <TableHead>Outdoor Model</TableHead>
                  <TableHead>Purchase From</TableHead>
                  <TableHead>Order #</TableHead>
                  <TableHead>Purchase Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customer.registrations.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm">
                      {r.indoor_model || "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.outdoor_model || "—"}
                    </TableCell>
                    <TableCell>
                      {r.purchase_from ? (
                        <Badge variant="outline">{r.purchase_from}</Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.order_number || "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.purchase_date || "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
