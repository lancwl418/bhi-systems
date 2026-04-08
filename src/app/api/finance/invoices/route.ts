import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabase/server";

export const maxDuration = 120;

function parseCurrency(val: string | number | undefined | null): number {
  if (typeof val === "number") return val;
  if (!val) return 0;
  const cleaned = String(val).replace(/[$,\s]/g, "");
  return parseFloat(cleaned) || 0;
}

function parseDate(val: string | undefined | null): string | null {
  if (!val || val === "N/A") return null;
  const s = String(val).trim();
  // "MM/DD/YYYY HH:MM AM/PM" or "MM/DD/YYYY"
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}

import { normalizePO } from "@/lib/po";

/** Parse CSV with quoted/unquoted mixed fields */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      i++;
      let val = "";
      while (i < line.length && line[i] !== '"') { val += line[i]; i++; }
      i++; // closing quote
      if (i < line.length && line[i] === ",") i++;
      result.push(val);
    } else {
      let val = "";
      while (i < line.length && line[i] !== ",") { val += line[i]; i++; }
      if (i < line.length) i++;
      result.push(val.trim());
    }
  }
  return result;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

    const text = await file.text();
    const lines = text.split("\n");

    // Find header row
    let headerIdx = -1;
    let headers: string[] = [];
    for (let i = 0; i < Math.min(lines.length, 20); i++) {
      if (lines[i].includes("Action (Transaction)") && lines[i].includes("Invoice Number")) {
        headerIdx = i;
        headers = parseCSVLine(lines[i]);
        break;
      }
    }
    if (headerIdx === -1) {
      return NextResponse.json({ error: "Could not find header row" }, { status: 400 });
    }

    // Build column index
    const colIdx: Record<string, number> = {};
    headers.forEach((h, i) => { colIdx[h] = i; });

    // Parse Invoice rows only (skip Ship rows)
    const invoiceRows: { po: string; invoiceNumber: string; invoiceDate: string | null; invoiceAmount: number; skuCode: string }[] = [];
    for (let i = headerIdx + 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const cols = parseCSVLine(lines[i]);
      const action = cols[colIdx["Action (Transaction)"]] || "";
      if (action !== "Invoice") continue;

      const rawPO = cols[colIdx["PO Number (Order)"]] || "";
      const merchant = cols[colIdx["Merchant (Order)"]] || "";
      const po = rawPO ? normalizePO(rawPO, merchant) : "";
      const invoiceNumber = cols[colIdx["Invoice Number (Transaction)"]] || "";
      const invoiceDate = parseDate(cols[colIdx["Invoice Date (Transaction)"]]);
      const invoiceAmount = parseCurrency(cols[colIdx["Invoice Total (Transaction)"]]);
      const skuCode = cols[colIdx["Vendor SKU (Order Line)"]] || "";

      if (!invoiceNumber || invoiceNumber === "N/A") continue;

      invoiceRows.push({ po, invoiceNumber, invoiceDate, invoiceAmount, skuCode });
    }

    if (invoiceRows.length === 0) {
      return NextResponse.json({ error: "No invoice rows found in file" }, { status: 400 });
    }

    // Group by invoice_number — same invoice can have multiple line items (SKUs)
    const invoiceMap: Record<string, { po: string; invoiceNumber: string; invoiceDate: string | null; invoiceAmount: number; skus: string[] }> = {};
    for (const r of invoiceRows) {
      if (!invoiceMap[r.invoiceNumber]) {
        invoiceMap[r.invoiceNumber] = {
          po: r.po,
          invoiceNumber: r.invoiceNumber,
          invoiceDate: r.invoiceDate,
          invoiceAmount: r.invoiceAmount,
          skus: [],
        };
      } else {
        // Same invoice, different line item — use the max amount (Invoice Total is per-invoice, not per-line)
        // If amounts differ across lines, keep the largest (it's the invoice total repeated)
        if (r.invoiceAmount > invoiceMap[r.invoiceNumber].invoiceAmount) {
          invoiceMap[r.invoiceNumber].invoiceAmount = r.invoiceAmount;
        }
      }
      if (r.skuCode) invoiceMap[r.invoiceNumber].skus.push(r.skuCode);
    }
    const groupedInvoices = Object.values(invoiceMap);

    const supabase = await createServiceSupabase();

    // Dedup: check existing invoice_numbers
    const allInvNums = groupedInvoices.map((r) => r.invoiceNumber);
    const existingInvs = new Set<string>();
    for (let i = 0; i < allInvNums.length; i += 200) {
      const batch = allInvNums.slice(i, i + 200);
      const { data } = await supabase
        .from("order_invoices")
        .select("invoice_number")
        .in("invoice_number", batch);
      data?.forEach((d: any) => existingInvs.add(d.invoice_number));
    }

    const newRows = groupedInvoices.filter((r) => !existingInvs.has(r.invoiceNumber));
    const skipped = groupedInvoices.length - newRows.length;

    if (newRows.length === 0) {
      return NextResponse.json({
        ok: true,
        total: invoiceRows.length,
        inserted: 0,
        skipped,
        message: "All invoices already exist",
      });
    }

    // Look up orders by PO
    const poNumbers = [...new Set(newRows.map((r) => r.po))];
    const orderMap: Record<string, string> = {};
    for (let i = 0; i < poNumbers.length; i += 200) {
      const batch = poNumbers.slice(i, i + 200);
      const { data } = await supabase
        .from("orders")
        .select("id, channel_order_id")
        .in("channel_order_id", batch);
      data?.forEach((o: any) => { orderMap[o.channel_order_id] = o.id; });
    }

    // Insert
    let inserted = 0;
    const insertRows = newRows.map((r) => ({
      order_id: orderMap[r.po] || null,
      po_number: r.po,
      invoice_number: r.invoiceNumber,
      invoice_date: r.invoiceDate,
      invoice_amount: r.invoiceAmount,
      sku_code: r.skus.join(", "),
    }));

    for (let i = 0; i < insertRows.length; i += 200) {
      const batch = insertRows.slice(i, i + 200);
      const { error } = await supabase.from("order_invoices").insert(batch);
      if (error) throw error;
      inserted += batch.length;
    }

    return NextResponse.json({
      ok: true,
      total_lines: invoiceRows.length,
      unique_invoices: groupedInvoices.length,
      inserted,
      skipped,
      matched: insertRows.filter((r) => r.order_id).length,
      unmatched: insertRows.filter((r) => !r.order_id).length,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
