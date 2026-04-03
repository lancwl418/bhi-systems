/**
 * eBay Channel Connector
 *
 * Auth: OAuth 2.0 (Client Credentials + Refresh Token)
 * API: eBay RESTful Fulfillment API
 * Docs: https://developer.ebay.com/api-docs/sell/fulfillment/overview.html
 */

import type {
  ChannelConnector,
  ChannelOrder,
  ShipmentConfirmation,
  InventoryUpdate,
} from "@/types/channels";

const EBAY_ENV = process.env.EBAY_ENVIRONMENT || "sandbox";
const BASE_URL =
  EBAY_ENV === "production"
    ? "https://api.ebay.com"
    : "https://api.sandbox.ebay.com";

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  const clientId = process.env.EBAY_CLIENT_ID!;
  const clientSecret = process.env.EBAY_CLIENT_SECRET!;
  const refreshToken = process.env.EBAY_REFRESH_TOKEN!;

  const res = await fetch(`${BASE_URL}/identity/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      scope: "https://api.ebay.com/oauth/api_scope/sell.fulfillment",
    }),
  });

  if (!res.ok) {
    throw new Error(`eBay OAuth error: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };

  return cachedToken.token;
}

async function ebayFetch(path: string, options: RequestInit = {}) {
  const token = await getAccessToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`eBay API error ${res.status}: ${body}`);
  }

  return res.json();
}

export const ebayConnector: ChannelConnector = {
  channel: "ebay",

  async fetchOrders(since?: Date): Promise<ChannelOrder[]> {
    const filter = since
      ? `creationdate:[${since.toISOString()}..],orderfulfillmentstatus:{NOT_STARTED|IN_PROGRESS}`
      : "orderfulfillmentstatus:{NOT_STARTED|IN_PROGRESS}";

    const data = await ebayFetch(
      `/sell/fulfillment/v1/order?filter=${encodeURIComponent(filter)}&limit=50`
    );

    return (data.orders || []).map(mapEbayOrder);
  },

  async confirmShipment(confirmation: ShipmentConfirmation): Promise<void> {
    await ebayFetch(
      `/sell/fulfillment/v1/order/${confirmation.channelOrderId}/shipping_fulfillment`,
      {
        method: "POST",
        body: JSON.stringify({
          trackingNumber: confirmation.trackingNumber,
          shippingCarrierCode: confirmation.carrier,
          lineItems: confirmation.items.map((item) => ({
            lineItemId: item.sku, // needs mapping from our SKU to eBay lineItemId
            quantity: item.quantity,
          })),
        }),
      }
    );
  },

  async syncInventory(updates: InventoryUpdate[]): Promise<void> {
    // eBay uses Inventory API for inventory management
    for (const update of updates) {
      await ebayFetch(`/sell/inventory/v1/inventory_item/${update.sku}`, {
        method: "PUT",
        body: JSON.stringify({
          availability: {
            shipToLocationAvailability: {
              quantity: update.quantityAvailable,
            },
          },
        }),
      });
    }
  },

  async testConnection() {
    try {
      await getAccessToken();
      return { ok: true, message: "eBay connection successful" };
    } catch (e) {
      return {
        ok: false,
        message: e instanceof Error ? e.message : "Unknown error",
      };
    }
  },
};

// ─── Mappers ───

function mapEbayOrder(raw: Record<string, unknown>): ChannelOrder {
  const fulfillment = (raw.fulfillmentStartInstructions as Record<string, unknown>[])?.[0] || {};
  const shippingStep = fulfillment.shippingStep as Record<string, unknown> || {};
  const shipTo = shippingStep.shipTo as Record<string, unknown> || {};
  const contact = shipTo.contactAddress as Record<string, string> || {};
  const buyer = raw.buyer as Record<string, string> || {};
  const lines = (raw.lineItems || []) as Record<string, unknown>[];
  const priceSummary = raw.pricingSummary as Record<string, { value: string }> || {};

  return {
    channel: "ebay",
    channelOrderId: String(raw.orderId || ""),
    orderDate: String(raw.creationDate || ""),
    customerName: String(buyer.username || shipTo.fullName || ""),
    customerEmail: buyer.buyerRegistrationAddress
      ? String((buyer.buyerRegistrationAddress as unknown as Record<string, string>).email || "")
      : null,
    shippingAddress: {
      line1: String(contact.addressLine1 || ""),
      line2: contact.addressLine2 || undefined,
      city: String(contact.city || ""),
      state: String(contact.stateOrProvince || ""),
      zip: String(contact.postalCode || ""),
      country: String(contact.countryCode || "US"),
    },
    items: lines.map((line) => ({
      channelItemId: String(line.lineItemId || ""),
      sku: String(line.sku || ""),
      productName: String(line.title || ""),
      quantity: Number(line.quantity || 0),
      unitPrice: Number((line.lineItemCost as Record<string, string>)?.value || 0),
    })),
    shippingMethod: String(
      (shippingStep.shippingServiceCode as string) || ""
    ),
    shipByDate: raw.fulfillmentStartInstructions
      ? String(
          (fulfillment as Record<string, string>).maxEstimatedDeliveryDate || ""
        ) || null
      : null,
    subtotal: Number(priceSummary.priceSubtotal?.value || 0),
    shippingCost: Number(priceSummary.deliveryCost?.value || 0),
    tax: Number(priceSummary.tax?.value || 0),
    total: Number(priceSummary.total?.value || 0),
    rawPayload: raw,
  };
}
