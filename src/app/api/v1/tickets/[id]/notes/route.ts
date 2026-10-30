import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabase/server";
import { requireApiToken, isUuid, apiError } from "@/lib/support/api-auth";
import { signAttachmentUrls } from "@/lib/support/attachments";

type Params = { params: Promise<{ id: string }> };

// POST /api/v1/tickets/:id/notes — add an internal note / timeline entry
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

  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content) return apiError("content is required", 400);

  const supabase = await createServiceSupabase();

  const { data: ticket } = await supabase
    .from("support_tickets")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (!ticket) return apiError("Ticket not found", 404);

  const { data, error } = await supabase
    .from("ticket_notes")
    .insert({
      ticket_id: id,
      kind: body.kind === "event" ? "event" : "note",
      author: typeof body.author === "string" && body.author ? body.author : "api",
      content,
      attachments: Array.isArray(body.attachments) ? body.attachments : [],
    })
    .select()
    .single();

  if (error) return apiError(error.message, 500);

  return NextResponse.json({ ok: true, note: data }, { status: 201 });
}

// GET /api/v1/tickets/:id/notes
export async function GET(req: NextRequest, { params }: Params) {
  const denied = requireApiToken(req);
  if (denied) return denied;

  const { id } = await params;
  if (!isUuid(id)) return apiError("Ticket not found", 404);

  const supabase = await createServiceSupabase();
  const { data, error } = await supabase
    .from("ticket_notes")
    .select("*")
    .eq("ticket_id", id)
    .order("created_at");

  if (error) return apiError(error.message, 500);

  const notes = await signAttachmentUrls(supabase, data ?? []);
  return NextResponse.json({ ok: true, notes });
}
