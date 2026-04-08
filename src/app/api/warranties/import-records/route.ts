import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabase/server";

export const maxDuration = 120;

// ─── CSV Parsing (handles quoted fields with newlines) ───

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

// ─── Main import ───

interface GroupedOrder {
  name: string;
  email: string;
  financialStatus: string;
  fulfillmentStatus: string;
  billingName: string;
  shippingName: string;
  shippingAddress: Record<string, string>;
  phone: string;
  notes: string;
  subtotal: number;
  shippingCost: number;
  total: number;
  discountCode: string;
  discountAmount: number;
  shopifyId: string;
  createdAt: string;
  lines: {
    name: string;
    quantity: number;
    price: number;
    sku: string;
    fulfillmentStatus: string;
  }[];
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

    const text = await file.text();
    const rows = parseCSV(text);

    if (rows.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No data rows found" },
        { status: 400 }
      );
    }

    // Group rows by order Name (e.g. #BHI1812) — multi-line items share the same Name
    const orderMap: Record<string, GroupedOrder> = {};

    for (const row of rows) {
      const name = row["Name"] || "";
      if (!name) continue;

      if (!orderMap[name]) {
        orderMap[name] = {
          name,
          email: row["Email"] || "",
          financialStatus: row["Financial Status"] || "",
          fulfillmentStatus: row["Fulfillment Status"] || "",
          billingName: row["Billing Name"] || "",
          shippingName: row["Shipping Name"] || "",
          shippingAddress: {
            street: row["Shipping Street"] || "",
            city: row["Shipping City"] || "",
            zip: (row["Shipping Zip"] || "").replace(/^'/, ""),
            province: row["Shipping Province"] || "",
            country: row["Shipping Country"] || "",
          },
          phone: row["Phone"] || row["Shipping Phone"] || "",
          notes: row["Notes"] || "",
          subtotal: parseFloat(row["Subtotal"] || "0"),
          shippingCost: parseFloat(row["Shipping"] || "0"),
          total: parseFloat(row["Total"] || "0"),
          discountCode: row["Discount Code"] || "",
          discountAmount: parseFloat(row["Discount Amount"] || "0"),
          shopifyId: row["Id"] || "",
          createdAt: row["Created at"] || "",
          lines: [],
        };
      }

      // Add line item
      const lineitemName = row["Lineitem name"] || "";
      if (lineitemName) {
        orderMap[name].lines.push({
          name: lineitemName,
          quantity: parseInt(row["Lineitem quantity"] || "1"),
          price: parseFloat(row["Lineitem price"] || "0"),
          sku: row["Lineitem sku"] || "",
          fulfillmentStatus: row["Lineitem fulfillment status"] || "",
        });
      }
    }

    const supabase = await createServiceSupabase();

    // Get existing warranty numbers to dedup
    const { data: existing } = await supabase
      .from("warranties")
      .select("warranty_number");
    const existingNumbers = new Set(
      (existing ?? []).map((w) => w.warranty_number)
    );

    // Get warranty registrations for email matching
    const { data: registrations } = await supabase
      .from("warranty_registrations")
      .select("id, customer_email");
    const regByEmail: Record<string, string> = {};
    (registrations ?? []).forEach((r) => {
      if (r.customer_email) {
        regByEmail[r.customer_email.toLowerCase()] = r.id;
      }
    });

    let inserted = 0;
    let skipped = 0;

    for (const order of Object.values(orderMap)) {
      if (existingNumbers.has(order.name)) {
        skipped++;
        continue;
      }

      // Match registration by email
      const registrationId = order.email
        ? regByEmail[order.email.toLowerCase()] || null
        : null;

      // Determine claim_type from line items
      const partNames = order.lines.map((l) => l.name.toLowerCase());
      let claimType = "other";
      if (partNames.some((p) => p.includes("compressor"))) claimType = "compressor";
      else if (partNames.some((p) => p.includes("pcb") || p.includes("board")))
        claimType = "pcb";
      else if (partNames.some((p) => p.includes("outdoor unit")))
        claimType = "outdoor_unit";
      else if (partNames.some((p) => p.includes("indoor unit")))
        claimType = "indoor_unit";
      else if (partNames.some((p) => p.includes("sensor"))) claimType = "sensor";
      else if (partNames.some((p) => p.includes("remote"))) claimType = "remote";
      else if (partNames.some((p) => p.includes("valve"))) claimType = "valve";
      else if (partNames.some((p) => p.includes("motor"))) claimType = "motor";
      else if (partNames.some((p) => p.includes("line") || p.includes("lineset")))
        claimType = "lineset";

      // Build description from line item names
      const description = order.lines.map((l) => l.name).join("; ");

      // Determine status based on fulfillment
      let status = "open";
      if (order.fulfillmentStatus === "fulfilled") status = "resolved";
      else if (order.fulfillmentStatus === "unfulfilled") status = "approved";

      const { data: warranty, error: wErr } = await supabase
        .from("warranties")
        .insert({
          warranty_number: order.name,
          registration_id: registrationId,
          customer_name: order.shippingName || order.billingName || null,
          customer_email: order.email || null,
          customer_phone: order.phone || null,
          shipping_name: order.shippingName || null,
          shipping_address: order.shippingAddress,
          status,
          claim_type: claimType,
          description,
          notes: order.notes || null,
          fulfillment_status: order.fulfillmentStatus || null,
          financial_status: order.financialStatus || null,
          subtotal: order.subtotal,
          shipping_cost: order.shippingCost,
          total: order.total,
          discount_code: order.discountCode || null,
          discount_amount: order.discountAmount,
          shopify_id: order.shopifyId || null,
          order_date: order.createdAt || null,
        })
        .select("id")
        .single();

      if (wErr) {
        console.error("Insert warranty error:", wErr, order.name);
        continue;
      }

      // Insert parts (line items)
      if (warranty && order.lines.length > 0) {
        const parts = order.lines.map((l) => ({
          warranty_id: warranty.id,
          part_name: l.name,
          quantity: l.quantity,
          unit_price: l.price,
          sku: l.sku || null,
          fulfillment_status: l.fulfillmentStatus || null,
        }));

        const { error: pErr } = await supabase
          .from("warranty_parts")
          .insert(parts);
        if (pErr) {
          console.error("Insert parts error:", pErr, order.name);
        }
      }

      inserted++;
    }

    return NextResponse.json({ ok: true, inserted, skipped });
  } catch (err: unknown) {
    console.error("Warranty records import error:", err);
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
