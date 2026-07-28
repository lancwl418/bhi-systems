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
import { ArrowLeft } from "lucide-react";
import { ModelSearchForm } from "./search-form";
import { ModelSearchExportButton, type ModelSearchExportRow } from "./export-button";

interface Props {
  searchParams: Promise<{ q?: string; model?: string }>;
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

const ITEM_LIMIT = 5000;

type ModelSearchRow = ModelSearchExportRow & { orderId: string };

interface MatchedItem {
  order_id: string;
  sku_code: string | null;
  product_name: string | null;
  quantity: number | null;
  unit_price: number | null;
  total_price: number | null;
}

// PostgREST `.or()` / `.ilike()` treat commas/parens/asterisks as syntax; strip
// them so the keyword (model number or customer name) keeps the filter well-formed.
function sanitizeTerm(raw: string): string {
  return raw.replace(/[,()*]/g, " ").trim();
}

async function searchOrders(rawTerm: string) {
  const term = sanitizeTerm(rawTerm);
  if (!term) return { rows: [] as ModelSearchRow[], orderCount: 0, truncated: false };

  const supabase = await createServiceSupabase();

  // Path A: line items whose SKU / model or product name matches the keyword.
  const { data: itemData, error: itemError } = await supabase
    .from("order_items")
    .select("order_id, sku_code, product_name, quantity, unit_price, total_price")
    .or(`sku_code.ilike.%${term}%,product_name.ilike.%${term}%`)
    .limit(ITEM_LIMIT);
  if (itemError) throw itemError;

  const items = (itemData ?? []) as MatchedItem[];
  const itemOrderIds = new Set(items.map((i) => i.order_id));

  // The keyword also matches anywhere on the order itself. Collect those order
  // ids from two sources.
  const orderMatchIds = new Set<string>();

  // Path B: the related customer record (name / email / phone), reached through
  // orders.customer_id.
  const { data: custRows, error: custError } = await supabase
    .from("customers")
    .select("id")
    .or(`name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`)
    .limit(ITEM_LIMIT);
  if (custError) throw custError;
  const custIds = (custRows ?? []).map((c) => c.id as string);
  for (let i = 0; i < custIds.length; i += 200) {
    const { data, error } = await supabase
      .from("orders")
      .select("id")
      .in("customer_id", custIds.slice(i, i + 200))
      .limit(ITEM_LIMIT);
    if (error) throw error;
    for (const o of data ?? []) orderMatchIds.add(o.id);
  }

  // Path C: any text field on the order itself — PO / tracking / carrier / notes,
  // the shipping address, and the raw_payload customer fields.
  const orderTextFilter = [
    "channel_order_id",
    "tracking_number",
    "carrier",
    "notes",
    "buyer_id",
    "shipping_address->>name",
    "shipping_address->>company",
    "shipping_address->>line1",
    "shipping_address->>address1",
    "shipping_address->>line2",
    "shipping_address->>address2",
    "shipping_address->>line3",
    "shipping_address->>address3",
    "shipping_address->>city",
    "shipping_address->>state",
    "shipping_address->>zip",
    "shipping_address->>postal_code",
    "shipping_address->>country",
    "raw_payload->>customer_name",
    "raw_payload->>customer_email",
    "raw_payload->>customer_phone",
    "raw_payload->>consumer_order",
    "raw_payload->>retailer",
  ]
    .map((col) => `${col}.ilike.%${term}%`)
    .join(",");
  const { data: orderMatches, error: orderMatchError } = await supabase
    .from("orders")
    .select("id")
    .or(orderTextFilter)
    .limit(ITEM_LIMIT);
  if (orderMatchError) throw orderMatchError;
  for (const o of orderMatches ?? []) orderMatchIds.add(o.id);

  // Load every line of order-level matches not already surfaced by path A
  // (no specific line matched, so show the whole order).
  const extraOrderIds = [...orderMatchIds].filter((id) => !itemOrderIds.has(id));
  for (let i = 0; i < extraOrderIds.length; i += 200) {
    const { data, error } = await supabase
      .from("order_items")
      .select("order_id, sku_code, product_name, quantity, unit_price, total_price")
      .in("order_id", extraOrderIds.slice(i, i + 200));
    if (error) throw error;
    items.push(...((data ?? []) as MatchedItem[]));
  }

  const orderIds = [...new Set(items.map((i) => i.order_id))];
  if (orderIds.length === 0) {
    return { rows: [] as ModelSearchRow[], orderCount: 0, truncated: false };
  }

  const orderById = new Map<string, Record<string, any>>();
  for (let i = 0; i < orderIds.length; i += 200) {
    const batch = orderIds.slice(i, i + 200);
    const { data, error } = await supabase
      .from("orders")
      .select(
        "id, channel_order_id, channel_source, buyer_id, status, total, order_date, shipping_address, raw_payload, customer:customers(name, email, phone)"
      )
      .in("id", batch);
    if (error) throw error;
    for (const order of data ?? []) orderById.set(order.id, order);
  }

  const rows: ModelSearchRow[] = items
    .map((item): ModelSearchRow | null => {
      const order = orderById.get(item.order_id);
      if (!order) return null;
      const raw = order.raw_payload ?? {};
      const customer = Array.isArray(order.customer) ? order.customer[0] : order.customer;
      const ship = order.shipping_address ?? {};
      return {
        poNumber: order.channel_order_id ?? "",
        consumerOrder: raw.consumer_order || order.buyer_id || "",
        channel: raw.retailer || order.channel_source || "",
        status: order.status ?? "",
        orderDate: order.order_date ?? "",
        orderTotal: order.total ?? null,
        skuCode: item.sku_code ?? "",
        productName: item.product_name ?? "",
        quantity: item.quantity ?? null,
        unitPrice: item.unit_price ?? null,
        lineTotal: item.total_price ?? null,
        customerName: customer?.name || raw.customer_name || "",
        customerEmail: customer?.email || raw.customer_email || "",
        customerPhone: customer?.phone || raw.customer_phone || "",
        shipAddress1: ship.line1 || ship.address1 || "",
        shipAddress2: ship.line2 || ship.address2 || "",
        shipAddress3: ship.line3 || ship.address3 || "",
        shipCity: ship.city || "",
        shipState: ship.state || "",
        shipZip: ship.zip || ship.postal_code || "",
        shipCountry: ship.country || "",
        orderId: order.id,
      };
    })
    .filter((r): r is ModelSearchRow => r !== null)
    .sort((a, b) => (a.orderDate < b.orderDate ? 1 : -1));

  return { rows, orderCount: orderById.size, truncated: items.length >= ITEM_LIMIT };
}

export default async function OrdersByModelPage({ searchParams }: Props) {
  const params = await searchParams;
  const query = (params.q ?? params.model ?? "").trim();
  const { rows, orderCount, truncated } = query
    ? await searchOrders(query)
    : { rows: [] as ModelSearchRow[], orderCount: 0, truncated: false };

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
          <h2 className="text-2xl font-bold">Search Orders</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {query
              ? `${orderCount.toLocaleString()} order(s) · ${rows.length.toLocaleString()} matching line(s) for "${query}"`
              : "Search anything on an order — model / SKU, customer, PO, tracking, or address — and export the results."}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <ModelSearchForm initialQuery={query} />
        <ModelSearchExportButton rows={rows} keyword={query} />
      </div>

      {truncated && (
        <p className="text-sm text-orange-600">
          Showing the first {ITEM_LIMIT.toLocaleString()} matching lines. Refine the keyword to narrow results.
        </p>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>PO Number</TableHead>
                <TableHead>SKU / Model</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Order Date</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Email / Phone</TableHead>
                <TableHead>Ship To</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-12">
                    {query ? "No orders found for this keyword." : "Enter a keyword — model, customer, PO, tracking, or address."}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row, idx) => {
                  return (
                    <TableRow key={`${row.orderId}-${idx}`}>
                      <TableCell>
                        <Link
                          href={`/orders/${row.orderId}`}
                          className="font-mono text-sm hover:underline font-medium"
                        >
                          {row.poNumber}
                        </Link>
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {row.skuCode}
                        {row.productName && (
                          <span className="block text-xs text-muted-foreground font-sans truncate max-w-[220px]">
                            {row.productName}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">{row.quantity ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{row.channel}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className={statusColors[row.status] || ""}>
                          {row.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{row.orderDate}</TableCell>
                      <TableCell className="text-sm">{row.customerName || "—"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {row.customerEmail && <span className="block">{row.customerEmail}</span>}
                        {row.customerPhone && <span className="block">{row.customerPhone}</span>}
                        {!row.customerEmail && !row.customerPhone && "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {row.shipAddress1 && <span className="block">{row.shipAddress1}</span>}
                        {row.shipAddress2 && <span className="block">{row.shipAddress2}</span>}
                        {row.shipAddress3 && <span className="block">{row.shipAddress3}</span>}
                        {(row.shipCity || row.shipState || row.shipZip) && (
                          <span className="block">
                            {[row.shipCity, row.shipState].filter(Boolean).join(", ")} {row.shipZip}
                          </span>
                        )}
                        {row.shipCountry && row.shipCountry !== "US" && (
                          <span className="block">{row.shipCountry}</span>
                        )}
                        {!row.shipAddress1 && !row.shipCity && "—"}
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
