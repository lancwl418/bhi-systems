import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

const WEBHOOK_SECRET = process.env.SHOPIFY_WEBHOOK_SECRET || "";

/**
 * POST /api/webhooks/shopify
 * Receives Shopify webhook events (orders/create, orders/updated, etc.)
 */
export async function POST(request: NextRequest) {
  const body = await request.text();
  const hmac = request.headers.get("x-shopify-hmac-sha256");

  // Verify webhook signature
  if (WEBHOOK_SECRET && hmac) {
    const hash = crypto
      .createHmac("sha256", WEBHOOK_SECRET)
      .update(body, "utf8")
      .digest("base64");

    if (hash !== hmac) {
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }
  }

  const topic = request.headers.get("x-shopify-topic");
  const payload = JSON.parse(body);

  // TODO: Process webhook based on topic
  // - orders/create: sync new order into ERP
  // - orders/updated: update order status
  // - orders/cancelled: mark order as cancelled
  console.log(`Shopify webhook received: ${topic}`, payload.id);

  return NextResponse.json({ ok: true });
}
