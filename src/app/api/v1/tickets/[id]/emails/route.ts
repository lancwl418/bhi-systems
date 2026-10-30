import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabase/server";
import { requireApiToken, isUuid, apiError } from "@/lib/support/api-auth";
import { signAttachmentUrls } from "@/lib/support/attachments";

type Params = { params: Promise<{ id: string }> };

// POST /api/v1/tickets/:id/emails — log an email on the ticket
// body: { direction?: "inbound"|"outbound", from, to?, cc?, sent_at?, subject?,
//         body?, message_id?, thread_id?, attachments?: [{filename, mime_type, size, url}] }
// Duplicate message_id → returns the existing row with duplicate: true.
// Logging an outbound email marks the ticket replied.
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

  const str = (key: string) => {
    const value = body[key];
    return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
  };

  const supabase = await createServiceSupabase();

  const { data: ticket } = await supabase
    .from("support_tickets")
    .select("id, reply_status")
    .eq("id", id)
    .maybeSingle();
  if (!ticket) return apiError("Ticket not found", 404);

  const messageId = str("message_id");
  if (messageId) {
    const { data: existing } = await supabase
      .from("ticket_emails")
      .select("*")
      .eq("message_id", messageId)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ ok: true, email: existing, duplicate: true });
    }
  }

  const direction = body.direction === "outbound" ? "outbound" : "inbound";

  const { data, error } = await supabase
    .from("ticket_emails")
    .insert({
      ticket_id: id,
      direction,
      from_addr: str("from") ?? str("from_addr"),
      to_addr: str("to") ?? str("to_addr"),
      cc: str("cc"),
      sent_at: str("sent_at"),
      subject: str("subject"),
      body: typeof body.body === "string" ? body.body : null,
      message_id: messageId,
      thread_id: str("thread_id"),
      attachments: Array.isArray(body.attachments) ? body.attachments : [],
    })
    .select()
    .single();

  if (error) return apiError(error.message, 500);

  if (direction === "outbound" && ticket.reply_status !== "replied") {
    await supabase
      .from("support_tickets")
      .update({ reply_status: "replied" })
      .eq("id", id);
  }

  return NextResponse.json({ ok: true, email: data }, { status: 201 });
}

// GET /api/v1/tickets/:id/emails
export async function GET(req: NextRequest, { params }: Params) {
  const denied = requireApiToken(req);
  if (denied) return denied;

  const { id } = await params;
  if (!isUuid(id)) return apiError("Ticket not found", 404);

  const supabase = await createServiceSupabase();
  const { data, error } = await supabase
    .from("ticket_emails")
    .select("*")
    .eq("ticket_id", id)
    .order("sent_at", { ascending: true, nullsFirst: false });

  if (error) return apiError(error.message, 500);

  const emails = await signAttachmentUrls(supabase, data ?? []);
  return NextResponse.json({ ok: true, emails });
}
