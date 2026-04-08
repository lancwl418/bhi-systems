export const dynamic = "force-dynamic";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createServiceSupabase } from "@/lib/supabase/server";
import Link from "next/link";

interface CustomerRow {
  name: string;
  email: string;
  phone: string;
  address: string;
  source: string;
  warranty_count: number;
  registration_count: number;
  order_count: number;
}

async function getCustomers(): Promise<CustomerRow[]> {
  const supabase = await createServiceSupabase();
  const customerMap: Record<string, CustomerRow> = {};

  // 1. From warranty records (primary source with email)
  const { data: warranties } = await supabase
    .from("warranties")
    .select("customer_name, customer_email, customer_phone, shipping_address")
    .not("customer_email", "is", null);

  for (const w of warranties ?? []) {
    const email = (w.customer_email || "").toLowerCase();
    if (!email) continue;

    if (!customerMap[email]) {
      const addr = w.shipping_address || {};
      customerMap[email] = {
        name: w.customer_name || "",
        email,
        phone: w.customer_phone || "",
        address: [addr.street, addr.city, addr.province, addr.zip]
          .filter(Boolean)
          .join(", "),
        source: "warranty",
        warranty_count: 0,
        registration_count: 0,
        order_count: 0,
      };
    }
    customerMap[email].warranty_count++;
    // Update name/phone if missing
    if (!customerMap[email].name && w.customer_name) {
      customerMap[email].name = w.customer_name;
    }
    if (!customerMap[email].phone && w.customer_phone) {
      customerMap[email].phone = w.customer_phone;
    }
  }

  // 2. From warranty registrations
  const { data: registrations } = await supabase
    .from("warranty_registrations")
    .select("customer_name, customer_email")
    .not("customer_email", "is", null);

  for (const r of registrations ?? []) {
    const email = (r.customer_email || "").toLowerCase();
    if (!email) continue;

    if (!customerMap[email]) {
      customerMap[email] = {
        name: r.customer_name || "",
        email,
        phone: "",
        address: "",
        source: "registration",
        warranty_count: 0,
        registration_count: 0,
        order_count: 0,
      };
    }
    customerMap[email].registration_count++;
    if (!customerMap[email].name && r.customer_name) {
      customerMap[email].name = r.customer_name;
    }
  }

  // 3. From orders (raw_payload)
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data } = await supabase
      .from("orders")
      .select("raw_payload, shipping_address")
      .not("raw_payload->>customer_name", "is", null)
      .range(from, from + PAGE - 1);
    if (!data || data.length === 0) break;

    for (const order of data) {
      const name = order.raw_payload?.customer_name || "";
      const email = (order.raw_payload?.customer_email || "").toLowerCase();
      const phone = order.raw_payload?.customer_phone || "";

      // Use email if available, otherwise skip (no way to link without email)
      if (!email) continue;

      if (!customerMap[email]) {
        const addr = order.shipping_address || {};
        customerMap[email] = {
          name,
          email,
          phone,
          address: [addr.line1, addr.city, addr.state, addr.zip]
            .filter(Boolean)
            .join(", "),
          source: order.raw_payload?.retailer || "order",
          warranty_count: 0,
          registration_count: 0,
          order_count: 0,
        };
      }
      customerMap[email].order_count++;
    }

    if (data.length < PAGE) break;
    from += PAGE;
  }

  return Object.values(customerMap).sort(
    (a, b) => b.warranty_count + b.registration_count - (a.warranty_count + a.registration_count)
  );
}

export default async function CustomersPage() {
  const customers = await getCustomers();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Customers</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {customers.length} customers total
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Address</TableHead>
                <TableHead className="text-right">Warranties</TableHead>
                <TableHead className="text-right">Registrations</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center text-muted-foreground py-12"
                  >
                    No customers yet.
                  </TableCell>
                </TableRow>
              ) : (
                customers.map((c) => (
                  <TableRow key={c.email} className="cursor-pointer hover:bg-muted/50">
                    <TableCell>
                      <Link
                        href={`/customers/${encodeURIComponent(c.email)}`}
                        className="text-sm font-medium hover:underline"
                      >
                        {c.name || "—"}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {c.email}
                    </TableCell>
                    <TableCell className="text-sm">{c.phone || "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[250px] truncate">
                      {c.address || "—"}
                    </TableCell>
                    <TableCell className="text-right text-sm font-medium">
                      {c.warranty_count > 0 && (
                        <Badge variant="secondary">{c.warranty_count}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-sm">
                      {c.registration_count > 0 && (
                        <Badge variant="outline">{c.registration_count}</Badge>
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
