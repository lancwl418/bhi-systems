import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabase/server";
import { requireApiToken, isUuid, apiError } from "@/lib/support/api-auth";
import {
  uploadTicketFiles,
  validateUploadFiles,
  signAttachmentUrls,
} from "@/lib/support/attachments";

export const maxDuration = 120;

type Params = { params: Promise<{ id: string }> };

// POST /api/v1/tickets/:id/attachments — upload files (multipart form data,
// `files` entries; up to 10 files, 25 MB each). Returns attachment metadata
// whose `path` can be referenced in subsequent POST .../emails or .../notes
// calls; each entry also carries a short-lived signed `url`.
export async function POST(req: NextRequest, { params }: Params) {
  const denied = requireApiToken(req);
  if (denied) return denied;

  const { id } = await params;
  if (!isUuid(id)) return apiError("Ticket not found", 404);

  if (!req.headers.get("content-type")?.includes("multipart/form-data")) {
    return apiError("Expected multipart/form-data with `files` entries", 400);
  }

  const formData = await req.formData();
  const files: File[] = [];
  for (const entry of [...formData.getAll("files"), ...formData.getAll("file")]) {
    if (entry instanceof File && entry.size > 0) files.push(entry);
  }
  const invalid = validateUploadFiles(files);
  if (invalid) return apiError(invalid, 400);

  const supabase = await createServiceSupabase();

  const { data: ticket } = await supabase
    .from("support_tickets")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (!ticket) return apiError("Ticket not found", 404);

  const { attachments, error } = await uploadTicketFiles(supabase, id, files);
  if (error) return apiError(error, 500);

  const [signed] = await signAttachmentUrls(supabase, [{ attachments }]);

  return NextResponse.json(
    { ok: true, attachments: signed.attachments },
    { status: 201 }
  );
}
