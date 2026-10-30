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
    | "resolved";
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

export default async function SupportTicketsPage() {
  const tickets = await getTickets();

  const open = tickets.filter((t) => t.progress !== "resolved");
  const stuck = tickets.filter((t) => t.stuck && t.progress !== "resolved");
  const notReplied = tickets.filter(
    (t) => t.reply_status === "not_replied" && t.progress !== "resolved"
  );

  const stats = [
    { label: "Open", value: open.length },
    { label: "Stuck", value: stuck.length, alert: stuck.length > 0 },
    { label: "Not replied", value: notReplied.length, alert: notReplied.length > 0 },
    { label: "Total", value: tickets.length },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Support Tickets</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Customer support cases across all channels
          </p>
        </div>
        <ImportSupportTicketsXLSX />
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">{s.label}</p>
              <p
                className={`text-2xl font-bold ${s.alert ? "text-red-600" : ""}`}
              >
                {s.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

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
              {tickets.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="text-center text-muted-foreground py-12"
                  >
                    No support tickets yet. Import the weekly Excel sheet to get
                    started.
                  </TableCell>
                </TableRow>
              ) : (
                tickets.map((t) => (
                  <TableRow key={t.id} className="align-top">
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
