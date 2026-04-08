import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabase/server";
import { normalizePO } from "@/lib/po";

export const maxDuration = 300;

function parseCurrency(val: string | number | undefined | null): number {
  if (typeof val === "number") return val;
  if (!val || val === "N/A") return 0;
  const cleaned = String(val).replace(/[$,\s]/g, "");
  return parseFloat(cleaned) || 0;
}

function parseDate(val: string | undefined | null): string | null {
  if (!val || val === "N/A") return null;
  const s = String(val).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let i = 0;
  while (i < line.length) {
    if (line[i] === '"') {
      i++;
      let val = "";
      while (i < line.length) {
        if (line[i] === '"' && i + 1 < line.length && line[i + 1] === '"') {
          val += '"'; i += 2;
        } else if (line[i] === '"') { break; }
        else { val += line[i]; i++; }
      }
      i++;
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

interface ParsedLine {
  po: string;
  merchant: string;
  invoiceNumber: string;
  invoiceDate: string | null;
  invoiceAmount: number;
  skuCode: string;
  quantity: number;
  unitCost: number;
  orderDate: string | null;
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
      if (lines[i].includes("Invoice Number") && lines[i].includes("PO Number")) {
        headerIdx = i;
        headers = parseCSVLine(lines[i]);
        break;
      }
    }
    if (headerIdx === -1) {
      return NextResponse.json({ error: "Could not find header row" }, { status: 400 });
    }

    const col: Record<string, number> = {};
    headers.forEach((h, i) => { col[h] = i; });

    // Detect format: old format has "Action (Transaction)", new format doesn't
    const hasAction = "Action (Transaction)" in col;

    // Column name mapping (support both formats)
    const colPO = col["PO Number (Order)"] ?? col["PO Number"];
    const colInvNum = col["Invoice Number (Transaction)"] ?? col["Invoice Number"];
    const colInvDate = col["Invoice Date (Transaction)"] ?? col["Invoice Date"];
    const colInvTotal = col["Invoice Total (Transaction)"] ?? col["Invoice Total"];
    const colSKU = col["Vendor SKU (Order Line)"] ?? col["Vendor SKU"];
    const colMerchant = col["Merchant (Order)"] ?? col["Merchant"];
    const colUnitCost = col["Invoice Unit Cost (Transaction Line)"] ?? col["Invoice Unit Cost"];
    const colQty = col["Quantity Ordered (Order Line)"] ?? col["Quantity"];
    const colOrderDate = col["Order Date (Order)"] ?? col["Order Date"];

    // Parse rows
    const parsedLines: ParsedLine[] = [];
    for (let i = headerIdx + 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const c = parseCSVLine(lines[i]);

      // Old format: skip non-Invoice action rows
      if (hasAction) {
        const action = c[col["Action (Transaction)"]] || "";
        if (action !== "Invoice") continue;
      }

      const invoiceNumber = (c[colInvNum] || "").trim();
      if (!invoiceNumber || invoiceNumber === "N/A") continue;

      const rawPO = (c[colPO] || "").trim();
      const merchant = (c[colMerchant] || "").trim();
      const po = rawPO ? normalizePO(rawPO, merchant) : "";

      parsedLines.push({
        po,
        merchant,
        invoiceNumber,
        invoiceDate: parseDate(c[colInvDate]),
        invoiceAmount: parseCurrency(c[colInvTotal]),
        skuCode: (c[colSKU] || "").trim(),
        quantity: parseInt(c[colQty]) || 1,
        unitCost: parseCurrency(c[colUnitCost]),
        orderDate: parseDate(c[colOrderDate]),
      });
    }

    if (parsedLines.length === 0) {
      return NextResponse.json({ error: "No invoice rows found in file" }, { status: 400 });
    }

    // Group by invoice_number
    const invoiceMap: Record<string, {
      po: string; merchant: string; invoiceNumber: string;
      invoiceDate: string | null; invoiceAmount: number; orderDate: string | null;
      items: { skuCode: string; quantity: number; unitCost: number }[];
    }> = {};

    for (const r of parsedLines) {
      if (!invoiceMap[r.invoiceNumber]) {
        invoiceMap[r.invoiceNumber] = {
          po: r.po,
          merchant: r.merchant,
          invoiceNumber: r.invoiceNumber,
          invoiceDate: r.invoiceDate,
          invoiceAmount: r.invoiceAmount,
          orderDate: r.orderDate,
          items: [],
        };
      }
      invoiceMap[r.invoiceNumber].items.push({
        skuCode: r.skuCode,
        quantity: r.quantity,
        unitCost: r.unitCost,
      });
    }
    const grouped = Object.values(invoiceMap);

    const supabase = await createServiceSupabase();

    // Dedup
    const allInvNums = grouped.map((r) => r.invoiceNumber);
    const existingInvs = new Set<string>();
    for (let i = 0; i < allInvNums.length; i += 200) {
      const batch = allInvNums.slice(i, i + 200);
      const { data } = await supabase
        .from("order_invoices")
        .select("invoice_number")
        .in("invoice_number", batch);
      data?.forEach((d: any) => existingInvs.add(d.invoice_number));
    }

    const newInvoices = grouped.filter((r) => !existingInvs.has(r.invoiceNumber));
    const skipped = grouped.length - newInvoices.length;

    if (newInvoices.length === 0) {
      return NextResponse.json({
        ok: true,
        total_lines: parsedLines.length,
        unique_invoices: grouped.length,
        inserted: 0,
        skipped,
        message: "All invoices already exist",
      });
    }

    // Look up orders by PO
    const poNumbers = [...new Set(newInvoices.map((r) => r.po))];
    const orderMap: Record<string, string> = {};
    for (let i = 0; i < poNumbers.length; i += 200) {
      const batch = poNumbers.slice(i, i + 200);
      const { data } = await supabase
        .from("orders")
        .select("id, channel_order_id")
        .in("channel_order_id", batch);
      data?.forEach((o: any) => { orderMap[o.channel_order_id] = o.id; });
    }

    // Insert invoices + items
    let inserted = 0;
    for (let i = 0; i < newInvoices.length; i += 200) {
      const batch = newInvoices.slice(i, i + 200);

      const invoiceRows = batch.map((r) => ({
        order_id: orderMap[r.po] || null,
        po_number: r.po,
        invoice_number: r.invoiceNumber,
        invoice_date: r.invoiceDate,
        invoice_amount: r.invoiceAmount,
        sku_code: r.items.map((it) => it.skuCode).join(", "),
      }));

      const { data: insertedInvs, error } = await supabase
        .from("order_invoices")
        .insert(invoiceRows)
        .select("id, invoice_number");
      if (error) throw error;
      if (!insertedInvs) continue;

      inserted += insertedInvs.length;

      // Insert line items
      const invIdMap: Record<string, string> = {};
      insertedInvs.forEach((inv: any) => { invIdMap[inv.invoice_number] = inv.id; });

      const allItems: any[] = [];
      batch.forEach((r) => {
        const invId = invIdMap[r.invoiceNumber];
        if (!invId) return;
        r.items.forEach((it) => {
          allItems.push({
            invoice_id: invId,
            sku_code: it.skuCode,
            quantity: it.quantity,
            unit_cost: it.unitCost,
            line_total: it.unitCost * it.quantity,
          });
        });
      });

      if (allItems.length > 0) {
        for (let j = 0; j < allItems.length; j += 200) {
          const itemBatch = allItems.slice(j, j + 200);
          const { error: itemErr } = await supabase.from("order_invoice_items").insert(itemBatch);
          if (itemErr) throw itemErr;
        }
      }
    }

    return NextResponse.json({
      ok: true,
      total_lines: parsedLines.length,
      unique_invoices: grouped.length,
      inserted,
      skipped,
      matched: newInvoices.filter((r) => orderMap[r.po]).length,
      unmatched: newInvoices.filter((r) => !orderMap[r.po]).length,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
