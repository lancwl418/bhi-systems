/**
 * Shopify Channel Connector
 *
 * Auth: Admin API Access Token
 * API: Shopify Admin REST API (2024-01)
 * Docs: https://shopify.dev/docs/api/admin-rest
 */

import type {
  ChannelConnector,
  ChannelOrder,
  ShipmentConfirmation,
  InventoryUpdate,
} from "@/types/channels";

const SHOP_DOMAIN = process.env.SHOPIFY_SHOP_DOMAIN || "";
const ACCESS_TOKEN = process.env.SHOPIFY_ACCESS_TOKEN || "";
const API_VERSION = "2024-01";

async function shopifyFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(
    `https://${SHOP_DOMAIN}/admin/api/${API_VERSION}${path}`,
    {
      ...options,
      headers: {
        "X-Shopify-Access-Token": ACCESS_TOKEN,
        "Content-Type": "application/json",
        ...options.headers,
      },
    }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Shopify API error ${res.status}: ${body}`);
  }

  return res.json();
}

export const shopifyConnector: ChannelConnector = {
  channel: "shopify",

  async fetchOrders(since?: Date): Promise<ChannelOrder[]> {
    const params = new URLSearchParams({
      status: "open",
      fulfillment_status: "unfulfilled",
      limit: "50",
    });

    if (since) {
      params.set("created_at_min", since.toISOString());
    }

    const data = await shopifyFetch(`/orders.json?${params.toString()}`);
    return (data.orders || []).map(mapShopifyOrder);
  },

  async confirmShipment(confirmation: ShipmentConfirmation): Promise<void> {
    await shopifyFetch(
      `/orders/${confirmation.channelOrderId}/fulfillments.json`,
      {
        method: "POST",
        body: JSON.stringify({
          fulfillment: {
            tracking_number: confirmation.trackingNumber,
            tracking_company: confirmation.carrier,
            line_items: confirmation.items.map((item) => ({
              sku: item.sku,
              quantity: item.quantity,
            })),
          },
        }),
      }
    );
  },

  async syncInventory(updates: InventoryUpdate[]): Promise<void> {
    // Shopify uses inventory_levels/set endpoint
    for (const update of updates) {
      // First need to look up inventory_item_id from SKU — in practice
      // this mapping would be cached or stored in our DB
      await shopifyFetch("/inventory_levels/set.json", {
        method: "POST",
        body: JSON.stringify({
          inventory_item_id: update.sku, // needs SKU → inventory_item_id mapping
          available: update.quantityAvailable,
        }),
      });
    }
  },

  async testConnection() {
    try {
      await shopifyFetch("/shop.json");
      return { ok: true, message: "Shopify connection successful" };
    } catch (e) {
      return {
        ok: false,
        message: e instanceof Error ? e.message : "Unknown error",
      };
    }
  },
};

// ─── Mappers ───

function mapShopifyOrder(raw: Record<string, unknown>): ChannelOrder {
  const shipping = (raw.shipping_address || {}) as Record<string, string>;
  const customer = (raw.customer || {}) as Record<string, string>;
  const lines = (raw.line_items || []) as Record<string, unknown>[];

  return {
    channel: "shopify",
    channelOrderId: String(raw.id || ""),
    orderDate: String(raw.created_at || ""),
    customerName: `${shipping.first_name || ""} ${shipping.last_name || ""}`.trim(),
    customerEmail: String(raw.email || customer.email || ""),
    shippingAddress: {
      line1: String(shipping.address1 || ""),
      line2: shipping.address2 || undefined,
      city: String(shipping.city || ""),
      state: String(shipping.province_code || shipping.province || ""),
      zip: String(shipping.zip || ""),
      country: String(shipping.country_code || "US"),
    },
    items: lines.map((line) => ({
      channelItemId: String(line.id || ""),
      sku: String(line.sku || ""),
      productName: String(line.title || line.name || ""),
      quantity: Number(line.quantity || 0),
      unitPrice: Number(line.price || 0),
    })),
    shippingMethod: ((raw.shipping_lines as Record<string, string>[]) || [])[0]?.title || null,
    shipByDate: null,
    subtotal: Number(raw.subtotal_price || 0),
    shippingCost: Number(
      ((raw.shipping_lines as Record<string, string>[]) || [])[0]?.price || 0
    ),
    tax: Number(raw.total_tax || 0),
    total: Number(raw.total_price || 0),
    rawPayload: raw,
  };
}
