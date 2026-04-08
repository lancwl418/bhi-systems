export const dynamic = "force-dynamic";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createServiceSupabase } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { WarrantyTimeline } from "./timeline";

interface Props {
  params: Promise<{ id: string }>;
}

const statusColors: Record<string, string> = {
  open: "bg-yellow-100 text-yellow-800",
  diagnosing: "bg-blue-100 text-blue-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  resolved: "bg-gray-100 text-gray-800",
};

async function getWarranty(id: string) {
  const supabase = await createServiceSupabase();

  const { data: warranty, error } = await supabase
    .from("warranties")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !warranty) return null;

  const { data: parts } = await supabase
    .from("warranty_parts")
    .select("*")
    .eq("warranty_id", id)
    .order("created_at");

  const { data: comments } = await supabase
    .from("warranty_comments")
    .select("*")
    .eq("warranty_id", id)
    .order("created_at", { ascending: true });

  const { data: registration } = warranty.registration_id
    ? await supabase
        .from("warranty_registrations")
        .select("*")
        .eq("id", warranty.registration_id)
        .single()
    : { data: null };

  return { ...warranty, parts: parts ?? [], comments: comments ?? [], registration };
}

export default async function WarrantyDetailPage({ params }: Props) {
  const { id } = await params;
  const warranty = await getWarranty(id);
  if (!warranty) notFound();

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/warranties/records"
          className="text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold font-mono">
            {warranty.warranty_number || "Warranty"}
          </h2>
          <Badge
            className={statusColors[warranty.status] || ""}
            variant="secondary"
          >
            {warranty.status}
          </Badge>
          {warranty.fulfillment_status && (
            <Badge
              className={
                warranty.fulfillment_status === "fulfilled"
                  ? "bg-green-100 text-green-800"
                  : "bg-yellow-100 text-yellow-800"
              }
              variant="secondary"
            >
              {warranty.fulfillment_status}
            </Badge>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Customer Info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Customer
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="font-medium">{warranty.customer_name || "—"}</p>
            {warranty.customer_email && (
              <p className="text-muted-foreground">{warranty.customer_email}</p>
            )}
            {warranty.customer_phone && (
              <p className="text-muted-foreground">{warranty.customer_phone}</p>
            )}
            {warranty.shipping_address?.street && (
              <div className="text-muted-foreground pt-1 border-t">
                <p>{warranty.shipping_address.street}</p>
                <p>
                  {[
                    warranty.shipping_address.city,
                    warranty.shipping_address.province,
                    warranty.shipping_address.zip,
                  ]
                    .filter(Boolean)
                    .join(", ")}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Order Info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Order Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Date</span>
              <span>
                {warranty.order_date
                  ? new Date(warranty.order_date).toLocaleDateString()
                  : "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>${warranty.subtotal}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Shipping</span>
              <span>${warranty.shipping_cost}</span>
            </div>
            {warranty.discount_code && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Discount</span>
                <span>
                  -${warranty.discount_amount} ({warranty.discount_code})
                </span>
              </div>
            )}
            <div className="flex justify-between font-medium border-t pt-2">
              <span>Total</span>
              <span>${warranty.total}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Payment</span>
              <span>{warranty.financial_status || "—"}</span>
            </div>
          </CardContent>
        </Card>

        {/* Registration */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Registration
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {warranty.registration ? (
              <div className="space-y-2">
                <p className="font-medium">
                  {warranty.registration.customer_name}
                </p>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Indoor</span>
                  <span>{warranty.registration.indoor_model || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Outdoor</span>
                  <span>{warranty.registration.outdoor_model || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Purchased</span>
                  <span>{warranty.registration.purchase_date || "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">From</span>
                  <span>{warranty.registration.purchase_from || "—"}</span>
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground">
                No linked registration
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Parts */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Parts</CardTitle>
        </CardHeader>
        <CardContent>
          {warranty.parts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No parts recorded</p>
          ) : (
            <div className="space-y-2">
              {warranty.parts.map((p: any) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between py-2 border-b last:border-0"
                >
                  <div>
                    <p className="text-sm font-medium">{p.part_name}</p>
                    {p.sku && (
                      <p className="text-xs text-muted-foreground">
                        SKU: {p.sku}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-muted-foreground">x{p.quantity}</span>
                    {p.unit_price > 0 && <span>${p.unit_price}</span>}
                    {p.fulfillment_status && (
                      <Badge
                        className={
                          p.fulfillment_status === "fulfilled"
                            ? "bg-green-100 text-green-800"
                            : "bg-yellow-100 text-yellow-800"
                        }
                        variant="secondary"
                      >
                        {p.fulfillment_status}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Notes */}
      {warranty.notes && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{warranty.notes}</p>
          </CardContent>
        </Card>
      )}

      {/* Timeline / Comments */}
      <WarrantyTimeline
        warrantyId={warranty.id}
        comments={warranty.comments}
      />
    </div>
  );
}
