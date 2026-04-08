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

import { normalizePO } from "@/lib/po";

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

    // Extract retailer from first row
    const retailer = normalizeRetailer(String(rows[0]["Merchant"] || ""));

    const supabase = await createServiceSupabase();

    // Build dedup set: eft+invoice_number (payments) and eft+adjustment_number (deductions)
    const fileEfts = new Set<string>();
    for (const r of rows) {
      const eft = String(r["EFT Number"] || "").trim();
      if (eft) fileEfts.add(eft);
    }

    const existingKeys = new Set<string>();
    const eftArr = [...fileEfts];
    for (let i = 0; i < eftArr.length; i += 200) {
      const batch = eftArr.slice(i, i + 200);
      const { data } = await supabase
        .from("remittance_lines")
        .select("eft_number, invoice_number, adjustment_number")
        .in("eft_number", batch);
      data?.forEach((d: any) => {
        if (d.invoice_number) existingKeys.add(`${d.eft_number}::inv::${d.invoice_number}`);
        if (d.adjustment_number) existingKeys.add(`${d.eft_number}::adj::${d.adjustment_number}`);
      });
    }

    // Collect all PO numbers for batch lookup
    const poNumbers = new Set<string>();
    rows.forEach((r) => {
      const po = String(r["Purchase Order Number"] || r["PO Number"] || "").trim();
      if (po) poNumbers.add(normalizePO(po, retailer));
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
    let duplicateCount = 0;

    const lines: {
      line_number: number;
      eft_number: string;
      payment_date: string | null;
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
      const eft = String(r["EFT Number"] || "").trim();
      const invoiceNum = String(r["Invoice Number"] || "").trim();
      const adjNum = String(r["Invoice Adjustment Number"] || "").trim();

      // Dedup: payment by eft+invoice_number, deduction by eft+adjustment_number
      if (eft && invoiceNum && existingKeys.has(`${eft}::inv::${invoiceNum}`)) {
        duplicateCount++;
        return;
      }
      if (eft && adjNum && !invoiceNum && existingKeys.has(`${eft}::adj::${adjNum}`)) {
        duplicateCount++;
        return;
      }

      const lineNum = parseInt(r["Transaction Line Number"]) || lines.length + 1;

      const paymentDate = parseDate(r["Payment Date"]);
      const rawPO = String(r["Purchase Order Number"] || r["PO Number"] || "").trim();
      const po = rawPO ? normalizePO(rawPO, retailer) : "";
      const invoiceDate = parseDate(r["Invoice Date"]);
      const invoiceAmount = parseCurrency(r["Invoice Amount"]);
      const lineAmount = parseCurrency(r["Line Balance Due"]);
      const discount = parseCurrency(r["Line Discount"] || r["Invoice Discount"]);
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
        eft_number: eft,
        payment_date: paymentDate,
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

    if (lines.length === 0) {
      return NextResponse.json({
        error: `All ${duplicateCount} lines are duplicates (already uploaded)`,
      }, { status: 400 });
    }

    // Link deductions to orders via adjustment_number → invoice_number chain
    // Step 1: Build invoice_number → { order_id, po_number } from payment lines in this file
    const invoiceToOrder: Record<string, { order_id: string | null; po_number: string }> = {};
    for (const l of lines) {
      if (l.invoice_number && (l.order_id || l.po_number)) {
        invoiceToOrder[l.invoice_number] = { order_id: l.order_id, po_number: l.po_number };
      }
    }

    // Step 2: Check DB for any adjustment_numbers not resolved from this file
    const unresolvedAdjs = lines
      .filter((l) => l.adjustment_number && !l.order_id && !invoiceToOrder[l.adjustment_number])
      .map((l) => l.adjustment_number);
    if (unresolvedAdjs.length > 0) {
      const uniqueAdjs = [...new Set(unresolvedAdjs)];
      for (let i = 0; i < uniqueAdjs.length; i += 200) {
        const batch = uniqueAdjs.slice(i, i + 200);
        const { data } = await supabase
          .from("remittance_lines")
          .select("invoice_number, order_id, po_number")
          .in("invoice_number", batch);
        data?.forEach((d: any) => {
          if (d.invoice_number && (d.order_id || d.po_number)) {
            invoiceToOrder[d.invoice_number] = { order_id: d.order_id, po_number: d.po_number };
          }
        });
      }
    }

    // Step 3: Apply — link deduction lines to orders
    let linkedCount = 0;
    for (const l of lines) {
      if (l.adjustment_number && !l.order_id) {
        const match = invoiceToOrder[l.adjustment_number];
        if (match) {
          l.order_id = match.order_id;
          if (!l.po_number) l.po_number = match.po_number;
          linkedCount++;
        }
      }
    }

    // Group lines by EFT number — one remittance per EFT
    const linesByEft = new Map<string, typeof lines>();
    for (const l of lines) {
      const eft = l.eft_number || "_no_eft";
      if (!linesByEft.has(eft)) linesByEft.set(eft, []);
      linesByEft.get(eft)!.push(l);
    }

    const remittanceIds: string[] = [];

    // Check which EFTs already have a remittance record
    const existingRemittances: Record<string, string> = {};
    for (let i = 0; i < eftArr.length; i += 200) {
      const batch = eftArr.slice(i, i + 200);
      const { data } = await supabase
        .from("remittances")
        .select("id, eft_number")
        .in("eft_number", batch);
      data?.forEach((d: any) => { existingRemittances[d.eft_number] = d.id; });
    }

    for (const [eft, eftLines] of linesByEft) {
      let remittanceId: string;

      if (eft !== "_no_eft" && existingRemittances[eft]) {
        // Add lines to existing remittance
        remittanceId = existingRemittances[eft];
      } else {
        // Create new remittance for this EFT
        const paymentDate = eftLines.find((l) => l.payment_date)?.payment_date || null;
        let eftInvoiced = 0, eftDiscount = 0, eftNet = 0;
        for (const l of eftLines) {
          eftInvoiced += l.invoice_amount;
          eftDiscount += l.discount;
          if (l.line_amount < 0) eftDiscount += Math.abs(l.line_amount);
          eftNet += l.line_amount;
        }

        const { data: remittance, error: remErr } = await supabase
          .from("remittances")
          .insert({
            retailer,
            payment_date: paymentDate,
            eft_number: eft === "_no_eft" ? null : eft,
            balance_due: eftNet,
            total_paid: eftInvoiced,
            total_deductions: eftDiscount,
            file_name: file.name,
          })
          .select("id")
          .single();

        if (remErr) throw remErr;
        remittanceId = remittance.id;
      }

      remittanceIds.push(remittanceId);

      // Insert lines in batches
      const lineRows = eftLines.map((l) => ({
        remittance_id: remittanceId,
        ...l,
      }));

      for (let i = 0; i < lineRows.length; i += 200) {
        const batch = lineRows.slice(i, i + 200);
        const { error: lineErr } = await supabase.from("remittance_lines").insert(batch);
        if (lineErr) throw lineErr;
      }
    }

    // Backfill: check if newly uploaded invoice_numbers can resolve
    // previously unlinked deduction lines in DB
    let backfilledCount = 0;
    const newInvoiceNumbers = lines
      .filter((l) => l.invoice_number && l.order_id)
      .map((l) => ({ invoice_number: l.invoice_number, order_id: l.order_id!, po_number: l.po_number }));

    if (newInvoiceNumbers.length > 0) {
      const invNums = [...new Set(newInvoiceNumbers.map((n) => n.invoice_number))];
      // Find unlinked deduction lines whose adjustment_number matches these invoice_numbers
      for (let i = 0; i < invNums.length; i += 200) {
        const batch = invNums.slice(i, i + 200);
        const { data: unlinked } = await supabase
          .from("remittance_lines")
          .select("id, adjustment_number")
          .in("adjustment_number", batch)
          .is("order_id", null);

        if (unlinked && unlinked.length > 0) {
          // Build lookup from this upload's invoice data
          const invLookup: Record<string, { order_id: string; po_number: string }> = {};
          for (const n of newInvoiceNumbers) {
            invLookup[n.invoice_number] = { order_id: n.order_id, po_number: n.po_number };
          }

          for (const row of unlinked) {
            const match = invLookup[row.adjustment_number];
            if (match) {
              await supabase
                .from("remittance_lines")
                .update({ order_id: match.order_id, po_number: match.po_number })
                .eq("id", row.id);
              backfilledCount++;
            }
          }
        }
      }
    }

    // Stats
    const matched = lines.filter((l) => l.order_id).length;
    const unmatched = lines.filter((l) => l.po_number && !l.order_id).length;
    const noPO = lines.filter((l) => !l.po_number && !l.order_id).length;

    return NextResponse.json({
      ok: true,
      remittance_ids: remittanceIds,
      remittance_count: remittanceIds.length,
      retailer,
      balance_due: totalNet,
      total_paid: totalInvoiced,
      total_deductions: totalDiscount,
      lines: lines.length,
      matched,
      unmatched,
      no_po: noPO,
      deductions_linked: linkedCount,
      deductions_backfilled: backfilledCount,
      duplicates_skipped: duplicateCount,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
