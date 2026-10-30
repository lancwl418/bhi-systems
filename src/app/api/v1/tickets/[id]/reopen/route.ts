import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabase/server";
import { requireApiToken, isUuid, apiError } from "@/lib/support/api-auth";

type Params = { params: Promise<{ id: string }> };

// POST /api/v1/tickets/:id/reopen — body: { reason?, author? }
export async function POST(req: NextRequest, { params }: Params) {
  const denied = requireApiToken(req);
  if (denied) return denied;

  const { id } = await params;
  if (!isUuid(id)) return apiError("Ticket not found", 404);

  const body = await req.json().catch(() => ({} as Record<string, unknown>));

  const supabase = await createServiceSupabase();
  const { data, error } = await supabase
    .from("support_tickets")
    .update({ closed_at: null, progress: "in_progress" })
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) return apiError(error.message, 500);
  if (!data) return apiError("Ticket not found", 404);

  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  await supabase.from("ticket_notes").insert({
    ticket_id: id,
    kind: "event",
    author: typeof body.author === "string" && body.author ? body.author : "api",
    content: reason ? `Ticket reopened: ${reason}` : "Ticket reopened",
  });

  return NextResponse.json({ ok: true, ticket: data });
}
