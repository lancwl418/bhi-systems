import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildLowesRemittanceWorkbookBuffer,
  createRemittanceSupabaseMock,
} from "@/test-utils/finance/remittance";

const { mockCreateServiceSupabase } = vi.hoisted(() => ({
  mockCreateServiceSupabase: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceSupabase: mockCreateServiceSupabase,
}));

vi.mock("@/lib/po", () => ({
  normalizePO: (po: string) => po.trim(),
}));

import { POST } from "./route";

describe("POST /api/finance/remittance/lowes", () => {
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

  it("imports Lowe's remittance workbook successfully", async () => {
    mockCreateServiceSupabase.mockResolvedValue(
      createRemittanceSupabaseMock({ remittanceId: "rem-lowes-1" })
    );

    const file = {
      name: "lowes-remit.xlsx",
      arrayBuffer: async () => buildLowesRemittanceWorkbookBuffer(),
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
      retailer: "Lowe's",
    });
    expect(payload.lines).toBeGreaterThan(0);
    expect(payload.remittance_count).toBeGreaterThan(0);
  });

  it("returns 500 when remittance line insert fails", async () => {
    mockCreateServiceSupabase.mockResolvedValue(
      createRemittanceSupabaseMock({
        remittanceId: "rem-lowes-1",
        lineInsertError: "lowes line insert failed",
      })
    );

    const file = {
      name: "lowes-remit.xlsx",
      arrayBuffer: async () => buildLowesRemittanceWorkbookBuffer(),
    };

    const request = {
      formData: async () => ({
        get: (key: string) => (key === "file" ? file : null),
      }),
    };

    const response = await POST(request as never);
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(String(payload.error)).toContain("lowes line insert failed");
  });
});
