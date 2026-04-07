export const dynamic = "force-dynamic";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createServiceSupabase } from "@/lib/supabase/server";
import {
  Package,
  ShieldAlert,
  Store,
  BoxesIcon,
  AlertTriangle,
  TrendingUp,
  BarChart3,
  Crown,
} from "lucide-react";

// Fetch all rows from a table, paginating past the 1000-row limit
async function fetchAll<T = Record<string, any>>(
  supabase: any,
  table: string,
  select: string,
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data } = await supabase.from(table).select(select).range(from, from + PAGE - 1);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

async function getDashboardData() {
  const supabase = await createServiceSupabase();

  const [
    { count: totalProducts },
    { count: activeProducts },
    { count: totalSkus },
    { count: totalBuyers },
    { count: pendingOrders },
    { count: shippedOrders },
    { count: openWarranties },
    { data: lowStockItems },
    { data: recentOrders },
    { data: categoryBreakdown },
    { data: inventoryStats },
    allOrders,
    allOrderItems,
  ] = await Promise.all([
    supabase.from("products").select("*", { count: "exact", head: true }),
    supabase.from("products").select("*", { count: "exact", head: true }).eq("active", true),
    supabase.from("skus").select("*", { count: "exact", head: true }),
    supabase.from("buyers").select("*", { count: "exact", head: true }).eq("active", true),
    supabase.from("orders").select("*", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("orders").select("*", { count: "exact", head: true }).eq("status", "shipped"),
    supabase.from("warranties").select("*", { count: "exact", head: true }).eq("status", "open"),
    supabase
      .from("inventory")
      .select("*, skus!inner(sku_code, products!inner(name))")
      .lt("quantity_available", 10)
      .order("quantity_available", { ascending: true })
      .limit(5),
    supabase
      .from("orders")
      .select("id, channel_source, channel_order_id, status, total, order_date, raw_payload")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase.from("products").select("category"),
    supabase.from("inventory").select("quantity_on_hand, quantity_reserved, quantity_available"),
    fetchAll(supabase, "orders", "channel_source, status, total, raw_payload"),
    fetchAll(supabase, "order_items", "sku_code, product_name, quantity, total_price"),
  ]);

  // Aggregate categories
  const categories: Record<string, number> = {};
  categoryBreakdown?.forEach((p: { category: string }) => {
    categories[p.category] = (categories[p.category] || 0) + 1;
  });

  // Aggregate inventory
  let totalOnHand = 0;
  let totalReserved = 0;
  let totalAvailable = 0;
  inventoryStats?.forEach((inv: { quantity_on_hand: number; quantity_reserved: number; quantity_available: number }) => {
    totalOnHand += inv.quantity_on_hand;
    totalReserved += inv.quantity_reserved;
    totalAvailable += inv.quantity_available;
  });

  // Channel breakdown (aggregated in JS)
  const channels: Record<string, { orders: number; revenue: number; shipped: number; pending: number; cancelled: number }> = {};
  let totalOrderCount = 0;
  let totalRevenue = 0;
  for (const o of allOrders) {
    const channel = o.raw_payload?.retailer || o.channel_source;
    if (!channels[channel]) channels[channel] = { orders: 0, revenue: 0, shipped: 0, pending: 0, cancelled: 0 };
    channels[channel].orders++;
    channels[channel].revenue += parseFloat(o.total) || 0;
    if (o.status === "shipped") channels[channel].shipped++;
    if (o.status === "pending") channels[channel].pending++;
    if (o.status === "cancelled") channels[channel].cancelled++;
    totalOrderCount++;
    totalRevenue += parseFloat(o.total) || 0;
  }

  // Top products (aggregated in JS)
  const productAgg: Record<string, { name: string; qty: number; revenue: number }> = {};
  for (const item of allOrderItems) {
    if (!productAgg[item.sku_code]) productAgg[item.sku_code] = { name: item.product_name, qty: 0, revenue: 0 };
    productAgg[item.sku_code].qty += item.quantity;
    productAgg[item.sku_code].revenue += parseFloat(item.total_price) || 0;
  }
  const topProducts = Object.entries(productAgg)
    .map(([sku, d]) => ({ sku, ...d }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 10);

  return {
    totalProducts: totalProducts ?? 0,
    activeProducts: activeProducts ?? 0,
    totalSkus: totalSkus ?? 0,
    totalBuyers: totalBuyers ?? 0,
    pendingOrders: pendingOrders ?? 0,
    shippedOrders: shippedOrders ?? 0,
    openWarranties: openWarranties ?? 0,
    lowStockItems: lowStockItems ?? [],
    recentOrders: recentOrders ?? [],
    categories,
    inventory: { totalOnHand, totalReserved, totalAvailable },
    channels,
    topProducts,
    totalOrderCount,
    totalRevenue,
  };
}

const statusColors: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  acknowledged: "bg-blue-100 text-blue-800",
  processing: "bg-indigo-100 text-indigo-800",
  shipped: "bg-purple-100 text-purple-800",
  delivered: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
  returned: "bg-orange-100 text-orange-800",
};

export default async function DashboardPage() {
  const data = await getDashboardData();

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Dashboard</h2>

      {/* KPI Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Orders
            </CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.totalOrderCount.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {data.pendingOrders} pending &middot; {data.shippedOrders} shipped
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Revenue
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${data.totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Across {Object.keys(data.channels).length} channels
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Products
            </CardTitle>
            <BoxesIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.activeProducts}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {data.totalSkus} SKUs &middot; {Object.keys(data.categories).length} categories
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Open Warranties
            </CardTitle>
            <ShieldAlert className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.openWarranties}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Requires attention
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Channel Breakdown + Top Products */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Orders by Channel */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Orders by Channel</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="divide-y">
              {Object.entries(data.channels)
                .sort(([, a], [, b]) => b.orders - a.orders)
                .map(([channel, stats]) => (
                  <div key={channel} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                    <div>
                      <p className="text-sm font-medium">{channel}</p>
                      <div className="flex gap-3 mt-0.5">
                        <span className="text-xs text-green-600">{stats.shipped.toLocaleString()} shipped</span>
                        {stats.pending > 0 && (
                          <span className="text-xs text-yellow-600">{stats.pending.toLocaleString()} pending</span>
                        )}
                        {stats.cancelled > 0 && (
                          <span className="text-xs text-red-600">{stats.cancelled.toLocaleString()} cancelled</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold">{stats.orders.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">
                        ${stats.revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </p>
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>

        {/* Top Selling Products */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Top Selling Products</CardTitle>
            <Crown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.topProducts.map((p, i) => (
                <div key={p.sku} className="flex items-start gap-3">
                  <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    i === 0 ? "bg-yellow-100 text-yellow-800" :
                    i === 1 ? "bg-gray-100 text-gray-800" :
                    i === 2 ? "bg-orange-100 text-orange-800" :
                    "bg-muted text-muted-foreground"
                  }`}>
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium font-mono truncate">{p.sku}</p>
                    <p className="text-xs text-muted-foreground truncate">{p.name}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold">{p.qty.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">
                      ${p.revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Third Row */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Inventory Overview */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Inventory Overview</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">On Hand</span>
              <span className="text-sm font-semibold">{data.inventory.totalOnHand.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Reserved</span>
              <span className="text-sm font-semibold">{data.inventory.totalReserved.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Available</span>
              <span className="text-sm font-semibold text-green-600">{data.inventory.totalAvailable.toLocaleString()}</span>
            </div>
          </CardContent>
        </Card>

        {/* Product Categories */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Product Categories</CardTitle>
            <BoxesIcon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="space-y-3">
            {Object.entries(data.categories).map(([cat, count]) => (
              <div key={cat} className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{cat}</span>
                <Badge variant="secondary">{count}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Low Stock Alert */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Low Stock Alert</CardTitle>
            <AlertTriangle className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            {data.lowStockItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">All items well stocked</p>
            ) : (
              <div className="space-y-3">
                {data.lowStockItems.map((item: any) => (
                  <div key={item.id} className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        {item.skus?.sku_code}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">
                        {item.skus?.products?.name}
                      </p>
                    </div>
                    <Badge variant="destructive" className="ml-2 shrink-0">
                      {item.quantity_available}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Orders */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Recent Orders</CardTitle>
        </CardHeader>
        <CardContent>
          {data.recentOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No orders yet. Connect a channel to start syncing.
            </p>
          ) : (
            <div className="space-y-3">
              {data.recentOrders.map((order: any) => (
                <div key={order.id} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{order.channel_order_id}</p>
                    <p className="text-xs text-muted-foreground">
                      {order.raw_payload?.retailer || order.channel_source}
                      {" "}&middot; {order.order_date}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium">${order.total?.toFixed(2)}</span>
                    <Badge className={statusColors[order.status] ?? ""} variant="secondary">
                      {order.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
