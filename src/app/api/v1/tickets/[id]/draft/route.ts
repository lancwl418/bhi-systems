import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabase/server";
import { requireApiToken, isUuid, apiError } from "@/lib/support/api-auth";

type Params = { params: Promise<{ id: string }> };

// POST /api/v1/tickets/:id/draft — store a reply draft
// body: { subject?, body, created_by? }
// Sending happens outside the system (Gmail); after sending, write the real
// email back via POST /tickets/:id/emails with its message_id.
export async function POST(req: NextRequest, { params }: Params) {
  const denied = requireApiToken(req);
  if (denied) return denied;

  const { id } = await params;
  if (!isUuid(id)) return apiError("Ticket not found", 404);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  const draftBody = typeof body.body === "string" ? body.body : "";
  if (!draftBody.trim()) return apiError("body is required", 400);

  const supabase = await createServiceSupabase();

  const { data: ticket } = await supabase
    .from("support_tickets")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (!ticket) return apiError("Ticket not found", 404);

  const { data, error } = await supabase
    .from("ticket_drafts")
    .insert({
      ticket_id: id,
      subject: typeof body.subject === "string" ? body.subject : null,
      body: draftBody,
      created_by:
        typeof body.created_by === "string" && body.created_by
          ? body.created_by
          : "api",
    })
    .select()
    .single();

  if (error) return apiError(error.message, 500);

  return NextResponse.json({ ok: true, draft: data }, { status: 201 });
}

// GET /api/v1/tickets/:id/draft — drafts, newest first
export async function GET(req: NextRequest, { params }: Params) {
  const denied = requireApiToken(req);
  if (denied) return denied;

  const { id } = await params;
  if (!isUuid(id)) return apiError("Ticket not found", 404);

  const supabase = await createServiceSupabase();
  const { data, error } = await supabase
    .from("ticket_drafts")
    .select("*")
    .eq("ticket_id", id)
    .order("created_at", { ascending: false });

  if (error) return apiError(error.message, 500);

  return NextResponse.json({ ok: true, drafts: data ?? [] });
}
