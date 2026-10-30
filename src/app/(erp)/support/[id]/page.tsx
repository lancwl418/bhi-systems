export const dynamic = "force-dynamic";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createServiceSupabase } from "@/lib/supabase/server";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import {
  CASE_TYPE_COLORS,
  CASE_TYPE_LABELS,
} from "@/lib/support/case-types";
import type { SupportTicket } from "../page";
import { TicketThread, type ThreadEmail, type ThreadNote } from "./thread";
import { TicketActions } from "./ticket-actions";
import { TicketStatusEditor } from "../ticket-status-editor";

interface Props {
  params: Promise<{ id: string }>;
}

interface TicketDraft {
  id: string;
  subject: string | null;
  body: string;
  created_by: string;
  created_at: string;
}

async function getTicket(id: string) {
  const supabase = await createServiceSupabase();

  const { data: ticket } = await supabase
    .from("support_tickets")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!ticket) return null;

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

  // Attachments live in a private bucket — resolve short-lived signed URLs
  // for anything stored with a `path` (note uploads, agent-uploaded files).
  const paths: string[] = [];
  for (const row of [...(notes ?? []), ...(emails ?? [])]) {
    for (const a of row.attachments ?? []) {
      if (a.path && !a.url) paths.push(a.path);
    }
  }
  const signedByPath = new Map<string, string>();
  if (paths.length > 0) {
    const { data: signed } = await supabase.storage
      .from("ticket-attachments")
      .createSignedUrls(paths, 60 * 60);
    for (const s of signed ?? []) {
      if (s.path && s.signedUrl) signedByPath.set(s.path, s.signedUrl);
    }
  }
  const withUrls = <T extends { attachments?: { path?: string; url?: string }[] }>(
    rows: T[]
  ): T[] =>
    rows.map((row) => ({
      ...row,
      attachments: (row.attachments ?? []).map((a) => ({
        ...a,
        url: a.url || (a.path ? signedByPath.get(a.path) : undefined),
      })),
    }));

  return {
    ticket: ticket as SupportTicket,
    notes: withUrls((notes ?? []) as ThreadNote[]),
    emails: withUrls((emails ?? []) as ThreadEmail[]),
    drafts: (drafts ?? []) as TicketDraft[],
  };
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-3 text-sm">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-right break-all">{value}</span>
    </div>
  );
}

export default async function SupportTicketDetailPage({ params }: Props) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const data = await getTicket(id);
  if (!data) notFound();
  const { ticket, notes, emails, drafts } = data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/support"
            className="text-sm text-muted-foreground hover:underline flex items-center gap-1 mb-2"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Support Tickets
          </Link>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            {ticket.stuck && !ticket.closed_at && (
              <AlertTriangle className="h-5 w-5 text-red-500" />
            )}
            {ticket.customer_name || ticket.customer_email || "Ticket"}
          </h2>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <Badge
              className={CASE_TYPE_COLORS[ticket.case_type] ?? ""}
              variant="secondary"
            >
              {CASE_TYPE_LABELS[ticket.case_type] ?? ticket.case_type}
            </Badge>
            {ticket.closed_at ? (
              <Badge variant="secondary" className="bg-gray-100 text-gray-600">
                Closed {new Date(ticket.closed_at).toLocaleDateString()}
              </Badge>
            ) : (
              <Badge variant="secondary" className="bg-green-100 text-green-800">
                Open
              </Badge>
            )}
            <span className="text-sm text-muted-foreground">
              {ticket.date_label ||
                (ticket.case_date
                  ? new Date(ticket.case_date).toLocaleDateString()
                  : "")}
            </span>
          </div>
        </div>
        <TicketActions ticket={ticket} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <InfoRow label="Email" value={ticket.customer_email} />
              <InfoRow label="Phone" value={ticket.customer_phone} />
              <InfoRow label="Source" value={ticket.source} />
              <InfoRow label="Channel" value={ticket.channel} />
              <InfoRow
                label="Model"
                value={
                  ticket.model_number && (
                    <span className="font-mono text-xs">{ticket.model_number}</span>
                  )
                }
              />
              <InfoRow
                label="PO #"
                value={
                  ticket.po_number && (
                    <span className="font-mono text-xs">{ticket.po_number}</span>
                  )
                }
              />
              <InfoRow
                label="Order #"
                value={
                  ticket.order_number && (
                    <span className="font-mono text-xs">{ticket.order_number}</span>
                  )
                }
              />
              <InfoRow label="Assignee" value={ticket.assignee} />
              <div className="pt-3 border-t mt-3">
                <TicketStatusEditor ticket={ticket} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Issue</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-wrap">{ticket.issue_summary}</p>
              {ticket.next_step && (
                <div className="mt-4 pt-3 border-t">
                  <p className="text-xs font-medium text-muted-foreground mb-1">
                    Next step
                  </p>
                  <p className="text-sm whitespace-pre-wrap">{ticket.next_step}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {drafts.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">
                  Reply Drafts ({drafts.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {drafts.map((d) => (
                  <div key={d.id} className="text-sm border-l-2 pl-3">
                    {d.subject && <p className="font-medium">{d.subject}</p>}
                    <p className="whitespace-pre-wrap text-muted-foreground line-clamp-6">
                      {d.body}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {d.created_by} · {new Date(d.created_at).toLocaleString()}
                    </p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        <TicketThread ticketId={ticket.id} emails={emails} notes={notes} />
      </div>
    </div>
  );
}
