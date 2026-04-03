/**
 * Wayfair Channel Connector
 *
 * Auth: OAuth 2.0 Client Credentials
 * API: Wayfair Supplier API (GraphQL + REST)
 * Docs: https://partners.wayfair.com (requires partner account)
 */

import type {
  ChannelConnector,
  ChannelOrder,
  ShipmentConfirmation,
  InventoryUpdate,
} from "@/types/channels";

const AUTH_URL = "https://sso.auth.wayfair.com/oauth/token";
const API_URL = "https://api.wayfair.com/v1/graphql";

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  const res = await fetch(AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: process.env.WAYFAIR_CLIENT_ID!,
      client_secret: process.env.WAYFAIR_CLIENT_SECRET!,
      audience: "https://api.wayfair.com/",
    }),
  });

  if (!res.ok) {
    throw new Error(`Wayfair OAuth error: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };

  return cachedToken.token;
}

async function wayfairGraphQL(query: string, variables?: Record<string, unknown>) {
  const token = await getAccessToken();
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Wayfair API error ${res.status}: ${body}`);
  }

  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(`Wayfair GraphQL error: ${JSON.stringify(json.errors)}`);
  }

  return json.data;
}

export const wayfairConnector: ChannelConnector = {
  channel: "wayfair",

  async fetchOrders(since?: Date): Promise<ChannelOrder[]> {
    const query = `
      query getOrders($limit: Int, $dateStart: DateTime) {
        purchaseOrders(
          limit: $limit
          filters: [{ field: STATUS, equals: "open" }]
          ${since ? 'dateStart: $dateStart' : ''}
        ) {
          poNumber
          poDate
          estimatedShipDate
          shipTo {
            name
            address1
            address2
            city
            state
            postalCode
            country
          }
          products {
            partNumber
            name
            quantity
            price
            pieceCount
          }
          orderTotal
        }
      }
    `;

    const data = await wayfairGraphQL(query, {
      limit: 50,
      dateStart: since?.toISOString(),
    });

    return (data.purchaseOrders || []).map(mapWayfairOrder);
  },

  async confirmShipment(confirmation: ShipmentConfirmation): Promise<void> {
    const mutation = `
      mutation shipPO($input: ShipmentInput!) {
        purchaseOrderShipment(input: $input) {
          id
          status
        }
      }
    `;

    await wayfairGraphQL(mutation, {
      input: {
        poNumber: confirmation.channelOrderId,
        carrier: confirmation.carrier,
        trackingNumber: confirmation.trackingNumber,
        shipDate: confirmation.shippedDate,
        shipSpeed: confirmation.shippingMethod,
        packages: [
          {
            lineItems: confirmation.items.map((item) => ({
              partNumber: item.sku,
              quantity: item.quantity,
            })),
          },
        ],
      },
    });
  },

  async syncInventory(updates: InventoryUpdate[]): Promise<void> {
    const mutation = `
      mutation updateInventory($inventory: [InventoryInput!]!) {
        inventory {
          save(inventory: $inventory) {
            errors { key message }
          }
        }
      }
    `;

    await wayfairGraphQL(mutation, {
      inventory: updates.map((u) => ({
        supplierId: null, // set from config
        supplierPartNumber: u.sku,
        quantityOnHand: u.quantityAvailable,
        quantityOnOrder: 0,
      })),
    });
  },

  async testConnection() {
    try {
      await getAccessToken();
      return { ok: true, message: "Wayfair connection successful" };
    } catch (e) {
      return {
        ok: false,
        message: e instanceof Error ? e.message : "Unknown error",
      };
    }
  },
};

// ─── Mappers ───

function mapWayfairOrder(raw: Record<string, unknown>): ChannelOrder {
  const shipTo = (raw.shipTo || {}) as Record<string, string>;
  const products = (raw.products || []) as Record<string, unknown>[];

  const subtotal = products.reduce(
    (sum, p) => sum + Number(p.price || 0) * Number(p.quantity || 0),
    0
  );

  return {
    channel: "wayfair",
    channelOrderId: String(raw.poNumber || ""),
    orderDate: String(raw.poDate || ""),
    customerName: String(shipTo.name || ""),
    customerEmail: null, // Wayfair doesn't share consumer email
    shippingAddress: {
      line1: String(shipTo.address1 || ""),
      line2: shipTo.address2 || undefined,
      city: String(shipTo.city || ""),
      state: String(shipTo.state || ""),
      zip: String(shipTo.postalCode || ""),
      country: String(shipTo.country || "US"),
    },
    items: products.map((p) => ({
      channelItemId: String(p.partNumber || ""),
      sku: String(p.partNumber || ""),
      productName: String(p.name || ""),
      quantity: Number(p.quantity || 0),
      unitPrice: Number(p.price || 0),
    })),
    shippingMethod: null,
    shipByDate: raw.estimatedShipDate ? String(raw.estimatedShipDate) : null,
    subtotal,
    shippingCost: 0,
    tax: 0,
    total: Number(raw.orderTotal || subtotal),
    rawPayload: raw,
  };
}
