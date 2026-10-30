import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabase/server";
import {
  uploadTicketFiles,
  validateUploadFiles,
} from "@/lib/support/attachments";

export const maxDuration = 60;

// Internal (session-authed) note endpoint for the ticket detail page.
// Accepts JSON ({ content, author }) or multipart form data with a `content`
// field plus `files` entries, which are stored in the private attachments
// bucket and linked on the note.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    let content = "";
    let author = "CS";
    const files: File[] = [];

    if (req.headers.get("content-type")?.includes("multipart/form-data")) {
      const formData = await req.formData();
      content = String(formData.get("content") ?? "").trim();
      author = String(formData.get("author") ?? "CS").trim() || "CS";
      for (const entry of formData.getAll("files")) {
        if (entry instanceof File && entry.size > 0) files.push(entry);
      }
    } else {
      const body = await req.json();
      content = typeof body.content === "string" ? body.content.trim() : "";
      if (typeof body.author === "string" && body.author) author = body.author;
    }

    if (!content && files.length === 0) {
      return NextResponse.json(
        { ok: false, error: "content or files required" },
        { status: 400 }
      );
    }
    if (files.length > 0) {
      const invalid = validateUploadFiles(files);
      if (invalid) {
        return NextResponse.json({ ok: false, error: invalid }, { status: 400 });
      }
    }

    const supabase = await createServiceSupabase();

    const { data: ticket } = await supabase
      .from("support_tickets")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    if (!ticket) {
      return NextResponse.json(
        { ok: false, error: "Ticket not found" },
        { status: 404 }
      );
    }

    const { attachments, error: uploadError } = await uploadTicketFiles(
      supabase,
      id,
      files
    );
    if (uploadError) {
      return NextResponse.json({ ok: false, error: uploadError }, { status: 500 });
    }

    const { data, error } = await supabase
      .from("ticket_notes")
      .insert({
        ticket_id: id,
        kind: "note",
        author,
        content,
        attachments,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, note: data }, { status: 201 });
  } catch (err: unknown) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
