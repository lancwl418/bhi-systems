import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createServiceSupabase } from "@/lib/supabase/server";
import Link from "next/link";
import { ProductFilters } from "./filters";

interface Props {
  searchParams: Promise<{ category?: string; search?: string; status?: string }>;
}

async function getProducts(filters: { category?: string; search?: string; status?: string }) {
  const supabase = await createServiceSupabase();

  let query = supabase
    .from("products")
    .select("*, brands(name), skus(id, sku_code, price, buyer_id, buyers(name))")
    .order("category")
    .order("name");

  if (filters.category) {
    query = query.eq("category", filters.category);
  }
  if (filters.status === "active") {
    query = query.eq("active", true);
  } else if (filters.status === "inactive") {
    query = query.eq("active", false);
  }
  if (filters.search) {
    query = query.or(
      `name.ilike.%${filters.search}%,model_number.ilike.%${filters.search}%`
    );
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

async function getCategories() {
  const supabase = await createServiceSupabase();
  const { data } = await supabase
    .from("products")
    .select("category")
    .order("category");

  const cats = new Set<string>();
  data?.forEach((p: { category: string }) => cats.add(p.category));
  return Array.from(cats);
}

export default async function ProductsPage({ searchParams }: Props) {
  const params = await searchParams;
  const [products, categories] = await Promise.all([
    getProducts(params),
    getCategories(),
  ]);

  const activeCount = products.filter((p: any) => p.active).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Products</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {products.length} products ({activeCount} active)
          </p>
        </div>
      </div>

      <ProductFilters categories={categories} />

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[300px]">Product</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>SKUs</TableHead>
                <TableHead className="text-right">Price Range</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    className="text-center text-muted-foreground py-12"
                  >
                    No products found.
                  </TableCell>
                </TableRow>
              ) : (
                products.map((product: any) => {
                  const skus = product.skus ?? [];
                  const prices = skus.map((s: any) => s.price).filter(Boolean);
                  const minPrice = prices.length ? Math.min(...prices) : 0;
                  const maxPrice = prices.length ? Math.max(...prices) : 0;

                  return (
                    <TableRow key={product.id}>
                      <TableCell>
                        <Link
                          href={`/products/${product.id}`}
                          className="hover:underline font-medium"
                        >
                          {product.name}
                        </Link>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {product.brands?.name}
                        </p>
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {product.model_number}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{product.category}</Badge>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{skus.length}</span>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        {prices.length === 0
                          ? "—"
                          : minPrice === maxPrice
                            ? `$${minPrice.toFixed(2)}`
                            : `$${minPrice.toFixed(2)} – $${maxPrice.toFixed(2)}`}
                      </TableCell>
                      <TableCell>
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
