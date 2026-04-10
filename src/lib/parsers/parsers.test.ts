import { describe, expect, it } from "vitest";
import {
  detectRetailer,
  parseHomeDepotPDF,
  parseLowesPDF,
  parseLowesPDFMulti,
} from "./index";

describe("detectRetailer", () => {
  it("detects Home Depot", () => {
    expect(detectRetailer("Thank you for shopping at The Home Depot")).toBe("Home Depot");
  });

  it("detects Lowes", () => {
    expect(detectRetailer("Thank you for shopping at Lowe's")).toBe("Lowes");
  });

  it("returns null for unknown text", () => {
    expect(detectRetailer("Random vendor text")).toBeNull();
  });
});

describe("parseLowesPDF", () => {
  it("parses key fields and line items from Lowes text", () => {
    const text = `
Customer Order Number:
300902084264865024
PO Number:
404524564
Sales Date:
12/25/24
Ship Method:
Parcel Ground
Ship To :
John Doe
123 Main St
Austin, TX 73301
RESIDENTIAL

Item Description
Ductless Mini Split Support Bracket
11
BHI-PARTS-BRACKET
6783724
Returns and Refunds
`;

    const parsed = parseLowesPDF(text);

    expect(parsed.retailer).toBe("Lowes");
    expect(parsed.channel_order_id).toBe("404524564");
    expect(parsed.consumer_order_id).toBe("300902084264865024");
    expect(parsed.order_date).toBe("2024-12-25");
    expect(parsed.ship_via).toBe("Parcel Ground");
    expect(parsed.ship_to.name).toBe("John Doe");
    expect(parsed.ship_to.line1).toBe("123 Main St");
    expect(parsed.ship_to.city).toBe("Austin");
    expect(parsed.ship_to.state).toBe("TX");
    expect(parsed.ship_to.zip).toBe("73301");
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]).toMatchObject({
      sku_code: "BHI-PARTS-BRACKET",
      quantity: 1,
      item_number: "6783724",
    });
  });
});

describe("parseLowesPDFMulti", () => {
  it("deduplicates orders by PO number", () => {
    const text = `
Thank you for shopping at Lowe's
Customer Order Number:
1000000000001
PO Number:
PO-1
Sales Date:
01/10/25
Item Description
Item A
11
SKU-A
12345
Returns and Refunds

Thank you for shopping at Lowe's
Customer Order Number:
1000000000002
PO Number:
PO-1
Sales Date:
01/10/25
Item Description
Item A duplicate
11
SKU-A
12345
Returns and Refunds

Thank you for shopping at Lowe's
Customer Order Number:
1000000000003
PO Number:
PO-2
Sales Date:
01/11/25
Item Description
Item B
11
SKU-B
67890
Returns and Refunds
`;

    const parsed = parseLowesPDFMulti(text);

    expect(parsed).toHaveLength(2);
    expect(parsed.map((o) => o.channel_order_id)).toEqual(["PO-1", "PO-2"]);
  });
});

describe("parseHomeDepotPDF", () => {
  it("parses key fields and line items from Home Depot text", () => {
    const text = `
PO #
14946483
Customer Order #: WN53887912
Order Date: 03/14/25
Ground (Home Delivery)
Jane Smith
456 Oak Ave
LAS VEGAS, NV 89145
(702) 870-9600
Qty Shipped
BHI-T17-12K115V-US-A
329355324
12,000 BTU 115-Volt Ductless Mini Split
1
Thank you for shopping at The Home Depot
`;

    const parsed = parseHomeDepotPDF(text);

    expect(parsed.retailer).toBe("Home Depot");
    expect(parsed.channel_order_id).toBe("14946483");
    expect(parsed.consumer_order_id).toBe("WN53887912");
    expect(parsed.order_date).toBe("2025-03-14");
    expect(parsed.ship_via).toBe("Ground (Home Delivery)");
    expect(parsed.ship_to.name).toBe("Jane Smith");
    expect(parsed.ship_to.line1).toBe("456 Oak Ave");
    expect(parsed.ship_to.city).toBe("LAS VEGAS");
    expect(parsed.ship_to.state).toBe("NV");
    expect(parsed.ship_to.zip).toBe("89145");
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]).toMatchObject({
      sku_code: "BHI-T17-12K115V-US-A",
      internet_number: "329355324",
      quantity: 1,
    });
  });
});
