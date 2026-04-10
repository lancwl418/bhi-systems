import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildInvoiceCsvRow,
  createInvoicesSupabaseMock,
} from "@/test-utils/finance/invoices";

const { mockCreateServiceSupabase } = vi.hoisted(() => ({
  mockCreateServiceSupabase: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceSupabase: mockCreateServiceSupabase,
}));

vi.mock("@/lib/po", () => ({
  normalizePO: (po: string) => po,
}));

import { POST } from "./route";

describe("POST /api/finance/invoices", () => {
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
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "No file provided",
    });
  });

  it("imports a valid invoice CSV", async () => {
    mockCreateServiceSupabase.mockResolvedValue(createInvoicesSupabaseMock());

    const csv = buildInvoiceCsvRow();

    const request = {
      formData: async () => ({
        get: (key: string) =>
          key === "file"
            ? {
                text: async () => csv,
              }
            : null,
      }),
    };

    const response = await POST(request as never);
    const payload = await response.json();

    expect(response.status, JSON.stringify(payload)).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      inserted: 1,
      skipped: 0,
      unique_invoices: 1,
      matched: 1,
      unmatched: 0,
    });
  });

  it("returns 400 when header row is missing", async () => {
    const csv = [
      "Wrong,Columns,Only",
      "1,2,3",
    ].join("\n");

    const request = {
      formData: async () => ({
        get: (key: string) =>
          key === "file"
            ? {
                text: async () => csv,
              }
            : null,
      }),
    };

    const response = await POST(request as never);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload).toMatchObject({
      error: "Could not find header row",
    });
  });

  it("returns 500 when DB insert fails", async () => {
    mockCreateServiceSupabase.mockResolvedValue(
      createInvoicesSupabaseMock({ insertError: "insert failed" })
    );

    const csv = buildInvoiceCsvRow();

    const request = {
      formData: async () => ({
        get: (key: string) =>
          key === "file"
            ? {
                text: async () => csv,
              }
            : null,
      }),
    };

    const response = await POST(request as never);
    const payload = await response.json();

    expect(response.status).toBe(500);
    expect(String(payload.error)).toContain("insert failed");
  });
});
