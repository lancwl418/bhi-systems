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

async function getProduct(id: string) {
  const supabase = await createServiceSupabase();

  const { data: product, error } = await supabase
    .from("products")
    .select(
      "*, brands(name), skus(id, sku_code, buyer_id, upc, price, cost, weight_lbs, dimensions, active, buyers(name))"
    )
    .eq("id", id)
    .single();

  if (error || !product) return null;

  // Get warranty count for this product
  const { count: warrantyCount } = await supabase
    .from("warranties")
    .select("*", { count: "exact", head: true })
    .eq("product_id", id);

  // Get inventory for each SKU
  const skuIds = (product.skus ?? []).map((s: any) => s.id);
  const { data: inventoryData } = skuIds.length
    ? await supabase.from("inventory").select("*").in("sku_id", skuIds)
    : { data: [] };

  const inventoryMap: Record<string, any> = {};
  inventoryData?.forEach((inv: any) => {
    inventoryMap[inv.sku_id] = inv;
  });

  return { ...product, warrantyCount: warrantyCount ?? 0, inventoryMap };
}

export default async function ProductDetailPage({ params }: Props) {
  const { id } = await params;
  const product = await getProduct(id);

  if (!product) notFound();

  const specs = (product.specs ?? {}) as Record<string, any>;
  const skus = product.skus ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/products"
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="flex-1">
          <h2 className="text-2xl font-bold">{product.name}</h2>
          <p className="text-sm text-muted-foreground">
            {product.brands?.name} &middot; {product.model_number}
          </p>
        </div>
        <Badge
          variant={product.active ? "default" : "secondary"}
          className={
            product.active
              ? "bg-green-100 text-green-800 hover:bg-green-100"
              : ""
          }
        >
          {product.active ? "Active" : "Inactive"}
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Category
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Badge variant="outline">{product.category}</Badge>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              SKU Count
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{skus.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Warranty Claims
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{product.warrantyCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              HD Item ID
            </CardTitle>
          </CardHeader>
          <CardContent>
            <span className="font-mono text-sm">{specs.hd_item_id ?? "—"}</span>
          </CardContent>
        </Card>
      </div>

      {/* Specifications */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Technical Specifications</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Object.entries(specs)
              .filter(([key]) => key !== "hd_item_id")
              .map(([key, value]) => (
                <div key={key}>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">
                    {key.replace(/_/g, " ")}
                  </p>
                  <p className="text-sm font-medium mt-0.5">
                    {typeof value === "boolean"
                      ? value
                        ? "Yes"
                        : "No"
                      : String(value)}
                  </p>
                </div>
              ))}
          </div>
        </CardContent>
      </Card>

      {/* SKUs Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">SKUs & Pricing</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU Code</TableHead>
                <TableHead>Channel</TableHead>
                <TableHead>UPC</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Margin</TableHead>
                <TableHead className="text-right">On Hand</TableHead>
                <TableHead className="text-right">Available</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {skus.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="text-center text-muted-foreground py-8"
                  >
                    No SKUs configured
                  </TableCell>
                </TableRow>
              ) : (
                skus.map((sku: any) => {
                  const inv = product.inventoryMap[sku.id];
                  const margin =
                    sku.price && sku.cost
                      ? (((sku.price - sku.cost) / sku.price) * 100).toFixed(1)
                      : "—";

                  return (
                    <TableRow key={sku.id}>
                      <TableCell className="font-mono text-sm">
                        {sku.sku_code}
                      </TableCell>
                      <TableCell className="text-sm">
                        {sku.buyers?.name ?? "Internal"}
                      </TableCell>
                      <TableCell className="font-mono text-sm text-muted-foreground">
                        {sku.upc ?? "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        ${sku.price?.toFixed(2) ?? "—"}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground">
                        ${sku.cost?.toFixed(2) ?? "—"}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {margin}%
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {inv?.quantity_on_hand ?? 0}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        <span
                          className={
                            (inv?.quantity_available ?? 0) < 10
                              ? "text-red-600 font-semibold"
                              : ""
                          }
                        >
                          {inv?.quantity_available ?? 0}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={sku.active ? "default" : "secondary"}
                          className={
                            sku.active
                              ? "bg-green-100 text-green-800 hover:bg-green-100"
                              : ""
                          }
                        >
                          {sku.active ? "Active" : "Inactive"}
                        </Badge>
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
