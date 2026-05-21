import { RETAILERS, normalizeRetailer } from "@/lib/retailers";
import { createServiceSupabase } from "@/lib/supabase/server";

export const AUTO_SALES_PLATFORMS = [
  RETAILERS.HOME_DEPOT,
  RETAILERS.LOWES,
] as const;

export const MANUAL_SALES_PLATFORMS = [
  "eBay",
  "Wayfair",
  "Amazon",
  "Official",
  "Target",
  "Menards",
  "Global Industrial",
] as const;

export const SALES_REPORT_PLATFORMS = [
  MANUAL_SALES_PLATFORMS[0],
  RETAILERS.HOME_DEPOT,
  RETAILERS.LOWES,
  ...MANUAL_SALES_PLATFORMS.slice(1),
] as const;

const SALES_VARIANT_LABELS: Record<string, string> = {
  A: "No Wifi",
  B: "No Wifi 25ft",
  C: "Yes Wifi",
  D: "Yes Wifi 25ft",
};

export const SALES_REPORT_MODELS = [
  "T17 12K No Wifi",
  "T17 12K No Wifi 25ft",
  "T17 12K Yes Wifi",
  "T17 12K Yes Wifi 25ft",
  "T17 24K",
  "T17 36K",
  "CH 12K No Wifi",
  "CH 12K No Wifi 25ft",
  "CH 12K Yes Wifi",
  "CH 12K Yes Wifi 25ft",
  "CH 18K No Wifi",
  "CH 18K No Wifi 25ft",
  "CH 18K Yes Wifi",
  "CH 18K Yes Wifi 25ft",
  "ES 12K No Wifi",
  "ES 12K Yes Wifi",
  "BHI 12K115V No Wifi",
  "BHI 12K115V No Wifi 25ft",
  "BHI 12K115V Yes Wifi",
  "BHI 12K115V Yes Wifi 25ft",
  "BHI 12K230V No Wifi",
  "BHI 12K230V No Wifi 25ft",
  "BHI 12K230V Yes Wifi",
  "BHI 12K230V Yes Wifi 25ft",
  "APOLLO 12K No Wifi",
  "APOLLO 12K No Wifi 25ft",
  "APOLLO 12K Yes Wifi",
  "APOLLO 12K Yes Wifi 25ft",
  "APOLLO 18K No Wifi",
  "APOLLO 18K No Wifi 25ft",
  "APOLLO 18K Yes Wifi",
  "APOLLO 18K Yes Wifi 25ft",
  "BHI-TWAC-5KM115V",
  "BHI-TWAC-5KR115V",
  "BHI-TWAC-6KR115V",
  "BHI-TWAC-8KR115V",
  "BHI-TWAC-10KR115V",
  "BHI-TWAC-12KR115V",
  "BHI-TWAC-14KR115V",
  "BHI-PC-24A",
  "BH1-52-YJ823",
  "BH1-52-YJ617",
  "BHI-52-YJ670",
  "BH1-52-YJ682",
] as const;

export interface SalesReportCell {
  model: string;
  auto: number;
  manual: number;
  total: number;
}

export interface SalesReportRow {
  platform: string;
  entryMode: "auto" | "manual";
  cells: SalesReportCell[];
  autoTotal: number;
  manualTotal: number;
  total: number;
}

export interface DailySalesReport {
  salesDate: string;
  models: string[];
  rows: SalesReportRow[];
  modelTotals: SalesReportCell[];
  autoTotal: number;
  manualTotal: number;
  total: number;
  manualQuantities: Record<string, Record<string, number>>;
}

export interface ManualSalesEntryInput {
  platform: string;
  model: string;
  quantity: number;
}

interface ProductModelSource {
  model_number: string | null;
}

interface SkuSource {
  sku_code: string | null;
  products?: ProductModelSource | ProductModelSource[] | null;
}

interface OrderSource {
  status?: string | null;
  raw_payload?: Record<string, unknown> | null;
  channel_source?: string | null;
}

interface AutoSalesSource {
  order_id?: string | null;
  sku_code: string | null;
  product_name: string | null;
  quantity: number | string | null;
  orders?: OrderSource | OrderSource[] | null;
}

interface ManualSalesSource {
  platform: string | null;
  model_number: string | null;
  quantity: number | string | null;
}

interface InvoiceItemSource {
  sku_code: string | null;
  quantity: number | string | null;
}

interface InvoiceSource {
  order_id: string | null;
  sku_code: string | null;
  order_invoice_items?: InvoiceItemSource[] | null;
}

interface OrderRowSource extends OrderSource {
  id: string;
}

interface BuildDailySalesReportInput {
  salesDate: string;
  productModels: string[];
  skuCatalog: SkuSource[];
  autoItems: AutoSalesSource[];
  manualEntries: ManualSalesSource[];
}

function firstRelation<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function uniqueClean(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const clean = cleanText(value);
    if (!clean || seen.has(clean)) continue;
    seen.add(clean);
    result.push(clean);
  }
  return result;
}

function upperCompact(value: string): string {
  return value.toUpperCase().replace(/\s+/g, "");
}

function getVariantCode(value: string): string | null {
  const upper = value.toUpperCase();
  const afterUs = upper.match(/(?:^|[-_\s])US[-_\s]*([ABCD])(?:$|[-_\s])/);
  if (afterUs) return afterUs[1];

  const afterVoltage = upper.match(/(?:115V|230V)[-_\s]*([ABCD])(?:$|[-_\s])/);
  if (afterVoltage) return afterVoltage[1];

  const trailing = upper.match(/[-_\s]([ABCD])(?:$|[-_\s])/);
  return trailing?.[1] ?? null;
}

function getVariantLabel(value: string): string | null {
  const code = getVariantCode(value);
  return code ? SALES_VARIANT_LABELS[code] ?? null : null;
}

function exactCatalogModel(raw: string): string | null {
  const compact = upperCompact(raw);
  return SALES_REPORT_MODELS.find((model) => upperCompact(model) === compact) ?? null;
}

function exactContainsModel(raw: string): string | null {
  const compact = upperCompact(raw);
  return SALES_REPORT_MODELS.find((model) => compact.includes(upperCompact(model))) ?? null;
}

export function normalizeSalesModel(rawModel: string): string {
  const raw = cleanText(rawModel);
  if (!raw) return "Unknown Model";

  const exact = exactCatalogModel(raw);
  if (exact) return exact;

  const upper = raw.toUpperCase();
  const compact = upperCompact(raw);
  const variant = getVariantLabel(raw);

  if (compact.includes("BHI-PC-24A")) return "BHI-PC-24A";

  const exactWindowOrOther = exactContainsModel(raw);
  if (exactWindowOrOther) return exactWindowOrOther;

  if (compact.includes("APOLLO")) {
    if (compact.includes("12K") && variant) return `APOLLO 12K ${variant}`;
    if (compact.includes("18K") && variant) return `APOLLO 18K ${variant}`;
    if (compact.includes("12K")) return "APOLLO 12K";
    if (compact.includes("18K")) return "APOLLO 18K";
  }

  if (compact.includes("T17")) {
    if (compact.includes("24K")) return "T17 24K";
    if (compact.includes("36K")) return "T17 36K";
    if (compact.includes("12K") && variant) return `T17 12K ${variant}`;
    if (compact.includes("12K")) return "T17 12K";
  }

  if (compact.includes("CH")) {
    if (compact.includes("12K") && variant) return `CH 12K ${variant}`;
    if (compact.includes("18K") && variant) return `CH 18K ${variant}`;
    if (compact.includes("12K")) return "CH 12K";
    if (compact.includes("18K")) return "CH 18K";
  }

  if (compact.includes("ES")) {
    if (compact.includes("12K") && variant) return `ES 12K ${variant}`;
    if (compact.includes("12K")) return "ES 12K";
  }

  if (!compact.includes("CH") && !compact.includes("T17") && !compact.includes("ES")) {
    if (compact.includes("BHI-12K115V") && variant) return `BHI 12K115V ${variant}`;
    if (compact.includes("BHI-12K230V") && variant) return `BHI 12K230V ${variant}`;
  }

  // Some feeds drop separators; keep the most important HVAC classification.
  if (upper.includes("12K115V") && variant) return `BHI 12K115V ${variant}`;
  if (upper.includes("12K230V") && variant) return `BHI 12K230V ${variant}`;

  return raw;
}

function toQuantity(value: number | string | null | undefined): number {
  const parsed = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function emptyCell(model: string): SalesReportCell {
  return { model, auto: 0, manual: 0, total: 0 };
}

function getNextDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(year, month - 1, day));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return dt.toISOString().slice(0, 10);
}

function isMissingTableError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    cleanText(error.message).includes("daily_sales_manual_entries")
  );
}

export function normalizeSalesDate(input?: string | null): string {
  const value = cleanText(input);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Date().toISOString().slice(0, 10);
}

export function isManualSalesPlatform(platform: string): boolean {
  return !AUTO_SALES_PLATFORMS.includes(platform as (typeof AUTO_SALES_PLATFORMS)[number]);
}

export function normalizeSalesPlatform(input: string): string {
  const platform = cleanText(input);
  if (!platform) return "";

  const lower = platform.toLowerCase();
  if (lower === "ebay" || lower.startsWith("ebay - ")) return "eBay";

  return normalizeRetailer(platform);
}

function buildSkuModelMap(skuCatalog: SkuSource[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const sku of skuCatalog) {
    const skuCode = cleanText(sku.sku_code);
    const product = firstRelation(sku.products);
    const model = normalizeSalesModel(cleanText(product?.model_number));
    if (skuCode && model) map.set(skuCode, model);
  }
  return map;
}

function resolveModel(item: AutoSalesSource, skuModelMap: Map<string, string>): string {
  const sku = cleanText(item.sku_code);
  return normalizeSalesModel(skuModelMap.get(sku) || sku || cleanText(item.product_name) || "Unknown Model");
}

function resolvePlatform(order: OrderSource | null): string {
  const rawRetailer = order?.raw_payload?.retailer;
  const rawPlatform = typeof rawRetailer === "string" ? rawRetailer : order?.channel_source;
  return normalizeSalesPlatform(cleanText(rawPlatform) || "Unknown");
}

export function buildDailySalesReport(input: BuildDailySalesReportInput): DailySalesReport {
  const skuModelMap = buildSkuModelMap(input.skuCatalog);
  const modelSet = new Set<string>(Array.from(SALES_REPORT_MODELS));
  const platformSet = new Set<string>(Array.from(SALES_REPORT_PLATFORMS));
  const cellMap = new Map<string, Map<string, SalesReportCell>>();
  const manualQuantities: Record<string, Record<string, number>> = {};

  for (const model of input.productModels) {
    modelSet.add(normalizeSalesModel(model));
  }

  function ensureCell(platform: string, model: string): SalesReportCell {
    platformSet.add(platform);
    modelSet.add(model);
    let row = cellMap.get(platform);
    if (!row) {
      row = new Map<string, SalesReportCell>();
      cellMap.set(platform, row);
    }
    let cell = row.get(model);
    if (!cell) {
      cell = emptyCell(model);
      row.set(model, cell);
    }
    return cell;
  }

  for (const item of input.autoItems) {
    const order = firstRelation(item.orders);
    const status = cleanText(order?.status).toLowerCase();
    if (status === "cancelled" || status === "returned") continue;

    const quantity = toQuantity(item.quantity);
    if (!quantity) continue;

    const platform = resolvePlatform(order);
    const model = resolveModel(item, skuModelMap);
    const cell = ensureCell(platform, model);
    cell.auto += quantity;
    cell.total += quantity;
  }

  for (const entry of input.manualEntries) {
    const platform = normalizeSalesPlatform(cleanText(entry.platform));
    const model = normalizeSalesModel(cleanText(entry.model_number));
    const quantity = toQuantity(entry.quantity);
    if (!platform || !model) continue;
    if (!MANUAL_SALES_PLATFORMS.includes(platform as (typeof MANUAL_SALES_PLATFORMS)[number])) {
      continue;
    }

    if (!manualQuantities[platform]) manualQuantities[platform] = {};
    manualQuantities[platform][model] = quantity;

    if (!quantity) {
      modelSet.add(model);
      platformSet.add(platform);
      continue;
    }

    const cell = ensureCell(platform, model);
    cell.manual += quantity;
    cell.total += quantity;
  }

  const defaultModelOrder: string[] = Array.from(SALES_REPORT_MODELS);
  const extraModels = Array.from(modelSet)
    .filter((model) => !defaultModelOrder.includes(model))
    .sort((a, b) => a.localeCompare(b));
  const models = [...defaultModelOrder, ...extraModels];

  const defaultPlatformOrder: string[] = Array.from(SALES_REPORT_PLATFORMS);
  const extraPlatforms = Array.from(platformSet)
    .filter((platform) => !defaultPlatformOrder.includes(platform))
    .sort((a, b) => a.localeCompare(b));
  const platforms = [...defaultPlatformOrder, ...extraPlatforms];

  const modelTotals = models.map(emptyCell);
  let autoTotal = 0;
  let manualTotal = 0;

  const rows: SalesReportRow[] = platforms.map((platform): SalesReportRow => {
    const rowCells = cellMap.get(platform);
    const cells = models.map((model, index) => {
      const cell = rowCells?.get(model) ?? emptyCell(model);
      modelTotals[index].auto += cell.auto;
      modelTotals[index].manual += cell.manual;
      modelTotals[index].total += cell.total;
      return cell;
    });

    const rowAuto = cells.reduce((sum, cell) => sum + cell.auto, 0);
    const rowManual = cells.reduce((sum, cell) => sum + cell.manual, 0);
    autoTotal += rowAuto;
    manualTotal += rowManual;

    return {
      platform,
      entryMode: isManualSalesPlatform(platform) ? "manual" : "auto",
      cells,
      autoTotal: rowAuto,
      manualTotal: rowManual,
      total: rowAuto + rowManual,
    };
  });

  return {
    salesDate: input.salesDate,
    models,
    rows,
    modelTotals,
    autoTotal,
    manualTotal,
    total: autoTotal + manualTotal,
    manualQuantities,
  };
}

export async function getDailySalesReport(salesDateInput?: string | null): Promise<DailySalesReport> {
  const salesDate = normalizeSalesDate(salesDateInput);
  const nextDate = getNextDate(salesDate);
  const supabase = await createServiceSupabase();

  const [productResult, skuResult, orderResult, manualResult] = await Promise.all([
    supabase
      .from("products")
      .select("model_number")
      .eq("active", true)
      .neq("model_number", "")
      .order("model_number"),
    supabase
      .from("skus")
      .select("sku_code, products(model_number)"),
    supabase
      .from("orders")
      .select("id, status, raw_payload, channel_source, order_date")
      .gte("order_date", `${salesDate}T00:00:00+00:00`)
      .lt("order_date", `${nextDate}T00:00:00+00:00`),
    supabase
      .from("daily_sales_manual_entries")
      .select("platform, model_number, quantity")
      .eq("sales_date", salesDate),
  ]);

  if (productResult.error) throw productResult.error;
  if (skuResult.error) throw skuResult.error;
  if (orderResult.error) throw orderResult.error;
  const manualTableMissing = isMissingTableError(manualResult.error);
  if (manualResult.error && !manualTableMissing) throw manualResult.error;

  const orders = (orderResult.data ?? []) as OrderRowSource[];
  const orderById = new Map(orders.map((order) => [order.id, order]));
  const ordersWithOrderItems = new Set<string>();
  const autoItems: AutoSalesSource[] = [];

  for (let i = 0; i < orders.length; i += 200) {
    const batch = orders.slice(i, i + 200);
    const { data, error } = await supabase
      .from("order_items")
      .select("order_id, sku_code, product_name, quantity")
      .in("order_id", batch.map((order) => order.id));

    if (error) throw error;

    for (const item of data ?? []) {
      const order = orderById.get(item.order_id);
      ordersWithOrderItems.add(item.order_id);
      autoItems.push({
        order_id: item.order_id,
        sku_code: item.sku_code,
        product_name: item.product_name,
        quantity: item.quantity,
        orders: order ?? null,
      });
    }
  }

  // Some channel imports store SKU details in invoice lines, while order_items remain empty.
  // Use invoice items only for orders that do not already have order_items, to avoid double counting.
  const ordersNeedingInvoiceItems = orders.filter((order) => !ordersWithOrderItems.has(order.id));
  for (let i = 0; i < ordersNeedingInvoiceItems.length; i += 200) {
    const batch = ordersNeedingInvoiceItems.slice(i, i + 200);
    const { data, error } = await supabase
      .from("order_invoices")
      .select("order_id, sku_code, order_invoice_items(sku_code, quantity)")
      .in("order_id", batch.map((order) => order.id));

    if (error) throw error;

    for (const invoice of (data ?? []) as InvoiceSource[]) {
      if (!invoice.order_id) continue;
      const order = orderById.get(invoice.order_id);
      const items = invoice.order_invoice_items ?? [];

      if (items.length === 0 && invoice.sku_code) {
        autoItems.push({
          order_id: invoice.order_id,
          sku_code: invoice.sku_code,
          product_name: invoice.sku_code,
          quantity: 1,
          orders: order ?? null,
        });
        continue;
      }

      for (const item of items) {
        autoItems.push({
          order_id: invoice.order_id,
          sku_code: item.sku_code,
          product_name: item.sku_code,
          quantity: item.quantity,
          orders: order ?? null,
        });
      }
    }
  }

  return buildDailySalesReport({
    salesDate,
    productModels: uniqueClean(
      (productResult.data ?? []).map((product: ProductModelSource) => product.model_number ?? "")
    ),
    skuCatalog: (skuResult.data ?? []) as SkuSource[],
    autoItems,
    manualEntries: manualTableMissing ? [] : (manualResult.data ?? []) as ManualSalesSource[],
  });
}
