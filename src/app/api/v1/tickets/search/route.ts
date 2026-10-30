import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabase/server";
import { requireApiToken, likeTerm, apiError } from "@/lib/support/api-auth";

const SUMMARY_FIELDS =
  "id, case_date, customer_name, customer_email, source, channel, issue_summary, " +
  "model_number, po_number, order_number, reply_status, progress, stuck, assignee, closed_at, created_at";

interface TicketSummary {
  id: string;
  customer_email: string | null;
  po_number: string | null;
  order_number: string | null;
  created_at: string;
  [key: string]: unknown;
}

// GET /api/v1/tickets/search?q=<email | PO | order no | name>
//                           &thread_id=<gmail thread id>
// Dedup check before creating a ticket or replying. thread_id matches via the
// email log; q matches email / PO / order number exactly (case-insensitive)
// and customer name fuzzily. Returns newest first.
export async function GET(req: NextRequest) {
  const denied = requireApiToken(req);
  if (denied) return denied;

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  const threadId = (req.nextUrl.searchParams.get("thread_id") ?? "").trim();
  if (!q && !threadId) {
    return apiError("q or thread_id is required", 400);
  }

  const supabase = await createServiceSupabase();
  const byId = new Map<string, TicketSummary & { match: string[] }>();

  if (threadId) {
    const { data: emailRows, error } = await supabase
      .from("ticket_emails")
      .select("ticket_id")
      .eq("thread_id", threadId);
    if (error) return apiError(error.message, 500);

    const ids = [...new Set((emailRows ?? []).map((r) => r.ticket_id))];
    if (ids.length > 0) {
      const { data } = await supabase
        .from("support_tickets")
        .select(SUMMARY_FIELDS)
        .in("id", ids);
      for (const t of (data ?? []) as unknown as TicketSummary[]) {
        byId.set(t.id, { ...t, match: ["thread_id"] });
      }
    }
  }

  if (q) {
    const exact = q.replace(/[,()%\\]/g, " ").trim();
    const { data, error } = await supabase
      .from("support_tickets")
      .select(SUMMARY_FIELDS)
      .or(
        [
          `customer_email.ilike.${exact}`,
          `po_number.ilike.${exact}`,
          `order_number.ilike.${exact}`,
          `customer_name.ilike.${likeTerm(q)}`,
        ].join(",")
      )
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) return apiError(error.message, 500);

    for (const t of (data ?? []) as unknown as TicketSummary[]) {
      const reasons: string[] = [];
      const lower = exact.toLowerCase();
      if ((t.customer_email ?? "").toLowerCase() === lower) reasons.push("email");
      if ((t.po_number ?? "").toLowerCase() === lower) reasons.push("po_number");
      if ((t.order_number ?? "").toLowerCase() === lower) reasons.push("order_number");
      if (reasons.length === 0) reasons.push("customer_name");

      const existing = byId.get(t.id);
      if (existing) existing.match.push(...reasons);
      else byId.set(t.id, { ...t, match: reasons });
    }
  }

  const tickets = [...byId.values()].sort((a, b) =>
    String(b.created_at).localeCompare(String(a.created_at))
  );

  return NextResponse.json({ ok: true, tickets, total: tickets.length });
}
