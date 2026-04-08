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
import { ImportWarrantyRecordsCSV } from "./import-csv";
import Link from "next/link";

const statusColors: Record<string, string> = {
  open: "bg-yellow-100 text-yellow-800",
  diagnosing: "bg-blue-100 text-blue-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  resolved: "bg-gray-100 text-gray-800",
};

const fulfillmentColors: Record<string, string> = {
  fulfilled: "bg-green-100 text-green-800",
  unfulfilled: "bg-yellow-100 text-yellow-800",
  pending: "bg-gray-100 text-gray-800",
};

async function getWarrantyRecords() {
  const supabase = await createServiceSupabase();

  const { data, error } = await supabase
    .from("warranties")
    .select("*, warranty_parts(*)")
    .order("order_date", { ascending: false });

  if (error) {
    console.error("Failed to load warranty records:", error);
    return [];
  }
  return data ?? [];
}

export default async function WarrantyRecordsPage() {
  const records = await getWarrantyRecords();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Warranty Records</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {records.length} records total
          </p>
        </div>
        <ImportWarrantyRecordsCSV />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>No.</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Parts</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Fulfillment</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center text-muted-foreground py-12"
                  >
                    No warranty records yet. Import a CSV to get started.
                  </TableCell>
                </TableRow>
              ) : (
                records.map((r: any) => (
                  <TableRow key={r.id} className="cursor-pointer hover:bg-muted/50">
                    <TableCell className="text-sm font-mono font-medium">
                      <Link href={`/warranties/records/${r.id}`} className="hover:underline">
                        {r.warranty_number || "—"}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="text-sm font-medium">
                          {r.customer_name || "—"}
                        </p>
                        {r.customer_email && (
                          <p className="text-xs text-muted-foreground">
                            {r.customer_email}
                          </p>
                        )}
                        {r.customer_phone && (
                          <p className="text-xs text-muted-foreground">
                            {r.customer_phone}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {(r.warranty_parts || []).map((p: any, i: number) => (
                          <div key={i} className="text-xs">
                            <span className="font-medium">{p.part_name}</span>
                            {p.quantity > 1 && (
                              <span className="text-muted-foreground">
                                {" "}
                                x{p.quantity}
                              </span>
                            )}
                            {p.unit_price > 0 && (
                              <span className="text-muted-foreground">
                                {" "}
                                ${p.unit_price}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs max-w-[300px]">
                      <p className="line-clamp-3 whitespace-pre-wrap">
                        {r.notes || "—"}
                      </p>
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={statusColors[r.status] || ""}
                        variant="secondary"
                      >
                        {r.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {r.fulfillment_status && (
                        <Badge
                          className={
                            fulfillmentColors[r.fulfillment_status] || ""
                          }
                          variant="secondary"
                        >
                          {r.fulfillment_status}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {r.order_date
                        ? new Date(r.order_date).toLocaleDateString()
                        : "—"}
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
