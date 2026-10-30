import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

// Ticket attachments live in this private bucket; consumers get short-lived
// signed URLs. Shared by the internal notes upload, the v1 upload endpoint,
// and the read paths that resolve URLs.

export const ATTACHMENTS_BUCKET = "ticket-attachments";
export const MAX_FILES_PER_UPLOAD = 10;
export const MAX_FILE_SIZE = 25 * 1024 * 1024;
export const SIGNED_URL_TTL = 60 * 60;

export interface AttachmentMeta {
  filename?: string;
  mime_type?: string;
  size?: number;
  url?: string;
  path?: string;
}

export function validateUploadFiles(files: File[]): string | null {
  if (files.length === 0) return "No files provided";
  if (files.length > MAX_FILES_PER_UPLOAD) {
    return `At most ${MAX_FILES_PER_UPLOAD} files per upload`;
  }
  const oversize = files.find((f) => f.size > MAX_FILE_SIZE);
  if (oversize) return `${oversize.name} exceeds the 25 MB limit`;
  return null;
}

export async function uploadTicketFiles(
  supabase: SupabaseClient,
  ticketId: string,
  files: File[]
): Promise<{ attachments: AttachmentMeta[]; error: string | null }> {
  const attachments: AttachmentMeta[] = [];
  for (const file of files) {
    const safeName = file.name.replace(/[^\w.\-()\[\] ]+/g, "_");
    const path = `${ticketId}/${randomUUID()}-${safeName}`;
    const { error } = await supabase.storage
      .from(ATTACHMENTS_BUCKET)
      .upload(path, Buffer.from(await file.arrayBuffer()), {
        contentType: file.type || "application/octet-stream",
      });
    if (error) {
      return {
        attachments,
        error: `Upload failed for ${file.name}: ${error.message}`,
      };
    }
    attachments.push({
      filename: file.name,
      mime_type: file.type || "application/octet-stream",
      size: file.size,
      path,
    });
  }
  return { attachments, error: null };
}

// Resolve signed URLs for path-based attachments across a set of rows
// (notes, emails). Attachments that already carry a url are left alone.
export async function signAttachmentUrls<
  T extends { attachments?: AttachmentMeta[] | null }
>(supabase: SupabaseClient, rows: T[], expiresIn = SIGNED_URL_TTL): Promise<T[]> {
  const paths: string[] = [];
  for (const row of rows) {
    for (const a of row.attachments ?? []) {
      if (a.path && !a.url) paths.push(a.path);
    }
  }
  if (paths.length === 0) return rows;

  const { data: signed } = await supabase.storage
    .from(ATTACHMENTS_BUCKET)
    .createSignedUrls(paths, expiresIn);
  const byPath = new Map<string, string>();
  for (const s of signed ?? []) {
    if (s.path && s.signedUrl) byPath.set(s.path, s.signedUrl);
  }

  return rows.map((row) => ({
    ...row,
    attachments: (row.attachments ?? []).map((a) => ({
      ...a,
      url: a.url || (a.path ? byPath.get(a.path) : undefined),
    })),
  }));
}
