/**
 * Order Sync Service
 *
 * Pulls orders from all enabled channels, normalizes them,
 * and upserts into Supabase. This is the core inbound pipeline.
 */

import type { ChannelOrder } from "@/types/channels";
import type { ChannelSource, Order, OrderItem } from "@/types/database";
import { getConnector, getEnabledChannels } from "./registry";
import { createServiceSupabase } from "@/lib/supabase/server";

export interface SyncResult {
  channel: ChannelSource;
  fetched: number;
  created: number;
  skipped: number;
  errors: string[];
}

/**
 * Sync orders from a single channel
 */
export async function syncChannelOrders(
  channel: ChannelSource,
  since?: Date
): Promise<SyncResult> {
  const result: SyncResult = {
    channel,
    fetched: 0,
    created: 0,
    skipped: 0,
    errors: [],
  };

  try {
    const connector = getConnector(channel);
    const channelOrders = await connector.fetchOrders(since);
    result.fetched = channelOrders.length;

    const supabase = await createServiceSupabase();

    for (const co of channelOrders) {
      try {
        // Check if order already exists
        const { data: existing } = await supabase
          .from("orders")
          .select("id")
          .eq("channel_source", co.channel)
          .eq("channel_order_id", co.channelOrderId)
          .single();

        if (existing) {
          result.skipped++;
          continue;
        }

        // Upsert customer
        const customerId = await upsertCustomer(supabase, co);

        // Find or create buyer
        const buyerId = await findBuyer(supabase, co.channel);

        // Insert order
        const order = mapToOrder(co, customerId, buyerId);
        const { data: insertedOrder, error: orderError } = await supabase
          .from("orders")
          .insert(order)
          .select("id")
          .single();

        if (orderError) throw orderError;

        // Insert order items
        const items = mapToOrderItems(co, insertedOrder.id);
        if (items.length > 0) {
          const { error: itemsError } = await supabase
            .from("order_items")
            .insert(items);
          if (itemsError) throw itemsError;
        }

        // Log sync
        await supabase.from("channel_sync_logs").insert({
          channel: co.channel,
          direction: "inbound",
          entity_type: "order",
          entity_id: insertedOrder.id,
          status: "success",
          message: `Order ${co.channelOrderId} synced`,
        });

        result.created++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        result.errors.push(`Order ${co.channelOrderId}: ${msg}`);

        await supabase.from("channel_sync_logs").insert({
          channel: co.channel,
          direction: "inbound",
          entity_type: "order",
          entity_id: null,
          status: "error",
          message: msg,
          raw_data: co.rawPayload,
        });
      }
    }
  } catch (e) {
    result.errors.push(
      `Channel ${channel} fetch failed: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  return result;
}

/**
 * Sync all enabled channels
 */
export async function syncAllOrders(since?: Date): Promise<SyncResult[]> {
  const channels = getEnabledChannels();
  const results = await Promise.allSettled(
    channels.map((ch) => syncChannelOrders(ch, since))
  );

  return results.map((r, i) =>
    r.status === "fulfilled"
      ? r.value
      : {
          channel: channels[i],
          fetched: 0,
          created: 0,
          skipped: 0,
          errors: [r.reason?.message || "Unknown error"],
        }
  );
}

// ─── Helpers ───

async function upsertCustomer(
  supabase: Awaited<ReturnType<typeof createServiceSupabase>>,
  co: ChannelOrder
): Promise<string> {
  const { data: existing } = await supabase
    .from("customers")
    .select("id")
    .eq("name", co.customerName)
    .eq("email", co.customerEmail || "")
    .single();

  if (existing) return existing.id;

  const { data: created, error } = await supabase
    .from("customers")
    .insert({
      name: co.customerName,
      email: co.customerEmail,
      address: co.shippingAddress,
    })
    .select("id")
    .single();

  if (error) throw error;
  return created.id;
}

async function findBuyer(
  supabase: Awaited<ReturnType<typeof createServiceSupabase>>,
  channel: ChannelSource
): Promise<string> {
  const { data } = await supabase
    .from("buyers")
    .select("id")
    .eq("platform", channel)
    .single();

  return data?.id || channel;
}

function mapToOrder(
  co: ChannelOrder,
  customerId: string,
  buyerId: string
): Omit<Order, "id" | "created_at" | "updated_at"> {
  return {
    channel_source: co.channel,
    channel_order_id: co.channelOrderId,
    buyer_id: buyerId,
    customer_id: customerId,
    status: "pending",
    order_date: co.orderDate,
    ship_by_date: co.shipByDate,
    shipping_address: co.shippingAddress,
    shipping_method: co.shippingMethod,
    tracking_number: null,
    carrier: null,
    subtotal: co.subtotal,
    shipping_cost: co.shippingCost,
    tax: co.tax,
    total: co.total,
    notes: null,
    raw_payload: co.rawPayload,
  };
}

function mapToOrderItems(
  co: ChannelOrder,
  orderId: string
): Omit<OrderItem, "id">[] {
  return co.items.map((item) => ({
    order_id: orderId,
    sku_id: "", // will be resolved against our SKU table
    sku_code: item.sku,
    product_name: item.productName,
    quantity: item.quantity,
    unit_price: item.unitPrice,
    total_price: item.unitPrice * item.quantity,
  }));
}
