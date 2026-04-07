import type { ParsedOrder, ParsedOrderItem } from "./types";

/**
 * Parse Home Depot order PDF text extracted by pdf-parse v1.
 *
 * V1 format has labels and values on separate lines:
 *   PO #
 *   14946483
 *   Customer Order #:
 *   WN53887912
 */
/**
 * Parse a multi-order Home Depot PDF. Each order section starts with
 * "Thank you for your order!".
 */
export function parseHomeDepotPDFMulti(text: string): ParsedOrder[] {
  // Count how many distinct PO numbers exist
  const poMatches = [...text.matchAll(/PO #\s*\n?\s*(\d+)/g)];
  const uniquePOs = new Set(poMatches.map((m) => m[1]));

  // Single order: parse the whole text (don't split)
  if (uniquePOs.size <= 1) {
    const order = parseHomeDepotPDF(text);
    return order.channel_order_id ? [order] : [];
  }

  // Multiple orders: each order has "Thank you for your order!" followed by
  // address/items, then "Thank you for shopping at The Home Depot".
  // Split by "Thank you for your order!" to get each order section.
  const orders: ParsedOrder[] = [];
  const seenPOs = new Set<string>();

  // Find all "Thank you for your order!" positions as order start boundaries
  const orderStarts: number[] = [];
  const regex = /Thank you for your order!/gi;
  let match;
  while ((match = regex.exec(text)) !== null) {
    orderStarts.push(match.index);
  }

  for (let i = 0; i < orderStarts.length; i++) {
    const start = orderStarts[i];
    const end = i + 1 < orderStarts.length ? orderStarts[i + 1] : text.length;

    // Also include the Return Form section before "Thank you for your order!"
    // which contains the PO number. Go back to previous "Thank you for shopping"
    // or start of text.
    let segStart = start;
    const prevShoppingIdx = text.lastIndexOf("Thank you for shopping", start);
    if (prevShoppingIdx >= 0 && (i === 0 || prevShoppingIdx > orderStarts[i - 1])) {
      segStart = prevShoppingIdx;
    } else if (i === 0) {
      segStart = 0;
    }

    const segment = text.substring(segStart, end);
    const order = parseHomeDepotPDF(segment);
    if (order.channel_order_id && !seenPOs.has(order.channel_order_id)) {
      seenPOs.add(order.channel_order_id);
      orders.push(order);
    }
  }

  if (orders.length === 0) {
    const order = parseHomeDepotPDF(text);
    if (order.channel_order_id) orders.push(order);
  }

  return orders;
}

export function parseHomeDepotPDF(text: string): ParsedOrder {
  const poNumber = extractAfterLabel(text, /PO #\s*\n/) ||
    extractAfterLabel(text, /Purchase Order #:\s*\n/) ||
    extractInline(text, /PO #\s*(\d+)/);

  const customerOrder = extractInline(text, /Customer Order #:\s*(\S+)/);

  const rawDate = extractDate(text);
  const orderDate = parseDate(rawDate);
  const shipVia = extractShipVia(text);
  const shipTo = parseShipTo(text);
  const items = parseItems(text);

  return {
    retailer: "Home Depot",
    channel_order_id: poNumber,
    consumer_order_id: customerOrder,
    order_date: orderDate,
    ship_via: shipVia,
    ship_to: shipTo,
    items,
  };
}

function extractInline(text: string, regex: RegExp): string {
  const m = text.match(regex);
  return m ? m[1].trim() : "";
}

function extractAfterLabel(text: string, labelRegex: RegExp): string {
  const m = text.match(labelRegex);
  if (!m) return "";
  const afterLabel = text.substring(m.index! + m[0].length);
  const nextLine = afterLabel.split("\n")[0].trim();
  return nextLine;
}

function extractDate(text: string): string {
  const m = text.match(/\b(\d{1,2}\/\d{1,2}\/\d{2,4})\b/);
  return m ? m[1] : "";
}

function extractShipVia(text: string): string | null {
  const m = text.match(/\bGround\s*\([^)]*\)/i);
  if (m) return m[0].trim();
  const m2 = text.match(/\b(FedEx|UPS|USPS)\s+(Ground|Express|Home Delivery|2nd Day|Next Day)\b/i);
  if (m2) return m2[0].trim();
  const headerArea = text.substring(0, text.indexOf("Model Number"));
  const m3 = headerArea.match(/\bGround\b/i);
  return m3 ? m3[0] : null;
}

function parseDate(raw: string): string {
  if (!raw) return new Date().toISOString().slice(0, 10);
  const parts = raw.split("/");
  if (parts.length !== 3) return raw;
  const [month, day, yearShort] = parts;
  const year = parseInt(yearShort) < 100 ? 2000 + parseInt(yearShort) : parseInt(yearShort);
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
  };

  const addrMatch = text.match(/Address Type:\s*\n?\s*(\w+)/);
  if (addrMatch) result.address_type = addrMatch[1];

  // V1 may concatenate address into one line like:
  //   "DAVID L REDMILES1214 WEST MARKET STREETSALEM, IN 47167(304) 687-4315"
  // Or V2 may have separate lines. Try both approaches.

  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);

  // First try: separate lines (V2 format)
  const addressLineIdx = lines.findIndex((l) =>
    /^[A-Z\s]+,\s*[A-Z]{2}\s+\d{5}/.test(l)
  );

  if (addressLineIdx >= 0) {
    const cityLine = lines[addressLineIdx];
    const match = cityLine.match(/^(.+),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)/);
    if (match) {
      result.city = match[1].trim();
      result.state = match[2];
      result.zip = match[3];
    }
    if (addressLineIdx >= 1) result.line1 = lines[addressLineIdx - 1];
    if (addressLineIdx >= 2) result.name = lines[addressLineIdx - 2];
    if (addressLineIdx + 1 < lines.length) {
      const phoneMatch = lines[addressLineIdx + 1].match(/\(?\d{3}\)?\s*[\d-]{7,}/);
      if (phoneMatch) result.phone = phoneMatch[0];
    }
    return result;
  }

  // Second try: concatenated line (V1 format)
  // Text like: "DAVID L REDMILES1214 WEST MARKET STREETSALEM, IN 47167(304) 687-4315"
  // Strategy: get name from standalone line, then parse address from concatenated line

  // Find name: "DAVID L REDMILES" appears on its own line (Ordered By section)
  // It's the line right before "Customer Order #:Purchase Order #:..."
  const headerLineIdx = lines.findIndex((l) =>
    /Customer Order #:/.test(l) && /Purchase Order #:/.test(l)
  );
  if (headerLineIdx > 0) {
    result.name = lines[headerLineIdx - 1];
  }

  // Find the concatenated address line (contains name + digits + city, ST ZIP + phone)
  const concatLineIdx = lines.findIndex((l) =>
    /,\s*[A-Z]{2}\s+\d{5}/.test(l) && /\d{3,}/.test(l) && l.length > 30
  );

  if (concatLineIdx >= 0) {
    const line = lines[concatLineIdx];

    // Extract phone
    const phoneMatch = line.match(/\((\d{3})\)\s*([\d-]{7,})/);
    if (phoneMatch) result.phone = phoneMatch[0];

    // Remove the name prefix from the line if it starts with it
    let addrPart = line;
    if (result.name && addrPart.startsWith(result.name)) {
      addrPart = addrPart.substring(result.name.length);
    }

    // addrPart may look like:
    //   "1214 WEST MARKET STREETSALEM, IN 47167(304) 687-4315"
    //   "C/O THD Ship to Store #3301861 S Rainbow BlvdLas Vegas, NV 89145(702) 870-9600"

    // Remove phone from end first
    let cleaned = addrPart.replace(/\(\d{3}\)\s*[\d-]+$/, "").trim();

    // Extract "C/O THD Ship to Store #XXXX" as line2
    const storeMatch = cleaned.match(/C\/O\s+THD\s+Ship\s+to\s+Store\s+#\d{4}/i);
    if (storeMatch) {
      result.company = storeMatch[0];
      cleaned = cleaned.substring(storeMatch.index! + storeMatch[0].length);
    }

    const stateZip = cleaned.match(/,\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)/);
    if (stateZip) {
      result.state = stateZip[1];
      result.zip = stateZip[2];

      const beforeState = cleaned.substring(0, stateZip.index!);
      // Split street and city using street suffixes
      // e.g. "1214 WEST MARKET STREETSALEM" -> street ends at "STREET", city is "SALEM"
      // e.g. "861 S Rainbow BlvdLas Vegas" -> street ends at "Blvd", city is "Las Vegas"
      const suffixes = [
        "STREET", "ST", "AVE", "AVENUE", "BLVD", "BOULEVARD",
        "DR", "DRIVE", "RD", "ROAD", "LN", "LANE", "WAY", "CT",
        "COURT", "CIR", "CIRCLE", "PL", "PLACE", "TRL", "TRAIL",
        "PKWY", "PARKWAY", "HWY", "HIGHWAY",
        // Also match lowercase/mixed case
        "Street", "Blvd", "Ave", "Dr", "Rd", "Ln", "Way", "Ct",
        "Cir", "Pl", "Trl", "Pkwy", "Hwy",
      ];

      let splitIdx = -1;
      let suffixLen = 0;
      for (const suffix of suffixes) {
        const idx = beforeState.indexOf(suffix);
        if (idx > 0 && idx + suffix.length < beforeState.length) {
          if (idx + suffix.length > splitIdx + suffixLen) {
            splitIdx = idx;
            suffixLen = suffix.length;
          }
        }
      }

      if (splitIdx > 0) {
        let streetEnd = splitIdx + suffixLen;
        // Include trailing digits/spaces after suffix (e.g. "Hwy 202" -> "202" is part of street)
        const afterSuffix = beforeState.substring(streetEnd);
        const trailingDigits = afterSuffix.match(/^[\s\d]+/);
        if (trailingDigits) streetEnd += trailingDigits[0].length;

        result.line1 = beforeState.substring(0, streetEnd).trim();
        result.city = beforeState.substring(streetEnd).trim();
      } else {
        result.line1 = beforeState.trim();
      }
    }
  }

  return result;
}

function parseItems(text: string): ParsedOrderItem[] {
  const items: ParsedOrderItem[] = [];

  // In v1, the items section has headers and values on separate lines:
  //   Model Number
  //   Internet Number
  //   Item Description
  //   Qty Shipped
  //   BHI-T17-12K115V-US-A
  //   329355324
  //   12,000 BTU 115-Volt, 17 SEER2, 600sq. ft. Ductless Mini Split Ai
  //   1

  // Find the first "Qty Shipped" header
  const qtyShippedIdx = text.indexOf("Qty Shipped");
  if (qtyShippedIdx === -1) return items;

  // Find end of items section
  let endIdx = text.indexOf("Model Number", qtyShippedIdx + 11); // second "Model Number" = return form
  if (endIdx === -1) endIdx = text.indexOf("Thank you for shopping");
  if (endIdx === -1) endIdx = text.length;

  const itemsText = text.substring(qtyShippedIdx + "Qty Shipped".length, endIdx).trim();
  if (!itemsText) return items;

  const lines = itemsText.split("\n").map((l) => l.trim()).filter(Boolean);

  // Each item is a group of lines: SKU, internet_number, description (may be multi-line), qty
  // Strategy: find SKU-like patterns (starts with BHI- or alphanumeric with hyphens)
  // then internet number (6+ digits), then description, then single digit qty

  let i = 0;
  while (i < lines.length) {
    // Look for a SKU pattern
    if (/^[A-Z][\w-]+$/i.test(lines[i]) && !lines[i].match(/^\d+$/)) {
      const skuCode = lines[i];
      i++;

      // Internet number (6+ digits)
      let internetNumber = "";
      if (i < lines.length && /^\d{6,}$/.test(lines[i])) {
        internetNumber = lines[i];
        i++;
      }

      // Description - collect lines until we hit a line that's just a number (qty)
      const descParts: string[] = [];
      while (i < lines.length && !/^\d{1,3}$/.test(lines[i])) {
        descParts.push(lines[i]);
        i++;
      }

      // Quantity
      let qty = 1;
      if (i < lines.length && /^\d{1,3}$/.test(lines[i])) {
        qty = parseInt(lines[i]);
        i++;
      }

      items.push({
        sku_code: skuCode,
        internet_number: internetNumber || undefined,
        product_name: descParts.join(" ").trim(),
        quantity: qty,
      });
    } else {
      i++;
    }
  }

  return items;
}
