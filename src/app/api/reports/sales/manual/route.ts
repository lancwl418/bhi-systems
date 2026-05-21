import { NextRequest, NextResponse } from "next/server";
import { createServiceSupabase } from "@/lib/supabase/server";
import {
  AUTO_SALES_PLATFORMS,
  MANUAL_SALES_PLATFORMS,
  SALES_REPORT_MODELS,
  type ManualSalesEntryInput,
  normalizeSalesModel,
  normalizeSalesPlatform,
  normalizeSalesDate,
} from "@/lib/sales-report";

interface ManualSalesRequest {
  salesDate?: string;
  entries?: ManualSalesEntryInput[];
  replaceExisting?: boolean;
}

function cleanText(value: unknown): string {
  return String(value ?? "").trim();
}

function parseQuantity(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.floor(parsed);
}

function normalizeEntries(entries: unknown): ManualSalesEntryInput[] {
  if (!Array.isArray(entries)) return [];

  const byKey = new Map<string, ManualSalesEntryInput>();
  const manualPlatformSet = new Set<string>(Array.from(MANUAL_SALES_PLATFORMS));
  const reportModelSet = new Set<string>(Array.from(SALES_REPORT_MODELS));

  for (const raw of entries) {
    if (!raw || typeof raw !== "object") continue;
    const candidate = raw as Partial<ManualSalesEntryInput>;
    const platform = normalizeSalesPlatform(cleanText(candidate.platform));
    const model = normalizeSalesModel(cleanText(candidate.model));
    if (!platform || !model) continue;
    if (!manualPlatformSet.has(platform)) continue;
    if (!reportModelSet.has(model)) continue;
    if (AUTO_SALES_PLATFORMS.includes(platform as (typeof AUTO_SALES_PLATFORMS)[number])) {
      continue;
    }

    const quantity = parseQuantity(candidate.quantity);
    const key = `${platform}|||${model}`;
    const existing = byKey.get(key);
    byKey.set(key, {
      platform,
      model,
      quantity: (existing?.quantity ?? 0) + quantity,
    });
  }

  return Array.from(byKey.values());
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ManualSalesRequest;
    const salesDate = normalizeSalesDate(body.salesDate);
    const entries = normalizeEntries(body.entries);
    const replaceExisting = body.replaceExisting === true;

    if (entries.length === 0 && !replaceExisting) {
      return NextResponse.json({ error: "No valid manual sales entries provided" }, { status: 400 });
    }

    const supabase = await createServiceSupabase();
    const positiveEntries = entries.filter((entry) => entry.quantity > 0);
    const zeroEntries = entries.filter((entry) => entry.quantity === 0);

    if (replaceExisting) {
      const { error } = await supabase
        .from("daily_sales_manual_entries")
        .delete()
        .eq("sales_date", salesDate)
        .in("platform", Array.from(MANUAL_SALES_PLATFORMS));

      if (error) throw error;
    }

    if (positiveEntries.length > 0) {
      const rows = positiveEntries.map((entry) => ({
        sales_date: salesDate,
        platform: entry.platform,
        model_number: entry.model,
        quantity: entry.quantity,
        updated_at: new Date().toISOString(),
      }));

      const { error } = await supabase
        .from("daily_sales_manual_entries")
        .upsert(rows, { onConflict: "sales_date,platform,model_number" });

      if (error) throw error;
    }

    if (!replaceExisting) {
      const zeroByPlatform = new Map<string, string[]>();
      for (const entry of zeroEntries) {
        const models = zeroByPlatform.get(entry.platform) ?? [];
        models.push(entry.model);
        zeroByPlatform.set(entry.platform, models);
      }

      for (const [platform, models] of zeroByPlatform) {
        const { error } = await supabase
          .from("daily_sales_manual_entries")
          .delete()
          .eq("sales_date", salesDate)
          .eq("platform", platform)
          .in("model_number", models);

        if (error) throw error;
      }
    }

    return NextResponse.json({
      ok: true,
      salesDate,
      saved: positiveEntries.length,
      cleared: replaceExisting ? "replaced" : zeroEntries.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save manual sales entries";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
