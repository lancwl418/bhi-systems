import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { createServiceSupabase } from "@/lib/supabase/server";

export const maxDuration = 120;

// Import of the CS team's weekly Excel sheet, e.g.
// "BHI Support Cases (2026-10-21 - 10-23).xlsx". Columns:
// # | Date | Customer | Email | Source | Issue Summary | Reply Status | Progress | Stuck | Next Step

type ReplyStatus = "not_replied" | "in_progress" | "replied";
type Progress =
  | "in_progress"
  | "awaiting_customer"
  | "awaiting_internal"
  | "awaiting_third_party"
  | "resolved";

function mapReplyStatus(raw: string): ReplyStatus {
  const value = raw.trim().toLowerCase();
  if (value.startsWith("replied")) return "replied";
  if (value.startsWith("not")) return "not_replied";
  return "in_progress";
}

function mapProgress(raw: string): Progress {
  const value = raw.trim().toLowerCase();
  if (value.includes("resolved") || value.includes("closed")) return "resolved";
  if (value.includes("customer")) return "awaiting_customer";
  if (value.includes("internal")) return "awaiting_internal";
  if (value.includes("third")) return "awaiting_third_party";
  return "in_progress";
}

// Date cells are messy: Excel serial numbers (46321), "10-21", or a range
// label like "10-21 ~ 10-23". `yearHint` comes from serial-dated rows in the
// same file so the "MM-DD" strings land in the right year.
function parseCaseDate(
  raw: string | number | undefined,
  yearHint: number | null
): { date: string | null; label: string | null } {
  if (raw === undefined || raw === null || raw === "") {
    return { date: null, label: null };
  }

  if (typeof raw === "number") {
    const parsed = XLSX.SSF.parse_date_code(raw);
    if (!parsed) return { date: null, label: String(raw) };
    const label = `${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
    return {
      date: `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`,
      label,
    };
  }

  const label = String(raw).trim();
  const match = label.match(/(\d{1,2})-(\d{1,2})/);
  if (!match) return { date: null, label };

  const month = parseInt(match[1], 10);
  const day = parseInt(match[2], 10);
  let year = yearHint ?? new Date().getFullYear();
  // No hint and the date would land more than a month in the future → it is
  // from last year (e.g. importing a December sheet in January).
  if (yearHint === null) {
    const candidate = new Date(Date.UTC(year, month - 1, day));
    if (candidate.getTime() > Date.now() + 31 * 24 * 3600 * 1000) year -= 1;
  }
  return {
    date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    label,
  };
}

function dedupKey(email: string, summary: string): string {
  return `${email.trim().toLowerCase()}|${summary.trim().toLowerCase().slice(0, 120)}`;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json(
        { ok: false, error: "No file provided" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows: (string | number | undefined)[][] = XLSX.utils.sheet_to_json(
      sheet,
      { header: 1, raw: true }
    );

    if (rows.length < 2) {
      return NextResponse.json(
        { ok: false, error: "No data rows found" },
        { status: 400 }
      );
    }

    // Map header names → column indexes so column order changes don't break import
    const header = rows[0].map((h) => String(h ?? "").trim().toLowerCase());
    const col = (name: string) => header.findIndex((h) => h.includes(name));
    const idx = {
      date: col("date"),
      customer: col("customer"),
      email: col("email"),
      source: col("source"),
      summary: col("issue"),
      replyStatus: col("reply"),
      progress: col("progress"),
      stuck: col("stuck"),
      nextStep: col("next"),
    };
    if (idx.customer === -1 || idx.summary === -1) {
      return NextResponse.json(
        { ok: false, error: "Unrecognized sheet format: missing Customer / Issue Summary columns" },
        { status: 400 }
      );
    }

    const dataRows = rows
      .slice(1)
      .filter((r) => r.some((cell) => String(cell ?? "").trim() !== ""));

    // Year hint from any Excel-serial date in the file
    let yearHint: number | null = null;
    for (const row of dataRows) {
      const value = idx.date >= 0 ? row[idx.date] : undefined;
      if (typeof value === "number") {
        const parsed = XLSX.SSF.parse_date_code(value);
        if (parsed) {
          yearHint = parsed.y;
          break;
        }
      }
    }

    const supabase = await createServiceSupabase();

    const { data: existing } = await supabase
      .from("support_tickets")
      .select("customer_email, issue_summary");
    const existingKeys = new Set(
      (existing ?? []).map((t) => dedupKey(t.customer_email ?? "", t.issue_summary))
    );

    const str = (row: (string | number | undefined)[], i: number) =>
      i >= 0 ? String(row[i] ?? "").trim() : "";

    let inserted = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const row of dataRows) {
      const customer = str(row, idx.customer);
      const summary = str(row, idx.summary);
      if (!customer && !summary) continue;

      const email = str(row, idx.email);
      const key = dedupKey(email, summary);
      if (existingKeys.has(key)) {
        skipped++;
        continue;
      }
      existingKeys.add(key);

      const { date, label } = parseCaseDate(
        idx.date >= 0 ? row[idx.date] : undefined,
        yearHint
      );

      // The Stuck column should be Yes/No, but some rows carry note text there
      // (shifted content) — treat that as part of Next Step instead.
      const stuckRaw = str(row, idx.stuck);
      const stuck = /^yes/i.test(stuckRaw);
      let nextStep = str(row, idx.nextStep);
      if (stuckRaw && !/^(yes|no)\b/i.test(stuckRaw)) {
        nextStep = nextStep ? `${stuckRaw}; ${nextStep}` : stuckRaw;
      }

      const { error } = await supabase.from("support_tickets").insert({
        case_date: date,
        date_label: label,
        customer_name: customer,
        customer_email: email || null,
        source: str(row, idx.source) || null,
        issue_summary: summary,
        reply_status: mapReplyStatus(str(row, idx.replyStatus)),
        progress: mapProgress(str(row, idx.progress)),
        stuck,
        next_step: nextStep || null,
      });

      if (error) {
        errors.push(`${customer}: ${error.message}`);
        continue;
      }
      inserted++;
    }

    return NextResponse.json({
      ok: true,
      inserted,
      skipped,
      ...(errors.length > 0 ? { errors } : {}),
    });
  } catch (err: unknown) {
    console.error("Support tickets import error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
