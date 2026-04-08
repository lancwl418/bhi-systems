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
import { ImportWarrantyCSV } from "./import-csv";

async function getRegistrations() {
  const supabase = await createServiceSupabase();

  const { data, error } = await supabase
    .from("warranty_registrations")
    .select("*")
    .order("submitted_at", { ascending: false });

  if (error) {
    console.error("Failed to load warranty registrations:", error);
    return [];
  }
  return data ?? [];
}

export default async function WarrantyRegistrationPage() {
  const registrations = await getRegistrations();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Warranty Registration</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {registrations.length} registrations total
          </p>
        </div>
        <ImportWarrantyCSV />
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Indoor Model</TableHead>
                <TableHead>Outdoor Model</TableHead>
                <TableHead>Purchase From</TableHead>
                <TableHead>Order #</TableHead>
                <TableHead>Purchase Date</TableHead>
                <TableHead>Submitted</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {registrations.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center text-muted-foreground py-12"
                  >
                    No warranty registrations yet. Import a CSV to get started.
                  </TableCell>
                </TableRow>
              ) : (
                registrations.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div>
                        <p className="text-sm font-medium">{r.customer_name}</p>
                        {r.customer_email && (
                          <p className="text-xs text-muted-foreground">
                            {r.customer_email}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="text-sm">{r.indoor_model || "—"}</p>
                        {r.indoor_serial && (
                          <p className="text-xs text-muted-foreground">
                            S/N: {r.indoor_serial}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className="text-sm">{r.outdoor_model || "—"}</p>
                        {r.outdoor_serial && (
                          <p className="text-xs text-muted-foreground">
                            S/N: {r.outdoor_serial}
                          </p>
                        )}
                      </div>
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
                    <TableCell className="text-sm text-muted-foreground">
                      {r.submitted_at
                        ? new Date(r.submitted_at).toLocaleDateString()
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
