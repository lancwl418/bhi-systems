"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  MessageSquare,
  Send,
  Loader2,
  Mail,
  Reply,
  Paperclip,
  CircleDot,
} from "lucide-react";
import { toast } from "sonner";

export interface ThreadAttachment {
  filename?: string;
  mime_type?: string;
  size?: number;
  url?: string;
  path?: string;
}

export interface ThreadEmail {
  id: string;
  direction: "inbound" | "outbound";
  from_addr: string | null;
  to_addr: string | null;
  cc: string | null;
  sent_at: string | null;
  subject: string | null;
  body: string | null;
  message_id: string | null;
  thread_id: string | null;
  attachments: ThreadAttachment[];
  created_at: string;
}

export interface ThreadNote {
  id: string;
  kind: "note" | "event";
  author: string;
  content: string;
  attachments?: ThreadAttachment[];
  created_at: string;
}

type ThreadItem =
  | { type: "email"; at: string; email: ThreadEmail }
  | { type: "note"; at: string; note: ThreadNote };

function formatSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function AttachmentChips({ attachments }: { attachments: ThreadAttachment[] }) {
  if (attachments.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {attachments.map((a, i) => (
        <span
          key={i}
          className="inline-flex items-center gap-1 rounded border bg-background px-2 py-0.5 text-xs"
        >
          <Paperclip className="h-3 w-3" />
          {a.url ? (
            <a
              href={a.url}
              target="_blank"
              rel="noreferrer"
              className="hover:underline"
            >
              {a.filename || "attachment"}
            </a>
          ) : (
            a.filename || "attachment"
          )}
          {a.size ? (
            <span className="text-muted-foreground">{formatSize(a.size)}</span>
          ) : null}
        </span>
      ))}
    </div>
  );
}

function EmailBubble({ email }: { email: ThreadEmail }) {
  const [expanded, setExpanded] = useState(false);
  const outbound = email.direction === "outbound";
  const body = email.body ?? "";
  const long = body.length > 600;

  return (
    <div className={`flex ${outbound ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-lg border p-3 text-sm ${
          outbound ? "bg-blue-50 border-blue-200" : "bg-muted/40"
        }`}
      >
        <div className="flex items-center gap-2 mb-1 text-xs text-muted-foreground">
          {outbound ? (
            <Reply className="h-3.5 w-3.5 text-blue-600 shrink-0" />
          ) : (
            <Mail className="h-3.5 w-3.5 shrink-0" />
          )}
          <span className="font-medium text-foreground">
            {outbound ? "BHI Support" : email.from_addr || "Customer"}
          </span>
          {email.sent_at && (
            <span>{new Date(email.sent_at).toLocaleString()}</span>
          )}
        </div>
        {email.subject && <p className="font-medium mb-1">{email.subject}</p>}
        {body && (
          <p className="whitespace-pre-wrap text-sm">
            {expanded || !long ? body : `${body.slice(0, 600)}…`}
          </p>
        )}
        {long && (
          <button
            className="text-xs text-blue-600 hover:underline mt-1"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "Show less" : "Show full message"}
          </button>
        )}
        <AttachmentChips attachments={email.attachments} />
      </div>
    </div>
  );
}

export function TicketThread({
  ticketId,
  emails,
  notes,
}: {
  ticketId: string;
  emails: ThreadEmail[];
  notes: ThreadNote[];
}) {
  const router = useRouter();
  const [newNote, setNewNote] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const items: ThreadItem[] = [
    ...emails.map((email) => ({
      type: "email" as const,
      at: email.sent_at || email.created_at,
      email,
    })),
    ...notes.map((note) => ({
      type: "note" as const,
      at: note.created_at,
      note,
    })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  const handleSubmit = async () => {
    if ((!newNote.trim() && pendingFiles.length === 0) || submitting) return;
    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("content", newNote.trim());
      formData.append("author", "CS");
      for (const file of pendingFiles) formData.append("files", file);

      const res = await fetch(`/api/support/tickets/${ticketId}/notes`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "Failed to add note");
      setNewNote("");
      setPendingFiles([]);
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to add note");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="self-start">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          Thread ({emails.length} emails · {notes.length} notes)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {items.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No emails or notes yet. Emails logged by the support agent and
            internal notes will show up here.
          </p>
        )}

        {items.map((item) =>
          item.type === "email" ? (
            <EmailBubble key={`e-${item.email.id}`} email={item.email} />
          ) : item.note.kind === "event" ? (
            <div
              key={`n-${item.note.id}`}
              className="flex items-center gap-2 text-xs text-muted-foreground"
            >
              <CircleDot className="h-3 w-3 shrink-0" />
              <span className="whitespace-pre-wrap">{item.note.content}</span>
              <span className="shrink-0">
                · {new Date(item.note.created_at).toLocaleString()}
              </span>
            </div>
          ) : (
            <div key={`n-${item.note.id}`} className="flex gap-3">
              <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium shrink-0">
                {item.note.author.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium">{item.note.author}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(item.note.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="text-sm whitespace-pre-wrap">{item.note.content}</p>
                <AttachmentChips attachments={item.note.attachments ?? []} />
              </div>
            </div>
          )
        )}

        <div className="space-y-2 pt-2 border-t">
          {pendingFiles.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {pendingFiles.map((file, i) => (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 rounded border bg-muted/40 px-2 py-0.5 text-xs"
                >
                  <Paperclip className="h-3 w-3" />
                  {file.name}
                  <span className="text-muted-foreground">{formatSize(file.size)}</span>
                  <button
                    className="ml-1 text-muted-foreground hover:text-foreground"
                    onClick={() =>
                      setPendingFiles((prev) => prev.filter((_, j) => j !== i))
                    }
                    aria-label={`Remove ${file.name}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <textarea
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Add an internal note... (⌘+Enter to send)"
              className="flex-1 min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit();
              }}
            />
            <input
              ref={fileRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                const selected = Array.from(e.target.files ?? []);
                if (selected.length > 0) {
                  setPendingFiles((prev) => [...prev, ...selected].slice(0, 10));
                }
                e.target.value = "";
              }}
            />
            <div className="flex flex-col gap-2 self-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileRef.current?.click()}
                disabled={submitting}
                aria-label="Attach files"
              >
                <Paperclip className="h-4 w-4" />
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={(!newNote.trim() && pendingFiles.length === 0) || submitting}
                size="sm"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
