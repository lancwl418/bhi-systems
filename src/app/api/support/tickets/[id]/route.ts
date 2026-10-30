import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabase/server";

const EDITABLE_FIELDS = [
  "case_type",
  "reply_status",
  "progress",
  "stuck",
  "next_step",
  "assignee",
  "closed_at",
  "issue_summary",
  "customer_name",
  "customer_email",
  "customer_phone",
  "source",
  "channel",
  "model_number",
  "po_number",
  "order_number",
] as const;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();

    const updates: Record<string, unknown> = {};
    for (const field of EDITABLE_FIELDS) {
      if (field in body) updates[field] = body[field];
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { ok: false, error: "No editable fields in request" },
        { status: 400 }
      );
    }

    const supabase = await createServiceSupabase();

    const { data: before } = await supabase
      .from("support_tickets")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (!before) {
      return NextResponse.json(
        { ok: false, error: "Ticket not found" },
        { status: 404 }
      );
    }

    const { data, error } = await supabase
      .from("support_tickets")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    // Timeline events: close/reopen get their own entry, other changes a diff
    const { closed_at: closedAt, ...rest } = updates;
    const events: string[] = [];
    if ("closed_at" in updates && Boolean(closedAt) !== Boolean(before.closed_at)) {
      events.push(closedAt ? "Ticket closed" : "Ticket reopened");
    }
    const changes = Object.entries(rest)
      .filter(([key, value]) => before[key] !== value)
      .map(([key, value]) => `${key}: ${before[key] ?? "—"} → ${value ?? "—"}`);
    if (changes.length > 0) events.push(`Updated ${changes.join("; ")}`);
    for (const content of events) {
      await supabase.from("ticket_notes").insert({
        ticket_id: id,
        kind: "event",
        author: "CS",
        content,
      });
    }

    return NextResponse.json({ ok: true, ticket: data });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServiceSupabase();
    const { error } = await supabase.from("support_tickets").delete().eq("id", id);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
