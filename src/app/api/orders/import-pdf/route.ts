import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabase/server";
import {
  detectRetailer,
  parseHomeDepotPDFMulti,
  parseLowesPDFMulti,
} from "@/lib/parsers";
import type { ParsedOrder } from "@/lib/parsers";

export const maxDuration = 300;

function parseSpecs(sku: string, description: string) {
  let brand = "BHI";
  let category = "Mini Split Systems";
  if (sku.startsWith("ASW-")) brand = "AUX";
  if (
    sku.includes("PARTS-BRACKET") ||
    sku.includes("PARTS-LINESET") ||
    sku.includes("-IDU")
  )
    category = "Mini Split Parts";
  if (sku.includes("KUER")) category = "Chest Coolers";
  if (sku.includes("PC-24A")) category = "Condensate Pumps";

  const specs: Record<string, unknown> = {};
  const btu = description.match(/(\d[\d,]*)\s*BTU/i);
  if (btu) specs.btu_cooling = parseInt(btu[1].replace(/,/g, ""));
  const volt =
    description.match(/(\d+)[- ]?[Vv]olt/i) || description.match(/(\d+)V\b/i);
  if (volt) specs.voltage = parseInt(volt[1]);
  const seer = description.match(/(\d+\.?\d*)\s*SEER/i);
  if (seer) specs.seer2 = parseFloat(seer[1]);
  specs.wifi = /wi-?fi/i.test(description);

  return { brand, category, specs };
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll("files") as File[];

    if (files.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    // Import lib directly to avoid pdf-parse's test file auto-execution
    // @ts-ignore
    const pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default;

    const supabase = await createServiceSupabase();

    // Get existing brands
    const { data: brands } = await supabase.from("brands").select("id, name");
    const brandMap: Record<string, string> = {};
    brands?.forEach((b) => (brandMap[b.name] = b.id));

    // Get existing SKUs
    const { data: existingSkus } = await supabase
      .from("skus")
      .select("id, sku_code, product_id");
    const skuMap: Record<string, { id: string; product_id: string }> = {};
    existingSkus?.forEach(
      (s) => (skuMap[s.sku_code] = { id: s.id, product_id: s.product_id })
    );

    // Get existing orders (manual + commercehub) for dedup / update
    const existingPOMap: Record<string, string> = {}; // channel_order_id -> order id
    let from = 0;
    const PAGE = 1000;
    while (true) {
      const { data: batch } = await supabase
        .from("orders")
        .select("id, channel_order_id")
        .in("channel_source", ["manual", "commercehub"])
        .range(from, from + PAGE - 1);
      if (!batch || batch.length === 0) break;
      batch.forEach((o) => (existingPOMap[o.channel_order_id] = o.id));
      if (batch.length < PAGE) break;
      from += PAGE;
    }

    // Buyer cache
    const buyerCache: Record<string, string> = {};
    async function getBuyerId(retailerName: string): Promise<string> {
      if (buyerCache[retailerName]) return buyerCache[retailerName];
      const { data: existing } = await supabase
        .from("buyers")
        .select("id")
        .ilike("name", `%${retailerName}%`);
      if (existing && existing.length > 0) {
        buyerCache[retailerName] = existing[0].id;
        return existing[0].id;
      }
      const { data: newBuyer } = await supabase
        .from("buyers")
        .insert({
          name: retailerName,
          platform: "manual" as const,
          compliance_config: {},
        })
        .select("id")
        .single();
      buyerCache[retailerName] = newBuyer!.id;
      return newBuyer!.id;
    }

    let totalInserted = 0;
    let totalUpdated = 0;
    let totalErrors = 0;
    let newProducts = 0;
    let newSkus = 0;
    const errorMessages: string[] = [];
    const parsedOrders: ParsedOrder[] = [];

    // Parse all PDFs
    for (const file of files) {
      try {
        const buffer = Buffer.from(await file.arrayBuffer());
        const result = await pdfParse(buffer);
        const text: string = result.text;

        const retailer = detectRetailer(text);
        if (!retailer) {
          errorMessages.push(`${file.name}: Could not detect retailer`);
          totalErrors++;
          continue;
        }

        const orders =
          retailer === "Home Depot"
            ? parseHomeDepotPDFMulti(text)
            : parseLowesPDFMulti(text);

        if (orders.length === 0) {
          errorMessages.push(`${file.name}: Could not extract any orders`);
          totalErrors++;
          continue;
        }

        parsedOrders.push(...orders);
      } catch (err: any) {
        totalErrors++;
        if (errorMessages.length < 5)
          errorMessages.push(`${file.name}: ${err.message}`);
      }
    }

    // Insert or update orders
    for (const order of parsedOrders) {
      try {
        const buyerId = await getBuyerId(order.retailer);
        const existingOrderId = existingPOMap[order.channel_order_id];

        // Build customer/shipping data from PDF
        const shippingAddress = {
          line1: order.ship_to.line1,
          line2: order.ship_to.line2 || "",
          city: order.ship_to.city,
          state: order.ship_to.state,
          zip: order.ship_to.zip,
          country: "US",
        };
        const rawPayload: Record<string, unknown> = {
          retailer: order.retailer,
          consumer_order: order.consumer_order_id,
          customer_name: order.ship_to.name,
          customer_phone: order.ship_to.phone,
          address_type: order.ship_to.address_type,
        };
        if ((order.ship_to as any).company) {
          rawPayload.company = (order.ship_to as any).company;
        }

        if (existingOrderId) {
          // Update existing order with customer info from PDF
          const { error: updateError } = await supabase
            .from("orders")
            .update({
              shipping_address: shippingAddress,
              shipping_method: order.ship_via,
              raw_payload: rawPayload,
            })
            .eq("id", existingOrderId);

          if (updateError) throw updateError;
          totalUpdated++;
          continue;
        }

        // Create missing products & SKUs for new orders
        for (const item of order.items) {
          if (!skuMap[item.sku_code]) {
            const { brand, category, specs } = parseSpecs(
              item.sku_code,
              item.product_name
            );

            if (!brandMap[brand]) {
              const { data: newBrand } = await supabase
                .from("brands")
                .upsert({ name: brand }, { onConflict: "name" })
                .select("id")
                .single();
              brandMap[brand] = newBrand!.id;
            }

            const { data: newProd } = await supabase
              .from("products")
              .insert({
                brand_id: brandMap[brand],
                name: item.product_name,
                category,
                model_number: item.sku_code,
                specs,
              })
              .select("id")
              .single();

            if (newProd) {
              newProducts++;
              const { data: newSku } = await supabase
                .from("skus")
                .insert({
                  product_id: newProd.id,
                  sku_code: item.sku_code,
                  buyer_id: buyerId,
                  price: 0,
                  cost: 0,
                })
                .select("id")
                .single();

              if (newSku) {
                skuMap[item.sku_code] = {
                  id: newSku.id,
                  product_id: newProd.id,
                };
                newSkus++;
              }
            }
          }
        }

        // Insert new order
        const { data: insertedOrder, error: orderError } = await supabase
          .from("orders")
          .insert({
            channel_source: "manual" as const,
            channel_order_id: order.channel_order_id,
            buyer_id: buyerId,
            status: "pending" as const,
            order_date: order.order_date,
            shipping_method: order.ship_via,
            subtotal: 0,
            shipping_cost: 0,
            tax: 0,
            total: 0,
            shipping_address: shippingAddress,
            raw_payload: rawPayload,
          })
          .select("id")
          .single();

        if (orderError) throw orderError;

        // Insert order items
        const orderItems = order.items.map((item) => ({
          order_id: insertedOrder!.id,
          sku_id: skuMap[item.sku_code]?.id || null,
          sku_code: item.sku_code,
          product_name: item.product_name,
          quantity: item.quantity,
          unit_price: 0,
          total_price: 0,
        }));

        const { error: itemError } = await supabase
          .from("order_items")
          .insert(orderItems);
        if (itemError) throw itemError;

        existingPOMap[order.channel_order_id] = insertedOrder!.id;
        totalInserted++;
      } catch (err: any) {
        totalErrors++;
        if (errorMessages.length < 5)
          errorMessages.push(
            `PO ${order.channel_order_id}: ${err.message}`
          );
      }
    }

    return NextResponse.json({
      ok: true,
      totalFiles: files.length,
      inserted: totalInserted,
      updated: totalUpdated,
      errors: totalErrors,
      newProducts,
      newSkus,
      errorMessages,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
