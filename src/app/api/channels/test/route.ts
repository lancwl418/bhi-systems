import { NextRequest, NextResponse } from "next/server";
import { getConnector } from "@/lib/channels/registry";
import type { ChannelSource } from "@/types/database";

/**
 * POST /api/channels/test
 * Test connection to a specific channel.
 *
 * Body: { channel: ChannelSource }
 */
export async function POST(request: NextRequest) {
  try {
    const { channel } = await request.json();
    if (!channel) {
      return NextResponse.json(
        { ok: false, error: "channel is required" },
        { status: 400 }
      );
    }

    const connector = getConnector(channel as ChannelSource);
    const result = await connector.testConnection();

    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
