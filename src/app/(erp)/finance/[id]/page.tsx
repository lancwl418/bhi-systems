import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createServiceSupabase } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { LineTabs } from "./line-tabs";
import { DeleteRemittanceButton } from "./delete-button";

interface Props {
  params: Promise<{ id: string }>;
}

async function getRemittance(id: string) {
  const supabase = await createServiceSupabase();

  // Fetch remittance and its lines in parallel
  const [remittanceResult, allLines] = await Promise.all([
    supabase.from("remittances").select("*").eq("id", id).single(),
    (async () => {
      const lines: any[] = [];
      let from = 0;
      while (true) {
        const { data } = await supabase
          .from("remittance_lines")
          .select("*, orders(channel_order_id, status, total)")
          .eq("remittance_id", id)
          .order("line_number")
          .range(from, from + 999);
        if (!data || data.length === 0) break;
        lines.push(...data);
        if (data.length < 1000) break;
        from += 1000;
      }
      return lines;
    })(),
  ]);

  if (!remittanceResult.data) return null;
  return { ...remittanceResult.data, lines: allLines };
}

export default async function RemittanceDetailPage({ params }: Props) {
  const { id } = await params;
  const remittance = await getRemittance(id);

  if (!remittance) notFound();

  const matchedCount = remittance.lines.filter((l: any) => l.order_id).length;
  const unmatchedCount = remittance.lines.filter((l: any) => l.po_number && !l.order_id).length;
  const noPOLines = remittance.lines.filter((l: any) => !l.po_number);
  const poLines = remittance.lines.filter((l: any) => l.po_number);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/finance" className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h2 className="text-2xl font-bold">{remittance.file_name}</h2>
          <p className="text-sm text-muted-foreground">
            {remittance.retailer} &middot; EFT {remittance.eft_number} &middot; Payment: {remittance.payment_date}
          </p>
        </div>
        <DeleteRemittanceButton id={remittance.id} fileName={remittance.file_name} />
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Invoice Total Amount</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              ${parseFloat(remittance.total_paid).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Deductions</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-600">
              -${parseFloat(remittance.total_deductions).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Net Payment</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">
              ${parseFloat(remittance.balance_due).toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Lines</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{remittance.lines.length}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {matchedCount} matched &middot; {unmatchedCount} unmatched &middot; {noPOLines.length} no PO
            </p>
          </CardContent>
        </Card>
      </div>

      <LineTabs lines={poLines} noPOLines={noPOLines} />
    </div>
  );
}
