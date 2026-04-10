import { describe, expect, it, vi, beforeEach } from "vitest";

const { mockCreateServiceSupabase, mockNormalizeRetailer } = vi.hoisted(() => ({
  mockCreateServiceSupabase: vi.fn(),
  mockNormalizeRetailer: vi.fn((name: string) => name || "Lowes"),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceSupabase: mockCreateServiceSupabase,
}));

vi.mock("@/lib/retailers", () => ({
  normalizeRetailer: mockNormalizeRetailer,
}));

import { POST } from "./route";

function createImportSupabaseMock() {
  return {
    from(table: string) {
      if (table === "buyers") {
        return {
          select() {
            return {
              ilike: async () => ({ data: [{ id: "buyer-1", name: "Lowes" }] }),
            };
          },
        };
      }

      if (table === "brands") {
        return {
          select: async () => ({ data: [{ id: "brand-1", name: "BHI" }] }),
        };
      }

      if (table === "skus") {
        return {
          select: async () => ({
            data: [{ id: "sku-1", sku_code: "BHI-TEST-1", product_id: "prod-1" }],
          }),
        };
      }

      if (table === "orders") {
        return {
          select() {
            return {
              eq() {
                return {
                  range: async () => ({ data: [] }),
                };
              },
            };
          },
          insert() {
            return {
              select: async () => ({
                data: [{ id: "order-1", channel_order_id: "PO-001" }],
                error: null,
              }),
            };
          },
        };
      }

      if (table === "order_items") {
        return {
          insert: async () => ({ error: null }),
        };
      }

      return {
        select: async () => ({ data: [] }),
      };
    },
  };
}

describe("POST /api/orders/import", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when no file is provided", async () => {
    const request = {
      formData: async () => ({
        get: () => null,
      }),
    };

    const response = await POST(request as never);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "No file provided",
    });
  });

  it("imports a valid CSV and returns success summary", async () => {
    mockCreateServiceSupabase.mockResolvedValue(createImportSupabaseMock());

    const csv = [
      "PO Number,Supplier SKU,Quantity,Unit Cost,Create Date,Order Status,Item Description,Retailer Name,Consumer Order Number,Close Date,UPC",
      "PO-001,BHI-TEST-1,2,100.00,2025-01-10,shipped,Test Product 12000 BTU,Lowes,CN-1,2025-01-12,123456789012",
    ].join("\n");

    const file = {
      text: async () => csv,
    };

    const request = {
      formData: async () => ({
        get: (key: string) => (key === "file" ? file : null),
      }),
    };

    const response = await POST(request as never);
    const payload = await response.json();

    expect(response.status, JSON.stringify(payload)).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      inserted: 1,
      skipped: 0,
      errors: 0,
      uniqueOrders: 1,
      csvRows: 1,
    });
  });
});
