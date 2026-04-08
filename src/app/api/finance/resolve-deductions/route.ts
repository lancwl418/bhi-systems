import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabase/server";

/**
 * POST /api/finance/resolve-deductions
 * Body: { lineId?: string }  — resolve one line, or omit for bulk resolve all
 *
 * Traces adjustment_number → invoice_number (via remittance_lines or order_invoices)
 * to find the original order. Creates a return record and links the deduction.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const supabase = await createServiceSupabase();

    // Get unlinked deduction lines (no PO, have adjustment_number)
    let query = supabase
      .from("remittance_lines")
      .select("id, adjustment_number, adjustment_date, adjustment_reason, line_amount, eft_number, remittances(retailer)")
      .is("order_id", null)
      .not("adjustment_number", "eq", "");

    if (body.lineId) {
      query = query.eq("id", body.lineId);
    }

    const { data: unlinked } = await query;
    if (!unlinked || unlinked.length === 0) {
      return NextResponse.json({ ok: true, resolved: 0, message: "No unlinked deductions found" });
    }

    // Collect all adjustment_numbers to look up
    const adjNums = [...new Set(unlinked.map((l: any) => l.adjustment_number))];

    // Build invoice_number → { order_id, po_number, invoice_id } lookup
    const invoiceToOrder: Record<string, { order_id: string | null; po_number: string; invoice_id: string | null }> = {};

    // Check remittance_lines (payment lines where invoice_number = adjustment_number)
    for (let i = 0; i < adjNums.length; i += 200) {
      const batch = adjNums.slice(i, i + 200);
      const { data } = await supabase
        .from("remittance_lines")
        .select("invoice_number, order_id, po_number")
        .in("invoice_number", batch)
        .not("order_id", "is", null);
      data?.forEach((d: any) => {
        if (d.invoice_number) {
          invoiceToOrder[d.invoice_number] = { order_id: d.order_id, po_number: d.po_number, invoice_id: null };
        }
      });
    }

    // Check order_invoices for any still unresolved (also gets invoice_id)
    const allAdjs = [...adjNums]; // check all to get invoice_id even if already found order
    for (let i = 0; i < allAdjs.length; i += 200) {
      const batch = allAdjs.slice(i, i + 200);
      const { data } = await supabase
        .from("order_invoices")
        .select("id, invoice_number, order_id, po_number")
        .in("invoice_number", batch);
      data?.forEach((d: any) => {
        if (d.invoice_number) {
          const existing = invoiceToOrder[d.invoice_number];
          invoiceToOrder[d.invoice_number] = {
            order_id: existing?.order_id || d.order_id,
            po_number: existing?.po_number || d.po_number,
            invoice_id: d.id,
          };
        }
      });
    }

    // Check for existing returns to avoid duplicates
    const existingReturns = new Set<string>();
    for (let i = 0; i < adjNums.length; i += 200) {
      const batch = adjNums.slice(i, i + 200);
      const { data } = await supabase
        .from("returns")
        .select("adjustment_number")
        .in("adjustment_number", batch);
      data?.forEach((d: any) => existingReturns.add(d.adjustment_number));
    }

    // Resolve: update remittance_line + create return record
    let resolved = 0;
    for (const row of unlinked) {
      const match = invoiceToOrder[row.adjustment_number];
      if (!match) continue;

      // Update remittance_line with order link
      await supabase
        .from("remittance_lines")
        .update({ order_id: match.order_id, po_number: match.po_number })
        .eq("id", row.id);

      // Create return record if not already exists
      if (!existingReturns.has(row.adjustment_number)) {
        await supabase.from("returns").insert({
          order_id: match.order_id,
          invoice_id: match.invoice_id,
          remittance_line_id: row.id,
          po_number: match.po_number,
          invoice_number: row.adjustment_number,
          adjustment_number: row.adjustment_number,
          adjustment_date: row.adjustment_date,
          adjustment_reason: row.adjustment_reason,
          amount: parseFloat(row.line_amount) || 0,
          retailer: (row as any).remittances?.retailer || "",
          status: "pending",
        });
        existingReturns.add(row.adjustment_number);
      }

      resolved++;
    }

    // Second pass: resolve lines that have invoice_number but no order_id
    // (e.g. PO is N/A but invoice_number exists — look up via order_invoices)
    let invoiceResolved = 0;
    const { data: invoiceUnlinked } = await supabase
      .from("remittance_lines")
      .select("id, invoice_number")
      .is("order_id", null)
      .not("invoice_number", "eq", "");

    if (invoiceUnlinked && invoiceUnlinked.length > 0) {
      const invNums = [...new Set(invoiceUnlinked.map((l: any) => l.invoice_number))];
      const invToOrder: Record<string, { order_id: string; po_number: string }> = {};

      for (let i = 0; i < invNums.length; i += 200) {
        const batch = invNums.slice(i, i + 200);
        const { data } = await supabase
          .from("order_invoices")
          .select("invoice_number, order_id, po_number")
          .in("invoice_number", batch)
          .not("order_id", "is", null);
        data?.forEach((d: any) => {
          invToOrder[d.invoice_number] = { order_id: d.order_id, po_number: d.po_number };
        });
      }

      for (const row of invoiceUnlinked) {
        const match = invToOrder[row.invoice_number];
        if (match) {
          await supabase
            .from("remittance_lines")
            .update({ order_id: match.order_id, po_number: match.po_number })
            .eq("id", row.id);
          invoiceResolved++;
        }
      }
    }

    return NextResponse.json({
      ok: true,
      checked: unlinked.length,
      resolved,
      invoice_resolved: invoiceResolved,
      still_unresolved: unlinked.length - resolved,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
