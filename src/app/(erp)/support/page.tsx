export const dynamic = "force-dynamic";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createServiceSupabase } from "@/lib/supabase/server";
import { ImportSupportTicketsXLSX } from "./import-xlsx";
import { AutoRefresh } from "./auto-refresh";
import { TicketStatusEditor } from "./ticket-status-editor";
import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import {
  CASE_TYPE_COLORS,
  CASE_TYPE_LABELS,
  type CaseType,
} from "@/lib/support/case-types";

export interface SupportTicket {
  id: string;
  case_date: string | null;
  date_label: string | null;
  case_type: CaseType;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  source: string | null;
  channel: string | null;
  issue_summary: string;
  model_number: string | null;
  po_number: string | null;
  order_number: string | null;
  reply_status: "not_replied" | "in_progress" | "replied";
  progress:
    | "in_progress"
    | "awaiting_customer"
    | "awaiting_internal"
    | "awaiting_third_party"
    | "resolved"
    | "ignored";
  label: "pending" | "in_progress" | "completed";
  stuck: boolean;
  next_step: string | null;
  assignee: string | null;
  closed_at: string | null;
  created_at: string;
}

async function getTickets(): Promise<SupportTicket[]> {
  const supabase = await createServiceSupabase();

  const { data, error } = await supabase
    .from("support_tickets")
    .select("*")
    .order("case_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to load support tickets:", error);
    return [];
  }
  return (data ?? []) as SupportTicket[];
}

export default async function SupportTicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const { filter } = await searchParams;
  const tickets = await getTickets();

  const isDone = (t: SupportTicket) =>
    t.progress === "resolved" || t.progress === "ignored" || Boolean(t.closed_at);
  const open = tickets.filter((t) => !isDone(t));
  const stuck = open.filter((t) => t.stuck);
  const notReplied = open.filter((t) => t.reply_status === "not_replied");

  const stats = [
    { key: "open", label: "Open", value: open.length },
    { key: "stuck", label: "Stuck", value: stuck.length, alert: stuck.length > 0 },
    {
      key: "not_replied",
      label: "Not replied",
      value: notReplied.length,
      alert: notReplied.length > 0,
    },
    { key: "all", label: "Total", value: tickets.length },
  ];

  const activeFilter = ["open", "stuck", "not_replied"].includes(filter ?? "")
    ? filter
    : "all";
  const visibleTickets =
    activeFilter === "open"
      ? open
      : activeFilter === "stuck"
        ? stuck
        : activeFilter === "not_replied"
          ? notReplied
          : tickets;

  // Row emphasis: done/ignored fade out; stuck tickets jump out; unanswered
  // ones get a softer highlight.
  const rowTone = (t: SupportTicket) => {
    if (isDone(t)) return "opacity-50 bg-muted/30";
    if (t.stuck)
      return "bg-red-50/80 hover:bg-red-50 border-l-2 border-l-red-500";
    if (t.reply_status === "not_replied")
      return "bg-amber-50/70 hover:bg-amber-50 border-l-2 border-l-amber-400";
    return "";
  };

  return (
    <div className="space-y-6">
      <AutoRefresh />
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Support Tickets</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Customer support cases across all channels
          </p>
        </div>
        <ImportSupportTicketsXLSX />
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-red-400" />
          Stuck — follow up now
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-amber-400" />
          Not replied yet
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-gray-300" />
          Resolved / Ignored
        </span>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {stats.map((s) => {
          const active = activeFilter === s.key;
          return (
            <Link
              key={s.key}
              href={active || s.key === "all" ? "/support" : `/support?filter=${s.key}`}
            >
              <Card
                className={`transition-colors hover:bg-muted/50 ${
                  active && s.key !== "all" ? "ring-2 ring-primary" : ""
                }`}
              >
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">{s.label}</p>
                  <p
                    className={`text-2xl font-bold ${s.alert ? "text-red-600" : ""}`}
                  >
                    {s.value}
                  </p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {activeFilter !== "all" && (
        <p className="text-sm text-muted-foreground">
          Showing {visibleTickets.length} of {tickets.length} tickets
          {" · "}
          <Link href="/support" className="underline hover:text-foreground">
            clear filter
          </Link>
        </p>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Issue</TableHead>
                <TableHead>Reply</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Next Step</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleTickets.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center text-muted-foreground py-12"
                  >
                    {activeFilter !== "all"
                      ? "No tickets match this filter."
                      : "No support tickets yet. Import the weekly Excel sheet to get started."}
                  </TableCell>
                </TableRow>
              ) : (
                visibleTickets.map((t) => (
                  <TableRow key={t.id} className={`align-top ${rowTone(t)}`}>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {t.date_label ||
                        (t.case_date
                          ? new Date(t.case_date).toLocaleDateString()
                          : "—")}
                    </TableCell>
                    <TableCell>
                      <div className="min-w-[140px]">
                        <p className="text-sm font-medium flex items-center gap-1">
                          {t.stuck && (
                            <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                          )}
                          <Link
                            href={`/support/${t.id}`}
                            className="hover:underline"
                          >
                            {t.customer_name || t.customer_email || "—"}
                          </Link>
                        </p>
                        {t.customer_email && (
                          <p className="text-xs text-muted-foreground break-all">
                            {t.customer_email}
                          </p>
                        )}
                        {t.source && (
                          <p className="text-xs text-muted-foreground">
                            {t.source}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={CASE_TYPE_COLORS[t.case_type] ?? ""}
                        variant="secondary"
                      >
                        {CASE_TYPE_LABELS[t.case_type] ?? t.case_type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs max-w-[380px]">
                      <p className="line-clamp-4 whitespace-pre-wrap">
                        {t.issue_summary || "—"}
                      </p>
                    </TableCell>
                    <TableCell colSpan={2} className="p-2">
                      <TicketStatusEditor ticket={t} />
                    </TableCell>
                    <TableCell className="text-xs max-w-[300px]">
                      <p className="line-clamp-4 whitespace-pre-wrap">
                        {t.next_step || "—"}
                      </p>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
