import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabase/server";
import { randomUUID } from "node:crypto";

export const maxDuration = 60;

const BUCKET = "ticket-attachments";
const MAX_FILES = 10;
const MAX_FILE_SIZE = 25 * 1024 * 1024;

interface NoteAttachment {
  filename: string;
  mime_type: string;
  size: number;
  path: string;
}

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
    if (files.length > MAX_FILES) {
      return NextResponse.json(
        { ok: false, error: `At most ${MAX_FILES} files per note` },
        { status: 400 }
      );
    }
    const oversize = files.find((f) => f.size > MAX_FILE_SIZE);
    if (oversize) {
      return NextResponse.json(
        { ok: false, error: `${oversize.name} exceeds the 25 MB limit` },
        { status: 400 }
      );
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

    const attachments: NoteAttachment[] = [];
    for (const file of files) {
      const safeName = file.name.replace(/[^\w.\-()\[\] ]+/g, "_");
      const path = `${id}/${randomUUID()}-${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, Buffer.from(await file.arrayBuffer()), {
          contentType: file.type || "application/octet-stream",
        });
      if (uploadError) {
        return NextResponse.json(
          { ok: false, error: `Upload failed for ${file.name}: ${uploadError.message}` },
          { status: 500 }
        );
      }
      attachments.push({
        filename: file.name,
        mime_type: file.type || "application/octet-stream",
        size: file.size,
        path,
      });
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
