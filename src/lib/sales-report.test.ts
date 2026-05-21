import { describe, expect, it } from "vitest";
import { buildDailySalesReport, normalizeSalesModel } from "./sales-report";

describe("normalizeSalesModel", () => {
  it("normalizes mini split families by series, capacity, wifi, and line set", () => {
    expect(normalizeSalesModel("BHI-CH-12K115V-US-A")).toBe("CH 12K No Wifi");
    expect(normalizeSalesModel("BHI-CH-18K230V-US-D")).toBe("CH 18K Yes Wifi 25ft");
    expect(normalizeSalesModel("BHI-12K115V-ES-US-C")).toBe("ES 12K Yes Wifi");
    expect(normalizeSalesModel("BHI-T17-12K115V-US-B")).toBe("T17 12K No Wifi 25ft");
    expect(normalizeSalesModel("BHI-T17-24K-US-C")).toBe("T17 24K");
    expect(normalizeSalesModel("BHI-T17-36K")).toBe("T17 36K");
    expect(normalizeSalesModel("APOLLO-M-18K230V-US-D")).toBe("APOLLO 18K Yes Wifi 25ft");
    expect(normalizeSalesModel("BHI-12K230V-C")).toBe("BHI 12K230V Yes Wifi");
  });

  it("keeps old A/B/C/D report labels compatible", () => {
    expect(normalizeSalesModel("T17 12K A")).toBe("T17 12K No Wifi");
    expect(normalizeSalesModel("CH 18K D")).toBe("CH 18K Yes Wifi 25ft");
    expect(normalizeSalesModel("APOLLO 12K B")).toBe("APOLLO 12K No Wifi 25ft");
  });

  it("keeps window AC, pump, and fan models as exact report buckets", () => {
    expect(normalizeSalesModel("BHI-TWAC-10KR115V")).toBe("BHI-TWAC-10KR115V");
    expect(normalizeSalesModel("BHI-PC-24A")).toBe("BHI-PC-24A");
    expect(normalizeSalesModel("BH1-52-YJ823")).toBe("BH1-52-YJ823");
  });
});

describe("buildDailySalesReport", () => {
  it("aggregates automatic sales into normalized model buckets", () => {
    const report = buildDailySalesReport({
      salesDate: "2026-05-21",
      productModels: [],
      skuCatalog: [
        { sku_code: "HD-SKU-1", products: { model_number: "BHI-CH-12K115V-US-A" } },
      ],
      autoItems: [
        {
          sku_code: "HD-SKU-1",
          product_name: "Platform model",
          quantity: 2,
          orders: {
            status: "shipped",
            raw_payload: { retailer: "Home Depot" },
            channel_source: "commercehub",
          },
        },
        {
          sku_code: "LOWES-T17-24K-ALT",
          product_name: "BHI-T17-24K variant",
          quantity: 3,
          orders: {
            status: "pending",
            raw_payload: { retailer: "lowes" },
            channel_source: "commercehub",
          },
        },
      ],
      manualEntries: [],
    });

    const homeDepot = report.rows.find((row) => row.platform === "Home Depot");
    const lowes = report.rows.find((row) => row.platform === "Lowe's");

    expect(homeDepot?.cells.find((cell) => cell.model === "CH 12K No Wifi")?.auto).toBe(2);
    expect(lowes?.cells.find((cell) => cell.model === "T17 24K")?.auto).toBe(3);
  });

  it("combines automatic order quantities with manual daily entries", () => {
    const report = buildDailySalesReport({
      salesDate: "2026-05-21",
      productModels: ["BHI-18K", "BHI-12K"],
      skuCatalog: [
        { sku_code: "HD-18", products: { model_number: "BHI-18K" } },
        { sku_code: "HD-12", products: { model_number: "BHI-12K" } },
      ],
      autoItems: [
        {
          sku_code: "HD-18",
          product_name: "18K unit",
          quantity: 2,
          orders: {
            status: "shipped",
            raw_payload: { retailer: "homedepot" },
            channel_source: "commercehub",
          },
        },
        {
          sku_code: "HD-12",
          product_name: "12K unit",
          quantity: 5,
          orders: {
            status: "cancelled",
            raw_payload: { retailer: "homedepot" },
            channel_source: "commercehub",
          },
        },
      ],
      manualEntries: [
        { platform: "Amazon", model_number: "BHI-12K", quantity: 3 },
      ],
    });

    const homeDepot = report.rows.find((row) => row.platform === "Home Depot");
    const amazon = report.rows.find((row) => row.platform === "Amazon");

    expect(homeDepot?.total).toBe(2);
    expect(homeDepot?.cells.find((cell) => cell.model === "BHI-18K")?.auto).toBe(2);
    expect(amazon?.total).toBe(3);
    expect(amazon?.cells.find((cell) => cell.model === "BHI-12K")?.manual).toBe(3);
    expect(report.modelTotals.find((cell) => cell.model === "BHI-12K")?.total).toBe(3);
    expect(report.total).toBe(5);
  });

  it("keeps zero manual quantities available for the editor without counting them", () => {
    const report = buildDailySalesReport({
      salesDate: "2026-05-21",
      productModels: ["BHI-18K"],
      skuCatalog: [],
      autoItems: [],
      manualEntries: [
        { platform: "Wayfair", model_number: "BHI-18K", quantity: 0 },
      ],
    });

    const wayfair = report.rows.find((row) => row.platform === "Wayfair");

    expect(report.manualQuantities.Wayfair["BHI-18K"]).toBe(0);
    expect(wayfair?.total).toBe(0);
    expect(report.total).toBe(0);
  });
});
