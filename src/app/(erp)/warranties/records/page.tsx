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

const statusColors: Record<string, string> = {
  open: "bg-yellow-100 text-yellow-800",
  diagnosing: "bg-blue-100 text-blue-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  resolved: "bg-gray-100 text-gray-800",
};

async function getWarrantyRecords() {
  const supabase = await createServiceSupabase();

  const { data, error } = await supabase
    .from("warranties")
    .select(
      "*, warranty_registrations(customer_name, customer_email)"
    )
    .order("created_at", { ascending: false });

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
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Resolution</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center text-muted-foreground py-12"
                  >
                    No warranty records yet.
                  </TableCell>
                </TableRow>
              ) : (
                records.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div>
                        <p className="text-sm font-medium">
                          {r.warranty_registrations?.customer_name || "—"}
                        </p>
                        {r.warranty_registrations?.customer_email && (
                          <p className="text-xs text-muted-foreground">
                            {r.warranty_registrations.customer_email}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.claim_type || "—"}
                    </TableCell>
                    <TableCell className="text-sm max-w-[300px] truncate">
                      {r.description || "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={statusColors[r.status] || ""}
                        variant="secondary"
                      >
                        {r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm max-w-[200px] truncate">
                      {r.resolution || "—"}
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
    </div>
  );
}
