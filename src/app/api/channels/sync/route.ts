import { NextRequest, NextResponse } from "next/server";
import { syncAllOrders, syncChannelOrders } from "@/lib/channels/order-sync";
import type { ChannelSource } from "@/types/database";

/**
 * POST /api/channels/sync
 * Trigger order sync from one or all channels.
 *
 * Body: { channel?: ChannelSource, since?: string }
 * - channel: specific channel to sync, omit for all
 * - since: ISO date string, only fetch orders after this date
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const since = body.since ? new Date(body.since) : undefined;

    let results;
    if (body.channel) {
      const result = await syncChannelOrders(
        body.channel as ChannelSource,
        since
      );
      results = [result];
    } else {
      results = await syncAllOrders(since);
    }

    return NextResponse.json({ ok: true, results });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
