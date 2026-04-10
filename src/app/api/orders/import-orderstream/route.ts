import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabase/server";
import { normalizePO } from "@/lib/po";
import { normalizeRetailer } from "@/lib/retailers";

export const maxDuration = 300;

function parseCurrency(val: string | number | undefined | null): number {
  if (typeof val === "number") return val;
  if (!val) return 0;
  const cleaned = String(val).replace(/[$,\s]/g, "");
  return parseFloat(cleaned) || 0;
}

function parseDate(val: string | undefined | null): string | null {
  if (!val || val === "N/A") return null;
  const s = String(val).trim();
  // "MM/DD/YYYY"
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}

function clean(val: string | undefined | null): string {
  if (!val || val === "N/A") return "";
  return String(val).trim();
}

function mapStatus(status: string): string {
  const s = status.toLowerCase();
  if (s === "closed" || s === "shipped") return "shipped";
  if (s === "cancelled" || s === "canceled") return "cancelled";
  if (s === "delivered") return "delivered";
  return "pending";
}

/** Parse CSV line handling quoted/unquoted mixed fields */
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
        } else if (line[i] === '"') {
          break;
        } else {
          val += line[i]; i++;
        }
      }
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
      if (lines[i].includes("PO Number") && lines[i].includes("Merchant")) {
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

    // Parse all data rows
    interface LineItem {
      merchant: string;
      orderDate: string | null;
      po: string;
      quantity: number;
      sku: string;
      unitCost: number;
      status: string;
      address: {
        address1: string; address2: string; address3: string;
        city: string; state: string; country: string;
        company: string;
      };
      customer: {
        name: string; firstName: string; lastName: string;
        email: string; phone: string;
      };
      shipping: number;
    }

    const allLines: LineItem[] = [];
    for (let i = headerIdx + 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      const c = parseCSVLine(lines[i]);

      const merchant = clean(c[col["Merchant"]]) || "";
      const rawPO = clean(c[col["PO Number"]]) || "";
      if (!rawPO) continue;

      allLines.push({
        merchant,
        orderDate: parseDate(c[col["Order Date"]]),
        po: normalizePO(rawPO, merchant),
        quantity: parseInt(c[col["Quantity"]]) || 1,
        sku: clean(c[col["Vendor SKU"]]) || "",
        unitCost: parseCurrency(c[col["Unit Cost"]]),
        status: clean(c[col["Status"]]) || "pending",
        address: {
          address1: clean(c[col["ShipTo Address1"]]),
          address2: clean(c[col["ShipTo Address2"]]),
          address3: clean(c[col["ShipTo Address3"]]),
          city: clean(c[col["ShipTo City"]]),
          state: clean(c[col["ShipTo State"]]),
          country: clean(c[col["ShipTo Country"]]),
          company: clean(c[col["ShipTo Company Name"]]),
        },
        customer: {
          name: clean(c[col["Customer Name"]] ?? c[col["ShipTo Name"]]),
          firstName: clean(c[col["ShipTo First Name"]]),
          lastName: clean(c[col["ShipTo Last Name"]]),
          email: clean(c[col["Customer Email"]] ?? c[col["ShipTo Email"]]),
          phone: clean(c[col["Customer Day Phone"]] ?? c[col["ShipTo Day Phone"]]),
        },
        shipping: parseCurrency(c[col["Shipping"]]),
      });
    }

    if (allLines.length === 0) {
      return NextResponse.json({ error: "No data rows found" }, { status: 400 });
    }

    // Group by PO
    const ordersByPO: Record<string, { lines: LineItem[] }> = {};
    for (const l of allLines) {
      if (!ordersByPO[l.po]) ordersByPO[l.po] = { lines: [] };
      ordersByPO[l.po].lines.push(l);
    }

    const supabase = await createServiceSupabase();

    // Get existing orders for dedup + status update
    const existingOrderMap = new Map<string, { id: string; status: string }>();
    const allPOs = Object.keys(ordersByPO);
    for (let i = 0; i < allPOs.length; i += 200) {
      const batch = allPOs.slice(i, i + 200);
      const { data } = await supabase
        .from("orders")
        .select("id, channel_order_id, status")
        .in("channel_order_id", batch);
      data?.forEach((o: any) => existingOrderMap.set(o.channel_order_id, { id: o.id, status: o.status }));
    }

    const newOrders = Object.entries(ordersByPO).filter(([po]) => !existingOrderMap.has(po));
    const duplicateOrders = Object.entries(ordersByPO).filter(([po]) => existingOrderMap.has(po));

    // Get existing SKUs
    const { data: existingSkus } = await supabase.from("skus").select("id, sku_code, product_id");
    const skuMap: Record<string, { id: string; product_id: string }> = {};
    existingSkus?.forEach((s: any) => (skuMap[s.sku_code] = { id: s.id, product_id: s.product_id }));

    // ── Find or create customers ──
    // Build a cache: "name||email||phone" → customer_id
    const customerCache: Record<string, string> = {};

    async function findOrCreateCustomer(cust: LineItem["customer"], addr: LineItem["address"]): Promise<string | null> {
      const name = cust.name || [cust.firstName, cust.lastName].filter(Boolean).join(" ");
      if (!name) return null;

      const cacheKey = `${name}||${cust.email}||${cust.phone}`;
      if (customerCache[cacheKey]) return customerCache[cacheKey];

      // Try to find existing customer by name + email or name + phone
      let existing: any = null;
      if (cust.email) {
        const { data } = await supabase
          .from("customers")
          .select("id")
          .eq("name", name)
          .eq("email", cust.email)
          .limit(1)
          .maybeSingle();
        existing = data;
      }
      if (!existing && cust.phone) {
        const { data } = await supabase
          .from("customers")
          .select("id")
          .eq("name", name)
          .eq("phone", cust.phone)
          .limit(1)
          .maybeSingle();
        existing = data;
      }
      if (!existing) {
        // Also try by name only if no email/phone
        const { data } = await supabase
          .from("customers")
          .select("id")
          .eq("name", name)
          .limit(1)
          .maybeSingle();
        existing = data;
      }

      if (existing) {
        customerCache[cacheKey] = existing.id;
        return existing.id;
      }

      // Create new customer
      const { data: newCust } = await supabase
        .from("customers")
        .insert({
          name,
          email: cust.email || null,
          phone: cust.phone || null,
          address: {
            address1: addr.address1,
            address2: addr.address2,
            city: addr.city,
            state: addr.state,
            country: addr.country,
          },
        })
        .select("id")
        .single();

      if (newCust) {
        customerCache[cacheKey] = newCust.id;
        return newCust.id;
      }
      return null;
    }

    // Insert new orders
    let inserted = 0;
    let errors = 0;
    const BATCH_SIZE = 200;

    for (let i = 0; i < newOrders.length; i += BATCH_SIZE) {
      const batch = newOrders.slice(i, i + BATCH_SIZE);
      try {
        // Resolve customers for this batch
        const customerIds: Record<string, string | null> = {};
        for (const [po, group] of batch) {
          const first = group.lines[0];
          customerIds[po] = await findOrCreateCustomer(first.customer, first.address);
        }

        const orderRows = batch.map(([po, group]) => {
          const first = group.lines[0];
          const subtotal = group.lines.reduce((sum, l) => sum + l.unitCost * l.quantity, 0);
          const shipping = group.lines.reduce((sum, l) => sum + l.shipping, 0);
          const retailer = normalizeRetailer(first.merchant);

          return {
            channel_source: "commercehub" as const,
            channel_order_id: po,
            buyer_id: po,
            customer_id: customerIds[po] || null,
            status: mapStatus(first.status) as any,
            order_date: first.orderDate,
            subtotal,
            shipping_cost: shipping,
            tax: 0,
            total: subtotal + shipping,
            shipping_address: first.address,
            raw_payload: {
              retailer,
              customer_name: first.customer.name,
              customer_email: first.customer.email,
              customer_phone: first.customer.phone,
            },
          };
        });

        const { data: insertedOrders, error: orderError } = await supabase
          .from("orders")
          .insert(orderRows)
          .select("id, channel_order_id");

        if (orderError) throw orderError;
        if (!insertedOrders) continue;

        const orderIdMap: Record<string, string> = {};
        insertedOrders.forEach((o: any) => (orderIdMap[o.channel_order_id] = o.id));

        // Insert order items
        const allItems: any[] = [];
        batch.forEach(([po, group]) => {
          const orderId = orderIdMap[po];
          if (!orderId) return;
          group.lines.forEach((l) => {
            allItems.push({
              order_id: orderId,
              sku_id: skuMap[l.sku]?.id || null,
              sku_code: l.sku,
              product_name: l.sku,
              quantity: l.quantity,
              unit_price: l.unitCost,
              total_price: l.unitCost * l.quantity,
            });
          });
        });

        if (allItems.length > 0) {
          const { error: itemError } = await supabase.from("order_items").insert(allItems);
          if (itemError) throw itemError;
        }

        inserted += insertedOrders.length;
      } catch (err: any) {
        errors += batch.length;
      }
    }

    // Update status for existing orders if changed
    let statusUpdated = 0;
    for (const [po, group] of duplicateOrders) {
      const existing = existingOrderMap.get(po)!;
      const newStatus = mapStatus(group.lines[0].status);
      if (existing.status !== newStatus) {
        const { error } = await supabase
          .from("orders")
          .update({ status: newStatus, updated_at: new Date().toISOString() })
          .eq("id", existing.id);
        if (!error) statusUpdated++;
      }
    }

    return NextResponse.json({
      ok: true,
      csvLines: allLines.length,
      uniqueOrders: Object.keys(ordersByPO).length,
      inserted,
      skipped: duplicateOrders.length,
      statusUpdated,
      errors,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
