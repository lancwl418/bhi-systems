/**
 * DSCO (Rithum) Channel Connector
 *
 * Auth: Bearer Token
 * API: REST v3 — https://api.dsco.io/api/v3
 * Docs: https://api.dsco.io
 */

import type {
  ChannelConnector,
  ChannelOrder,
  ShipmentConfirmation,
  InventoryUpdate,
} from "@/types/channels";

const BASE_URL = process.env.DSCO_API_BASE_URL || "https://api.dsco.io/api/v3";
const TOKEN = process.env.DSCO_BEARER_TOKEN || "";

async function dscoFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`DSCO API error ${res.status}: ${body}`);
  }

  return res.json();
}

export const dscoConnector: ChannelConnector = {
  channel: "dsco",

  async fetchOrders(since?: Date): Promise<ChannelOrder[]> {
    // DSCO uses "order streams" to poll for new orders
    const params = new URLSearchParams();
    if (since) {
      params.set("createdAfter", since.toISOString());
    }

    const data = await dscoFetch(`/orders?${params.toString()}`);
    const orders: ChannelOrder[] = (data.orders || []).map(mapDscoOrder);
    return orders;
  },

  async confirmShipment(confirmation: ShipmentConfirmation): Promise<void> {
    await dscoFetch(`/orders/${confirmation.channelOrderId}/shipments`, {
      method: "POST",
      body: JSON.stringify({
        carrier: confirmation.carrier,
        trackingNumber: confirmation.trackingNumber,
        shippingMethod: confirmation.shippingMethod,
        shipDate: confirmation.shippedDate,
        lineItems: confirmation.items.map((item) => ({
          sku: item.sku,
          quantity: item.quantity,
        })),
      }),
    });
  },

  async syncInventory(updates: InventoryUpdate[]): Promise<void> {
    // DSCO accepts bulk inventory updates
    await dscoFetch("/inventory", {
      method: "PUT",
      body: JSON.stringify({
        inventoryItems: updates.map((u) => ({
          sku: u.sku,
          quantityAvailable: u.quantityAvailable,
        })),
      }),
    });
  },

  async testConnection() {
    try {
      await dscoFetch("/account");
      return { ok: true, message: "DSCO connection successful" };
    } catch (e) {
      return {
        ok: false,
        message: e instanceof Error ? e.message : "Unknown error",
      };
    }
  },
};

// ─── Mappers ───

function mapDscoOrder(raw: Record<string, unknown>): ChannelOrder {
  // Map DSCO's order format to our standardized ChannelOrder
  // Actual field names depend on DSCO API response — adjust after testing
  const shipping = raw.shipTo as Record<string, string> || {};
  const lines = (raw.lineItems || raw.orderLines || []) as Record<string, unknown>[];

  return {
    channel: "dsco",
    channelOrderId: String(raw.dscoOrderId || raw.orderId || ""),
    orderDate: String(raw.orderDate || raw.createdDate || ""),
    customerName: String(shipping.name || raw.customerName || ""),
    customerEmail: null, // DSCO typically doesn't expose consumer email
    shippingAddress: {
      line1: String(shipping.address1 || ""),
      line2: shipping.address2 || undefined,
      city: String(shipping.city || ""),
      state: String(shipping.state || ""),
      zip: String(shipping.zip || shipping.postalCode || ""),
      country: String(shipping.country || "US"),
    },
    items: lines.map((line) => ({
      channelItemId: String(line.lineNumber || line.dscoItemId || ""),
      sku: String(line.supplierSku || line.sku || ""),
      productName: String(line.title || line.description || ""),
      quantity: Number(line.quantity || 0),
      unitPrice: Number(line.unitPrice || line.price || 0),
    })),
    shippingMethod: String(raw.shippingMethod || raw.requestedShipMethod || ""),
    shipByDate: raw.shipByDate ? String(raw.shipByDate) : null,
    subtotal: Number(raw.subtotal || 0),
    shippingCost: Number(raw.shippingCost || 0),
    tax: Number(raw.tax || 0),
    total: Number(raw.total || raw.orderTotal || 0),
    rawPayload: raw,
  };
}
