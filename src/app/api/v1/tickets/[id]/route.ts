import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabase/server";
import { requireApiToken, isUuid, apiError } from "@/lib/support/api-auth";
import { CASE_TYPES, type CaseType } from "@/lib/support/case-types";
import {
  REPLY_STATUSES,
  PROGRESS_VALUES,
  LABEL_VALUES,
  invalidEnumMessage,
} from "@/lib/support/ticket-enums";
import { signAttachmentUrls } from "@/lib/support/attachments";

type Params = { params: Promise<{ id: string }> };

// GET /api/v1/tickets/:id — ticket with email log, timeline notes, drafts
export async function GET(req: NextRequest, { params }: Params) {
  const denied = requireApiToken(req);
  if (denied) return denied;

  const { id } = await params;
  if (!isUuid(id)) return apiError("Ticket not found", 404);

  const supabase = await createServiceSupabase();
  const { data: ticket, error } = await supabase
    .from("support_tickets")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) return apiError(error.message, 500);
  if (!ticket) return apiError("Ticket not found", 404);

  const [{ data: notes }, { data: emails }, { data: drafts }] =
    await Promise.all([
      supabase
        .from("ticket_notes")
        .select("*")
        .eq("ticket_id", id)
        .order("created_at"),
      supabase
        .from("ticket_emails")
        .select("*")
        .eq("ticket_id", id)
        .order("sent_at", { ascending: true, nullsFirst: false }),
      supabase
        .from("ticket_drafts")
        .select("*")
        .eq("ticket_id", id)
        .order("created_at", { ascending: false }),
    ]);

  const [signedNotes, signedEmails] = await Promise.all([
    signAttachmentUrls(supabase, notes ?? []),
    signAttachmentUrls(supabase, emails ?? []),
  ]);

  return NextResponse.json({
    ok: true,
    ticket,
    notes: signedNotes,
    emails: signedEmails,
    drafts: drafts ?? [],
  });
}

const EDITABLE_FIELDS = [
  "case_type",
  "reply_status",
  "progress",
  "label",
  "stuck",
  "next_step",
  "assignee",
  "issue_summary",
  "customer_name",
  "customer_email",
  "customer_phone",
  "source",
  "channel",
  "model_number",
  "po_number",
  "order_number",
  "case_date",
] as const;

// PATCH /api/v1/tickets/:id — update status / progress / stuck / next step / assignee ...
export async function PATCH(req: NextRequest, { params }: Params) {
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

  const updates: Record<string, unknown> = {};
  for (const field of EDITABLE_FIELDS) {
    if (field in body) updates[field] = body[field];
  }
  if (Object.keys(updates).length === 0) {
    return apiError("No editable fields in request", 400);
  }

  if (
    "case_type" in updates &&
    !CASE_TYPES.includes(updates.case_type as CaseType)
  ) {
    return apiError(invalidEnumMessage("case_type", CASE_TYPES), 400);
  }
  if (
    "reply_status" in updates &&
    !(REPLY_STATUSES as readonly string[]).includes(String(updates.reply_status))
  ) {
    return apiError(invalidEnumMessage("reply_status", REPLY_STATUSES), 400);
  }
  if (
    "progress" in updates &&
    !(PROGRESS_VALUES as readonly string[]).includes(String(updates.progress))
  ) {
    return apiError(invalidEnumMessage("progress", PROGRESS_VALUES), 400);
  }
  if (
    "label" in updates &&
    updates.label !== null &&
    !(LABEL_VALUES as readonly string[]).includes(String(updates.label))
  ) {
    return apiError(invalidEnumMessage("label", LABEL_VALUES), 400);
  }
  if ("stuck" in updates && typeof updates.stuck !== "boolean") {
    return apiError("stuck must be a boolean", 400);
  }

  const supabase = await createServiceSupabase();

  const { data: before } = await supabase
    .from("support_tickets")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!before) return apiError("Ticket not found", 404);

  const { data, error } = await supabase
    .from("support_tickets")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return apiError(error.message, 500);

  // Timeline event describing what changed
  const changes = Object.entries(updates)
    .filter(([key, value]) => before[key] !== value)
    .map(([key, value]) => `${key}: ${before[key] ?? "—"} → ${value ?? "—"}`);
  if (changes.length > 0) {
    await supabase.from("ticket_notes").insert({
      ticket_id: id,
      kind: "event",
      author: typeof body.author === "string" ? body.author : "api",
      content: `Updated ${changes.join("; ")}`,
    });
  }

  return NextResponse.json({ ok: true, ticket: data });
}
