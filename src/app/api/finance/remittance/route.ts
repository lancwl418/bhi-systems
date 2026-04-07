import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabase/server";
import { normalizeRetailer } from "@/lib/retailers";
import * as XLSX from "xlsx";

export const maxDuration = 120;

/* ── helpers ─────────────────────────────────────────────────────── */

function parseCurrency(val: string | number | undefined | null): number {
  if (typeof val === "number") return val;
  if (!val) return 0;
  const cleaned = String(val).replace(/[$,\s]/g, "");
  return parseFloat(cleaned) || 0;
}

function parseDate(val: string | number | undefined | null): string | null {
  if (!val) return null;
  const s = String(val).trim();
  if (s === "N/A" || s === "n/a") return null;

  // "20260406" → "2026-04-06"
  if (/^\d{8}$/.test(s)) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  }
  // "2026-04-03 ..." or "2026-04-03"
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    return s.slice(0, 10);
  }
  // "MM/DD/YYYY"
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }
  return null;
}

// Normalize PO: HD adds "00" prefix making 10-digit POs, and XLSX may
// parse POs as numbers stripping all leading zeros.  Orders table stores 8-digit POs.
function normalizePO(po: string): string {
  // 10-digit with "00" prefix → strip to 8
  if (po.length === 10 && po.startsWith("00")) return po.slice(2);
  // XLSX ate leading zeros → pad back to 8 digits
  if (po.length < 8 && /^\d+$/.test(po)) return po.padStart(8, "0");
  return po;
}

// Column name aliases — maps alternative names to the canonical key
const COLUMN_ALIASES: Record<string, string> = {
  "PO Number": "Purchase Order Number",
  "Invoice Adjustment Reason": "Invoice Adjustment Reason Code",
};

/** Locate the header row and return normalised row objects. */
function parseSheet(sheet: XLSX.WorkSheet): Record<string, any>[] {
  // Read as raw 2-D array so we can skip metadata rows
  const raw: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

  // Known columns that MUST appear in the header row
  const REQUIRED = ["Invoice Number", "Invoice Amount"];

  let headerIdx = -1;
  let headers: string[] = [];

  for (let i = 0; i < Math.min(raw.length, 20); i++) {
    const row = raw[i].map((c: any) => String(c).trim());
    if (REQUIRED.every((col) => row.includes(col))) {
      headerIdx = i;
      headers = row;
      break;
    }
  }

  if (headerIdx === -1) {
    // Fallback: assume first row is the header (original XLS behaviour)
    return XLSX.utils.sheet_to_json(sheet);
  }

  // Normalise header names via aliases
  const normHeaders = headers.map((h) => COLUMN_ALIASES[h] || h);

  // Build row objects from remaining rows
  const rows: Record<string, any>[] = [];
  for (let i = headerIdx + 1; i < raw.length; i++) {
    const cells = raw[i];
    // Skip empty rows
    if (!cells || cells.every((c: any) => !c && c !== 0)) continue;

    const obj: Record<string, any> = {};
    for (let j = 0; j < normHeaders.length; j++) {
      obj[normHeaders[j]] = cells[j] ?? "";
    }
    rows.push(obj);
  }
  return rows;
}

/* ── POST handler ────────────────────────────────────────────────── */

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = parseSheet(sheet);

    if (rows.length === 0) {
      return NextResponse.json({ error: "Empty spreadsheet" }, { status: 400 });
    }

    // Extract header-level info from data rows
    const retailer = normalizeRetailer(String(rows[0]["Merchant"] || ""));
    const paymentDate = parseDate(rows[0]["Payment Date"]);
    const eftNumber = String(rows[0]["EFT Number"] || "").trim();

    const supabase = await createServiceSupabase();

    // Duplicate check by EFT number
    if (eftNumber) {
      const { data: existing } = await supabase
        .from("remittances")
        .select("id")
        .eq("eft_number", eftNumber)
        .limit(1);
      if (existing && existing.length > 0) {
        return NextResponse.json({
          error: `Remittance with EFT ${eftNumber} already uploaded`,
        }, { status: 400 });
      }
    }

    // Collect all PO numbers for batch lookup
    const poNumbers = new Set<string>();
    rows.forEach((r) => {
      const po = String(r["Purchase Order Number"] || r["PO Number"] || "").trim();
      if (po) poNumbers.add(normalizePO(po));
    });

    // Look up orders by channel_order_id (PO number)
    const orderMap: Record<string, string> = {};
    if (poNumbers.size > 0) {
      const poArr = Array.from(poNumbers);
      for (let i = 0; i < poArr.length; i += 200) {
        const batch = poArr.slice(i, i + 200);
        const { data } = await supabase
          .from("orders")
          .select("id, channel_order_id")
          .in("channel_order_id", batch);
        data?.forEach((o) => {
          orderMap[o.channel_order_id] = o.id;
        });
      }
    }

    // Parse lines
    let totalInvoiced = 0;
    let totalDiscount = 0;
    let totalNet = 0;
    const lines: {
      line_number: number;
      order_id: string | null;
      po_number: string;
      invoice_number: string;
      invoice_date: string | null;
      invoice_amount: number;
      line_amount: number;
      discount: number;
      adjustment_number: string;
      adjustment_date: string | null;
      adjustment_reason: string;
      line_type: string;
    }[] = [];

    rows.forEach((r) => {
      const lineNum = parseInt(r["Transaction Line Number"]) || lines.length + 1;
      const rawPO = String(r["Purchase Order Number"] || r["PO Number"] || "").trim();
      const po = rawPO ? normalizePO(rawPO) : "";
      const invoiceNum = String(r["Invoice Number"] || "").trim();
      const invoiceDate = parseDate(r["Invoice Date"]);
      const invoiceAmount = parseCurrency(r["Invoice Amount"]);
      const lineAmount = parseCurrency(r["Line Balance Due"]);
      const discount = parseCurrency(r["Line Discount"] || r["Invoice Discount"]);
      const adjNum = String(r["Invoice Adjustment Number"] || "").trim();
      const adjDate = parseDate(r["Invoice Adjustment Date"]);
      const adjReason = String(r["Invoice Adjustment Reason Code"] || "").trim();

      totalInvoiced += invoiceAmount;
      totalDiscount += discount;
      if (lineAmount < 0) totalDiscount += Math.abs(lineAmount);
      totalNet += lineAmount;

      let lineType = "payment";
      if (lineAmount < 0) {
        lineType = po ? "deduction" : "adjustment";
      }

      const orderId = po ? (orderMap[po] || null) : null;

      lines.push({
        line_number: lineNum,
        order_id: orderId,
        po_number: po,
        invoice_number: invoiceNum,
        invoice_date: invoiceDate,
        invoice_amount: invoiceAmount,
        line_amount: lineAmount,
        discount,
        adjustment_number: adjNum,
        adjustment_date: adjDate,
        adjustment_reason: adjReason,
        line_type: lineType,
      });
    });

    // Insert remittance
    const { data: remittance, error: remErr } = await supabase
      .from("remittances")
      .insert({
        retailer,
        payment_date: paymentDate,
        eft_number: eftNumber,
        balance_due: totalNet,
        total_paid: totalInvoiced,
        total_deductions: totalDiscount,
        file_name: file.name,
      })
      .select("id")
      .single();

    if (remErr) throw remErr;

    // Insert lines in batches
    const lineRows = lines.map((l) => ({
      remittance_id: remittance.id,
      ...l,
    }));

    for (let i = 0; i < lineRows.length; i += 200) {
      const batch = lineRows.slice(i, i + 200);
      const { error: lineErr } = await supabase.from("remittance_lines").insert(batch);
      if (lineErr) throw lineErr;
    }

    // Stats
    const matched = lines.filter((l) => l.order_id).length;
    const unmatched = lines.filter((l) => l.po_number && !l.order_id).length;
    const noPO = lines.filter((l) => !l.po_number).length;

    return NextResponse.json({
      ok: true,
      remittance_id: remittance.id,
      retailer,
      payment_date: paymentDate,
      eft_number: eftNumber,
      balance_due: totalNet,
      total_paid: totalInvoiced,
      total_deductions: totalDiscount,
      lines: lines.length,
      matched,
      unmatched,
      no_po: noPO,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
