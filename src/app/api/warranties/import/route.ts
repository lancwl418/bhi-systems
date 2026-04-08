import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabase/server";

export const maxDuration = 120;

function parseCSV(text: string): Record<string, string>[] {
  const rows: Record<string, string>[] = [];
  const lines: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (
      (ch === "\n" || (ch === "\r" && text[i + 1] === "\n")) &&
      !inQuotes
    ) {
      if (current.trim()) lines.push(current);
      current = "";
      if (ch === "\r") i++;
    } else {
      current += ch;
    }
  }
  if (current.trim()) lines.push(current);

  if (lines.length < 2) return rows;

  const headers = splitLine(lines[0]);
  for (let i = 1; i < lines.length; i++) {
    const values = splitLine(lines[i]);
    if (values.length >= headers.length) {
      const obj: Record<string, string> = {};
      headers.forEach((h, idx) => (obj[h.trim()] = (values[idx] || "").trim()));
      rows.push(obj);
    }
  }
  return rows;
}

function splitLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function parseDate(dateStr: string): string | null {
  if (!dateStr) return null;
  // Handle M/D/YYYY format from Google Forms
  const match = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (match) {
    const [, m, d, y] = match;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

function parseTimestamp(ts: string): string | null {
  if (!ts) return null;
  // Handle M/D/YYYY H:MM:SS format
  const match = ts.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})/
  );
  if (match) {
    const [, m, d, y, h, min, sec] = match;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}T${h.padStart(2, "0")}:${min}:${sec}`;
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ ok: false, error: "No file provided" }, { status: 400 });
    }

    const text = await file.text();
    const rows = parseCSV(text);

    if (rows.length === 0) {
      return NextResponse.json({ ok: false, error: "No data rows found" }, { status: 400 });
    }

    const supabase = await createServiceSupabase();

    // Get existing registrations to dedup by (customer_email + order_number + submitted_at)
    const { data: existing } = await supabase
      .from("warranty_registrations")
      .select("customer_email, order_number, submitted_at");

    const existingKeys = new Set(
      (existing ?? []).map(
        (r) => `${r.customer_email}||${r.order_number}||${r.submitted_at}`
      )
    );

    const toInsert = [];
    let skipped = 0;

    for (const row of rows) {
      // CSV has two "Email Address" columns — last one has the actual email
      // Headers with same name: first becomes "Email Address", second also "Email Address"
      // Our parser keeps the last value for duplicate keys
      const email =
        row["Email Address"] || "";
      const customerName = row["Full Name"] || "";

      if (!customerName) {
        skipped++;
        continue;
      }

      const submittedAt = parseTimestamp(row["Timestamp"] || "");
      const orderNumber = row["Purchase order Number / Order Number"] || row["Purchase Order Number / Order Number"] || "";

      const key = `${email.toLowerCase()}||${orderNumber}||${submittedAt}`;
      if (existingKeys.has(key)) {
        skipped++;
        continue;
      }
      existingKeys.add(key);

      toInsert.push({
        customer_name: customerName,
        customer_email: email || null,
        indoor_model:
          row["Indoor Product Type/Model Number (on the silver sticker)"] || null,
        indoor_serial: row["Indoor No."] || null,
        outdoor_model:
          row["Outdoor Product Type/Model Number (on the sliver sticker)"] || null,
        outdoor_serial: row["Outdoor No."] || null,
        purchase_date: parseDate(row["Date of Purchase"] || ""),
        purchase_from: row["Purchase from"] || null,
        order_number: orderNumber || null,
        contractor_name:
          row["Licensed contractor company or name"] || null,
        contractor_phone: row["Contractor phone number"] || null,
        contractor_email: row["Contractor email address"] || null,
        license_type: row["License type"] || null,
        license_no: row["License no."] || null,
        submitted_at: submittedAt,
      });
    }

    let inserted = 0;
    if (toInsert.length > 0) {
      // Insert in batches of 100
      for (let i = 0; i < toInsert.length; i += 100) {
        const batch = toInsert.slice(i, i + 100);
        const { error } = await supabase
          .from("warranty_registrations")
          .insert(batch);
        if (error) {
          console.error("Insert error:", error);
          return NextResponse.json(
            { ok: false, error: error.message },
            { status: 500 }
          );
        }
        inserted += batch.length;
      }
    }

    return NextResponse.json({
      ok: true,
      inserted,
      skipped,
    });
  } catch (err: unknown) {
    console.error("Warranty import error:", err);
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
