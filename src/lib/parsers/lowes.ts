import type { ParsedOrder, ParsedOrderItem } from "./types";

/**
 * Parse Lowes order PDF text extracted by pdf-parse v1.
 *
 * V1 format has labels and values on separate lines:
 *   Customer Order Number:
 *   300902084264865024
 *   PO Number:
 *   404524564
 */
/**
 * Parse a multi-order Lowes PDF. Each order section starts with
 * "Thank you for shopping at Lowe's". Barcode/shipping label pages
 * are mixed in but get ignored since they lack Customer Order Number.
 */
export function parseLowesPDFMulti(text: string): ParsedOrder[] {
  // Split by "Thank you for shopping at Lowe" to get each order section
  const segments = text.split(/Thank you for shopping at Lowe['']?s/i);
  const orders: ParsedOrder[] = [];
  const seenPOs = new Set<string>();

  for (const segment of segments) {
    // Skip segments without order data
    if (!/Customer Order Number:/i.test(segment)) continue;

    const order = parseLowesPDF(segment);
    if (order.channel_order_id && !seenPOs.has(order.channel_order_id)) {
      seenPOs.add(order.channel_order_id);
      orders.push(order);
    }
  }

  // If splitting didn't work (single order, no marker), parse the whole text
  if (orders.length === 0) {
    const order = parseLowesPDF(text);
    if (order.channel_order_id) orders.push(order);
  }

  return orders;
}

export function parseLowesPDF(text: string): ParsedOrder {
  const customerOrder = extractAfterLabel(text, "Customer Order Number:");
  const poNumber = extractAfterLabel(text, "PO Number:");
  const rawDate = extractAfterLabel(text, "Sales Date:");
  const shipMethodRaw = extractAfterLabel(text, "Ship Method:");

  const orderDate = parseDate(rawDate);
  const shipTo = parseShipTo(text);
  const items = parseItems(text);

  return {
    retailer: "Lowes",
    channel_order_id: poNumber,
    consumer_order_id: customerOrder,
    order_date: orderDate,
    ship_via: shipMethodRaw || null,
    ship_to: shipTo,
    items,
  };
}

function extractAfterLabel(text: string, label: string): string {
  const idx = text.indexOf(label);
  if (idx === -1) return "";
  const after = text.substring(idx + label.length);
  const nextLine = after.split("\n").find((l) => l.trim())?.trim() || "";
  return nextLine;
}

function parseDate(raw: string): string {
  if (!raw) return new Date().toISOString().slice(0, 10);
  const parts = raw.split("/");
  if (parts.length !== 3) return raw;
  const [month, day, yearRaw] = parts;
  const year = parseInt(yearRaw) < 100 ? 2000 + parseInt(yearRaw) : parseInt(yearRaw);
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function parseShipTo(text: string) {
  const result = {
    name: "",
    line1: "",
    city: "",
    state: "",
    zip: "",
    phone: undefined as string | undefined,
    address_type: undefined as string | undefined,
    company: undefined as string | undefined,
  };

  // Ship To block: after "Ship To :" label, before "RESIDENTIAL" or "PO Number"
  const shipToIdx = text.search(/Ship To\s*:/i);
  if (shipToIdx !== -1) {
    const after = text.substring(shipToIdx + text.substring(shipToIdx).indexOf("\n"));
    const endPattern = /RESIDENTIAL|COMMERCIAL|PO Number/i;
    const endMatch = after.match(endPattern);
    const block = endMatch ? after.substring(0, endMatch.index) : after.substring(0, 200);
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);

    if (lines.length >= 1) result.name = lines[0];
    if (lines.length >= 2) result.line1 = lines[1];
    if (lines.length >= 3) {
      const match = lines[2].match(/^(.+),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)/);
      if (match) {
        result.city = match[1].trim();
        result.state = match[2];
        result.zip = match[3];
      }
    }
  }

  if (/RESIDENTIAL/i.test(text)) result.address_type = "Residential";
  else if (/COMMERCIAL/i.test(text)) result.address_type = "Commercial";

  // Parse Sold To block (customer name + phone)
  const soldToIdx = text.search(/Sold To:/i);
  let soldToName = "";
  if (soldToIdx !== -1) {
    const after = text.substring(soldToIdx);
    const shipToStart = after.search(/Ship To/i);
    const block = shipToStart > 0 ? after.substring(0, shipToStart) : after.substring(0, 200);
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    // lines[0] is "Sold To:", lines[1] is name, lines[2] is phone
    for (let i = 1; i < lines.length; i++) {
      const phoneMatch = lines[i].match(/\d{3}\s*\d{7}|\(?\d{3}\)?\s*[\d-]{7,}/);
      if (phoneMatch) {
        result.phone = phoneMatch[0];
      } else if (!soldToName) {
        soldToName = lines[i];
      }
    }
  }

  // Detect Lowes store shipments: Ship To name contains "LOWE'S OF"
  if (/LOWE'?S\s+OF\s+/i.test(result.name)) {
    result.company = result.name; // "LOWE'S OF SHREVEPORT, LA"
    // Use the Sold To person as the actual customer name
    if (soldToName) result.name = soldToName;
  }

  return result;
}

function parseItems(text: string): ParsedOrderItem[] {
  const items: ParsedOrderItem[] = [];

  // V1 Lowes item format (labels and values on separate lines):
  //   Item Description
  //   31.5-in W x 18.5-in H Ductless Mini Splits Support Bracket
  //   11
  //   BHI-PARTS-BRACKET
  //   6783724
  //
  // The "11" is qty_ordered + qty_shipped concatenated (both 1)
  // The pattern per item: description line(s), then qty digits, then model, then item#

  const headerIdx = text.indexOf("Item Description");
  if (headerIdx === -1) return items;

  // Find start of actual items (after the header line)
  const afterHeader = text.substring(headerIdx + "Item Description".length);

  let endIdx = afterHeader.indexOf("If you ordered more");
  if (endIdx === -1) endIdx = afterHeader.indexOf("Returns and Refunds");
  if (endIdx === -1) endIdx = afterHeader.length;

  const itemsText = afterHeader.substring(0, endIdx).trim();
  if (!itemsText) return items;

  const lines = itemsText.split("\n").map((l) => l.trim()).filter(Boolean);

  // Strategy: work backwards from known patterns
  // Each item group ends with: item_number (5+ digits)
  // Before that: model/SKU (alphanumeric with hyphens like BHI-xxx)
  // Before that: qty digits (like "11" meaning qty_ordered=1, qty_shipped=1)
  // Before that: description text

  let i = 0;
  while (i < lines.length) {
    // Collect description lines until we hit a qty-like pattern
    const descParts: string[] = [];

    // Skip lines that are clearly description
    while (i < lines.length) {
      // Check if this line is qty pattern (all digits, typically 2 digits like "11")
      // followed by a SKU line and item number line
      if (/^\d{1,4}$/.test(lines[i]) && i + 2 <= lines.length) {
        // Check if next line looks like a SKU
        const nextLine = lines[i + 1];
        if (nextLine && /^[A-Z][\w-]+$/i.test(nextLine)) {
          break;
        }
      }
      descParts.push(lines[i]);
      i++;
    }

    if (i >= lines.length) break;
    if (descParts.length === 0) { i++; continue; }

    // Parse qty - digits like "11" = qty_ordered(1) + qty_shipped(1)
    const qtyLine = lines[i];
    i++;

    // In the PDF, qty_ordered and qty_shipped are concatenated
    // e.g. "11" means ordered=1, shipped=1; "105" could mean ordered=10, shipped=5
    // For single digit quantities (most common), it's just doubled: "11", "22"
    let qtyShipped = 1;
    if (qtyLine.length === 2) {
      qtyShipped = parseInt(qtyLine[1]);
    } else if (qtyLine.length >= 2) {
      // Split in half
      const half = Math.floor(qtyLine.length / 2);
      qtyShipped = parseInt(qtyLine.substring(half)) || 1;
    }

    // SKU / Model
    let skuCode = "";
    if (i < lines.length && /^[A-Z][\w-]+$/i.test(lines[i])) {
      skuCode = lines[i];
      i++;
    }

    // Item number
    let itemNumber = "";
    if (i < lines.length && /^\d{5,}$/.test(lines[i])) {
      itemNumber = lines[i];
      i++;
    }

    if (skuCode) {
      items.push({
        product_name: descParts.join(" ").trim(),
        quantity: qtyShipped,
        sku_code: skuCode,
        item_number: itemNumber || undefined,
      });
    }
  }

  return items;
}
