import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabase/server";
import { normalizeRetailer } from "@/lib/retailers";

export const maxDuration = 300; // 5 minutes for large CSVs

function parseCSV(text: string): Record<string, string>[] {
  const rows: Record<string, string>[] = [];
  const lines: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if ((ch === "\n" || (ch === "\r" && text[i + 1] === "\n")) && !inQuotes) {
      if (current.trim()) lines.push(current);
      current = "";
      if (ch === "\r") i++; // skip \n after \r
    } else {
      current += ch;
    }
  }
  if (current.trim()) lines.push(current);

  if (lines.length < 2) return rows;

  const headers = splitLine(lines[0]);
  for (let i = 1; i < lines.length; i++) {
    const values = splitLine(lines[i]);
    if (values.length === headers.length) {
      const obj: Record<string, string> = {};
      headers.forEach((h, idx) => (obj[h.trim()] = values[idx].trim()));
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

function mapStatus(csvStatus: string): string {
  const map: Record<string, string> = {
    shipped: "shipped",
    shipment_pending: "pending",
    cancelled: "cancelled",
    delivered: "delivered",
  };
  return map[csvStatus] || "pending";
}

function parseSpecs(sku: string, description: string) {
  let brand = "BHI";
  let category = "Mini Split Systems";
  if (sku.startsWith("ASW-")) brand = "AUX";
  if (sku.includes("PARTS-BRACKET") || sku.includes("PARTS-LINESET") || sku.includes("-IDU"))
    category = "Mini Split Parts";
  if (sku.includes("KUER")) category = "Chest Coolers";
  if (sku.includes("PC-24A")) category = "Condensate Pumps";

  const specs: Record<string, unknown> = {};
  const btu = description.match(/(\d[\d,]*)\s*BTU/i);
  if (btu) specs.btu_cooling = parseInt(btu[1].replace(/,/g, ""));
  const volt = description.match(/(\d+)[- ]?[Vv]olt/i) || description.match(/(\d+)V\b/i);
  if (volt) specs.voltage = parseInt(volt[1]);
  const seer = description.match(/(\d+\.?\d*)\s*SEER/i);
  if (seer) specs.seer2 = parseFloat(seer[1]);
  specs.wifi = /wi-?fi/i.test(description);

  return { brand, category, specs };
}

// Required CSV columns
const REQUIRED_COLUMNS = [
  "PO Number",
  "Supplier SKU",
  "Quantity",
  "Unit Cost",
  "Create Date",
  "Order Status",
  "Item Description",
];

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const text = await file.text();
    const rows = parseCSV(text);

    if (rows.length === 0) {
      return NextResponse.json({ error: "CSV is empty or invalid" }, { status: 400 });
    }

    // Validate columns
    const missing = REQUIRED_COLUMNS.filter((c) => !(c in rows[0]));
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing columns: ${missing.join(", ")}` },
        { status: 400 }
      );
    }

    const supabase = await createServiceSupabase();

    // Detect retailer from CSV
    const retailerName = normalizeRetailer(rows[0]["Retailer Name"] || "");

    // Get or create buyer
    const { data: existingBuyers } = await supabase
      .from("buyers")
      .select("id, name")
      .ilike("name", `%${retailerName}%`);

    let buyerId: string;
    if (existingBuyers && existingBuyers.length > 0) {
      buyerId = existingBuyers[0].id;
    } else {
      const { data: newBuyer } = await supabase
        .from("buyers")
        .insert({ name: retailerName, platform: "commercehub" as const, compliance_config: {} })
        .select("id")
        .single();
      buyerId = newBuyer!.id;
    }

    // Get existing brands
    const { data: brands } = await supabase.from("brands").select("id, name");
    const brandMap: Record<string, string> = {};
    brands?.forEach((b) => (brandMap[b.name] = b.id));

    // Get existing SKUs
    const { data: existingSkus } = await supabase.from("skus").select("id, sku_code, product_id");
    const skuMap: Record<string, { id: string; product_id: string }> = {};
    existingSkus?.forEach((s) => (skuMap[s.sku_code] = { id: s.id, product_id: s.product_id }));

    // Get ALL existing orders with status (paginate to avoid 1000-row limit)
    const existingOrderMap = new Map<string, { id: string; status: string }>();
    let from = 0;
    const PAGE = 1000;
    while (true) {
      const { data: batch } = await supabase
        .from("orders")
        .select("id, channel_order_id, status")
        .eq("channel_source", "commercehub")
        .range(from, from + PAGE - 1);
      if (!batch || batch.length === 0) break;
      batch.forEach((o) => existingOrderMap.set(o.channel_order_id, { id: o.id, status: o.status }));
      if (batch.length < PAGE) break;
      from += PAGE;
    }

    // Collect unique SKUs to create
    const skuInfo: Record<string, { description: string; upc: string; cost: number }> = {};
    rows.forEach((r) => {
      const sku = r["Supplier SKU"];
      if (!skuMap[sku] && !skuInfo[sku]) {
        skuInfo[sku] = {
          description: r["Item Description"],
          upc: r["UPC"] || "",
          cost: parseFloat(r["Unit Cost"]),
        };
      }
    });

    // Create missing products & SKUs
    let newProducts = 0;
    let newSkus = 0;
    for (const [skuCode, info] of Object.entries(skuInfo)) {
      const { brand, category, specs } = parseSpecs(skuCode, info.description);

      // Ensure brand exists
      if (!brandMap[brand]) {
        const { data: newBrand } = await supabase
          .from("brands")
          .upsert({ name: brand }, { onConflict: "name" })
          .select("id")
          .single();
        brandMap[brand] = newBrand!.id;
      }

      // Create product
      const { data: newProd } = await supabase
        .from("products")
        .insert({
          brand_id: brandMap[brand],
          name: info.description,
          category,
          model_number: skuCode,
          specs,
        })
        .select("id")
        .single();

      if (newProd) {
        newProducts++;
        // Create SKU
        const { data: newSku } = await supabase
          .from("skus")
          .insert({
            product_id: newProd.id,
            sku_code: skuCode,
            buyer_id: buyerId,
            upc: info.upc || null,
            price: info.cost,
            cost: Math.round(info.cost * 0.65 * 100) / 100,
          })
          .select("id")
          .single();

        if (newSku) {
          skuMap[skuCode] = { id: newSku.id, product_id: newProd.id };
          newSkus++;
          // Create inventory
          await supabase.from("inventory").insert({
            sku_id: newSku.id,
            warehouse_location: "WH-A",
            quantity_on_hand: 50,
            quantity_reserved: 0,
            reorder_point: 10,
          });
        }
      }
    }

    // Group rows by PO
    const ordersByPO: Record<
      string,
      {
        po: string;
        consumerOrder: string;
        createDate: string;
        closeDate: string;
        orderStatus: string;
        lines: typeof rows;
      }
    > = {};

    rows.forEach((r) => {
      const po = r["PO Number"];
      if (!ordersByPO[po]) {
        ordersByPO[po] = {
          po,
          consumerOrder: r["Consumer Order Number"] || "",
          createDate: r["Create Date"],
          closeDate: r["Close Date"] || "",
          orderStatus: r["Order Status"],
          lines: [],
        };
      }
      ordersByPO[po].lines.push(r);
    });

    // Split into new orders vs existing that may need status update
    const allGrouped = Object.values(ordersByPO);
    const newOrders = allGrouped.filter((o) => !existingOrderMap.has(o.po));
    const duplicateOrders = allGrouped.filter((o) => existingOrderMap.has(o.po));
    const skipped = duplicateOrders.length;

    let inserted = 0;
    let errors = 0;
    const errorMessages: string[] = [];

    // Process in batches of 200
    const BATCH_SIZE = 200;
    for (let i = 0; i < newOrders.length; i += BATCH_SIZE) {
      const batch = newOrders.slice(i, i + BATCH_SIZE);

      try {
        const orderRows = batch.map((order) => {
          const subtotal = order.lines.reduce(
            (sum, l) => sum + parseFloat(l["Unit Cost"]) * parseInt(l["Quantity"]),
            0
          );
          const closeDate = order.closeDate
            ? order.closeDate.replace(/\[.*\]/, "").trim() || null
            : null;

          return {
            channel_source: "commercehub" as const,
            channel_order_id: order.po,
            buyer_id: order.consumerOrder,
            status: mapStatus(order.orderStatus) as any,
            order_date: order.createDate,
            ship_by_date: closeDate,
            subtotal,
            shipping_cost: 0,
            tax: 0,
            total: subtotal,
            shipping_address: {},
            raw_payload: { retailer: retailerName, consumer_order: order.consumerOrder },
          };
        });

        const { data: insertedOrders, error: orderError } = await supabase
          .from("orders")
          .insert(orderRows)
          .select("id, channel_order_id");

        if (orderError) throw orderError;
        if (!insertedOrders) continue;

        // Build order ID lookup
        const orderIdMap: Record<string, string> = {};
        insertedOrders.forEach((o) => (orderIdMap[o.channel_order_id] = o.id));

        // Collect all items for this batch
        const allItems: any[] = [];
        batch.forEach((order) => {
          const orderId = orderIdMap[order.po];
          if (!orderId) return;
          order.lines.forEach((l) => {
            allItems.push({
              order_id: orderId,
              sku_id: skuMap[l["Supplier SKU"]]?.id || null,
              sku_code: l["Supplier SKU"],
              product_name: l["Item Description"],
              quantity: parseInt(l["Quantity"]),
              unit_price: parseFloat(l["Unit Cost"]),
              total_price: parseFloat(l["Unit Cost"]) * parseInt(l["Quantity"]),
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
        if (errorMessages.length < 3) errorMessages.push(err.message);
      }
    }

    // Update status for existing orders if changed
    let statusUpdated = 0;
    for (const order of duplicateOrders) {
      const existing = existingOrderMap.get(order.po)!;
      const newStatus = mapStatus(order.orderStatus);
      if (existing.status !== newStatus) {
        const { error: upErr } = await supabase
          .from("orders")
          .update({ status: newStatus, updated_at: new Date().toISOString() })
          .eq("id", existing.id);
        if (!upErr) statusUpdated++;
      }
    }

    return NextResponse.json({
      ok: true,
      retailer: retailerName,
      csvRows: rows.length,
      uniqueOrders: Object.keys(ordersByPO).length,
      newProducts,
      newSkus,
      inserted,
      skipped,
      statusUpdated,
      errors,
      errorMessages,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
