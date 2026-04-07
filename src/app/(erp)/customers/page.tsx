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
  phone: string;
  company: string;
  address: string;
  retailer: string;
  order_count: number;
  last_order_date: string;
  last_order_id: string;
}

async function getCustomers(): Promise<CustomerRow[]> {
  const supabase = await createServiceSupabase();

  // Fetch all orders that have customer info in raw_payload
  let allOrders: any[] = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data } = await supabase
      .from("orders")
      .select("id, channel_order_id, order_date, shipping_address, raw_payload")
      .not("raw_payload->>customer_name", "is", null)
      .order("order_date", { ascending: false })
      .range(from, from + PAGE - 1);
    if (!data || data.length === 0) break;
    allOrders.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }

  // Group by customer name + phone (dedup key)
  const customerMap: Record<string, CustomerRow> = {};

  for (const order of allOrders) {
    const name = order.raw_payload?.customer_name || "";
    if (!name) continue;

    const phone = order.raw_payload?.customer_phone || "";
    const key = `${name}||${phone}`;

    if (!customerMap[key]) {
      const addr = order.shipping_address || {};
      const addrStr = [addr.line1, addr.city, addr.state, addr.zip]
        .filter(Boolean)
        .join(", ");

      customerMap[key] = {
        name,
        phone,
        company: order.raw_payload?.company || "",
        address: addrStr,
        retailer: order.raw_payload?.retailer || "",
        order_count: 0,
        last_order_date: order.order_date,
        last_order_id: order.id,
      };
    }

    customerMap[key].order_count++;
  }

  return Object.values(customerMap).sort((a, b) => b.order_count - a.order_count);
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
                <TableHead>Phone</TableHead>
                <TableHead>Address</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead>Last Order</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center text-muted-foreground py-12"
                  >
                    No customers yet. Import order PDFs to populate customer data.
                  </TableCell>
                </TableRow>
              ) : (
                customers.map((c, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <div>
                        <p className="text-sm font-medium">{c.name}</p>
                        {c.company && (
                          <p className="text-xs text-muted-foreground">{c.company}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{c.phone || "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[250px] truncate">
                      {c.address || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{c.retailer}</Badge>
                    </TableCell>
                    <TableCell className="text-right text-sm font-medium">
                      {c.order_count}
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/orders/${c.last_order_id}`}
                        className="text-sm hover:underline"
                      >
                        {c.last_order_date?.split("T")[0] || "—"}
                      </Link>
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
