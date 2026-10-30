import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabase/server";
import { requireApiToken, likeTerm, apiError } from "@/lib/support/api-auth";
import { CASE_TYPES, type CaseType } from "@/lib/support/case-types";

// GET /api/v1/tickets — list with filters + pagination
//   ?status=open|closed  ?progress=  ?reply_status=  ?stuck=true|false
//   ?source=  ?channel=  ?assignee=  ?date_from=  ?date_to=  (case_date)
//   ?q= keyword across email / PO / order no / customer name / summary
//   ?page=1  ?per_page=50 (max 200)
export async function GET(req: NextRequest) {
  const denied = requireApiToken(req);
  if (denied) return denied;

  const params = req.nextUrl.searchParams;
  const page = Math.max(1, parseInt(params.get("page") || "1", 10) || 1);
  const perPage = Math.min(
    200,
    Math.max(1, parseInt(params.get("per_page") || "50", 10) || 50)
  );

  const supabase = await createServiceSupabase();
  let query = supabase
    .from("support_tickets")
    .select("*", { count: "exact" });

  const status = params.get("status");
  if (status === "open") query = query.is("closed_at", null);
  else if (status === "closed") query = query.not("closed_at", "is", null);

  const progress = params.get("progress");
  if (progress) query = query.eq("progress", progress);

  const replyStatus = params.get("reply_status");
  if (replyStatus) query = query.eq("reply_status", replyStatus);

  const stuck = params.get("stuck");
  if (stuck === "true") query = query.eq("stuck", true);
  else if (stuck === "false") query = query.eq("stuck", false);

  const source = params.get("source");
  if (source) query = query.ilike("source", likeTerm(source));

  const channel = params.get("channel");
  if (channel) query = query.ilike("channel", likeTerm(channel));

  const caseType = params.get("case_type");
  if (caseType) query = query.eq("case_type", caseType);

  const assignee = params.get("assignee");
  if (assignee) query = query.ilike("assignee", likeTerm(assignee));

  const dateFrom = params.get("date_from");
  if (dateFrom) query = query.gte("case_date", dateFrom);
  const dateTo = params.get("date_to");
  if (dateTo) query = query.lte("case_date", dateTo);

  const q = params.get("q");
  if (q) {
    const term = likeTerm(q);
    query = query.or(
      [
        `customer_email.ilike.${term}`,
        `customer_name.ilike.${term}`,
        `po_number.ilike.${term}`,
        `order_number.ilike.${term}`,
        `model_number.ilike.${term}`,
        `issue_summary.ilike.${term}`,
      ].join(",")
    );
  }

  const from = (page - 1) * perPage;
  const { data, count, error } = await query
    .order("case_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(from, from + perPage - 1);

  if (error) return apiError(error.message, 500);

  return NextResponse.json({
    ok: true,
    tickets: data ?? [],
    page,
    per_page: perPage,
    total: count ?? 0,
  });
}

// POST /api/v1/tickets — create a ticket
export async function POST(req: NextRequest) {
  const denied = requireApiToken(req);
  if (denied) return denied;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return apiError("Invalid JSON body", 400);
  }

  const str = (key: string) => {
    const value = body[key];
    return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
  };

  const customerName = str("customer_name");
  const customerEmail = str("customer_email");
  const issueSummary = str("issue_summary");
  if (!issueSummary || (!customerName && !customerEmail)) {
    return apiError(
      "issue_summary and customer_name or customer_email are required",
      400
    );
  }

  const insert: Record<string, unknown> = {
    case_date: str("case_date"),
    date_label: str("date_label"),
    customer_name: customerName ?? "",
    customer_email: customerEmail,
    customer_phone: str("customer_phone"),
    source: str("source"),
    channel: str("channel"),
    issue_summary: issueSummary,
    model_number: str("model_number"),
    po_number: str("po_number"),
    order_number: str("order_number"),
    assignee: str("assignee"),
    next_step: str("next_step"),
  };
  if (str("reply_status")) insert.reply_status = str("reply_status");
  if (str("progress")) insert.progress = str("progress");
  if (typeof body.stuck === "boolean") insert.stuck = body.stuck;

  const caseType = str("case_type");
  if (caseType) {
    if (!CASE_TYPES.includes(caseType as CaseType)) {
      return apiError(
        `Invalid case_type; expected one of: ${CASE_TYPES.join(", ")}`,
        400
      );
    }
    insert.case_type = caseType;
  }

  const supabase = await createServiceSupabase();
  const { data, error } = await supabase
    .from("support_tickets")
    .insert(insert)
    .select()
    .single();

  if (error) return apiError(error.message, 500);

  return NextResponse.json({ ok: true, ticket: data }, { status: 201 });
}
