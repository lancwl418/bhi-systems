import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabase/server";

/**
 * POST /api/finance/resolve-deductions
 * Body: { lineId?: string }  — resolve one line, or omit for bulk resolve all
 *
 * Traces adjustment_number → invoice_number (via remittance_lines or order_invoices)
 * to find the original order and link the deduction.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const supabase = await createServiceSupabase();

    // Get unlinked deduction lines
    let query = supabase
      .from("remittance_lines")
      .select("id, adjustment_number")
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

    // Build invoice_number → { order_id, po_number } lookup
    const invoiceToOrder: Record<string, { order_id: string; po_number: string }> = {};

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
          invoiceToOrder[d.invoice_number] = { order_id: d.order_id, po_number: d.po_number };
        }
      });
    }

    // Check order_invoices for any still unresolved
    const stillUnresolved = adjNums.filter((a) => !invoiceToOrder[a]);
    if (stillUnresolved.length > 0) {
      for (let i = 0; i < stillUnresolved.length; i += 200) {
        const batch = stillUnresolved.slice(i, i + 200);
        const { data } = await supabase
          .from("order_invoices")
          .select("invoice_number, order_id, po_number")
          .in("invoice_number", batch);
        data?.forEach((d: any) => {
          if (d.invoice_number && (d.order_id || d.po_number)) {
            invoiceToOrder[d.invoice_number] = { order_id: d.order_id, po_number: d.po_number };
          }
        });
      }
    }

    // Update matching lines
    let resolved = 0;
    for (const row of unlinked) {
      const match = invoiceToOrder[row.adjustment_number];
      if (match) {
        const { error } = await supabase
          .from("remittance_lines")
          .update({ order_id: match.order_id, po_number: match.po_number })
          .eq("id", row.id);
        if (!error) resolved++;
      }
    }

    return NextResponse.json({
      ok: true,
      checked: unlinked.length,
      resolved,
      still_unresolved: unlinked.length - resolved,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
