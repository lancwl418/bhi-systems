import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildHomeDepotRemittanceWorkbookBuffer,
  createRemittanceSupabaseMock,
} from "@/test-utils/finance/remittance";

const { mockCreateServiceSupabase, mockNormalizeRetailer } = vi.hoisted(() => ({
  mockCreateServiceSupabase: vi.fn(),
  mockNormalizeRetailer: vi.fn((name: string) => name || "Home Depot"),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceSupabase: mockCreateServiceSupabase,
}));

vi.mock("@/lib/retailers", () => ({
  normalizeRetailer: mockNormalizeRetailer,
}));

vi.mock("@/lib/po", () => ({
  normalizePO: (po: string) => po.trim(),
}));

import { POST } from "./route";

describe("POST /api/finance/remittance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when file is missing", async () => {
    const request = {
      formData: async () => ({
        get: () => null,
      }),
    };

    const response = await POST(request as never);
    await expect(response.json()).resolves.toMatchObject({
      error: "No file provided",
    });
    expect(response.status).toBe(400);
  });

  it("imports Home Depot remittance workbook successfully", async () => {
    mockCreateServiceSupabase.mockResolvedValue(
      createRemittanceSupabaseMock({ remittanceId: "rem-hd-1" })
    );

    const file = {
      name: "homedepot-remit.xlsx",
      arrayBuffer: async () => buildHomeDepotRemittanceWorkbookBuffer(),
    };

    const request = {
      formData: async () => ({
        get: (key: string) => (key === "file" ? file : null),
      }),
    };

    const response = await POST(request as never);
    const payload = await response.json();

    expect(response.status, JSON.stringify(payload)).toBe(200);
    expect(payload.ok).toBe(true);
    expect(String(payload.retailer).toLowerCase()).toContain("home depot");
    expect(payload.lines).toBeGreaterThan(0);
    expect(payload.remittance_count).toBeGreaterThan(0);
  });

  it("returns 500 when remittance line insert fails", async () => {
    mockCreateServiceSupabase.mockResolvedValue(
      createRemittanceSupabaseMock({
        remittanceId: "rem-hd-1",
        lineInsertError: "line insert failed",
      })
    );

    const file = {
      name: "homedepot-remit.xlsx",
      arrayBuffer: async () => buildHomeDepotRemittanceWorkbookBuffer(),
    };

    const request = {
      formData: async () => ({
        get: (key: string) => (key === "file" ? file : null),
      }),
    };

    const response = await POST(request as never);
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(String(payload.error)).toContain("line insert failed");
  });
});
