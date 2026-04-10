import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createImportPdfSupabaseMock,
  defaultLowesParsedOrders,
} from "@/test-utils/orders/import-pdf";

const {
  mockCreateServiceSupabase,
  mockDetectRetailer,
  mockParseHomeDepotPDFMulti,
  mockParseLowesPDFMulti,
  mockPdfParse,
} = vi.hoisted(() => ({
  mockCreateServiceSupabase: vi.fn(),
  mockDetectRetailer: vi.fn(() => "Lowes"),
  mockParseHomeDepotPDFMulti: vi.fn(() => []),
  mockParseLowesPDFMulti: vi.fn(() => defaultLowesParsedOrders),
  mockPdfParse: vi.fn(async () => ({ text: "mock pdf text" })),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceSupabase: mockCreateServiceSupabase,
}));

vi.mock("@/lib/parsers", () => ({
  detectRetailer: mockDetectRetailer,
  parseHomeDepotPDFMulti: mockParseHomeDepotPDFMulti,
  parseLowesPDFMulti: mockParseLowesPDFMulti,
}));

vi.mock("pdf-parse/lib/pdf-parse.js", () => ({
  default: mockPdfParse,
}));

import { POST } from "./route";

describe("POST /api/orders/import-pdf", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when no files are provided", async () => {
    const form = new FormData();
    const request = {
      formData: async () => form,
    };

    const response = await POST(request as never);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "No files provided",
    });
  });

  it("imports parsed PDF orders and returns success summary", async () => {
    mockCreateServiceSupabase.mockResolvedValue(createImportPdfSupabaseMock());

    const file = new File([new Uint8Array([1, 2, 3])], "test.pdf", {
      type: "application/pdf",
    });
    const form = new FormData();
    form.append("files", file);

    const request = {
      formData: async () => form,
    };

    const response = await POST(request as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      totalFiles: 1,
      inserted: 1,
      updated: 0,
      errors: 0,
    });
  });

  it("creates customer when no existing customer is found", async () => {
    const supabase = createImportPdfSupabaseMock({ customerExists: false });
    mockCreateServiceSupabase.mockResolvedValue(supabase);

    const file = new File([new Uint8Array([1, 2, 3])], "test.pdf", {
      type: "application/pdf",
    });
    const form = new FormData();
    form.append("files", file);

    const request = {
      formData: async () => form,
    };

    const response = await POST(request as never);
    const payload = await response.json();

    expect(response.status, JSON.stringify(payload)).toBe(200);
    expect(payload.ok).toBe(true);
    expect(supabase.stats.customersInserted).toBe(1);
  });

  it("returns per-order error when order insert fails", async () => {
    mockCreateServiceSupabase.mockResolvedValue(
      createImportPdfSupabaseMock({ orderInsertError: "order insert failed" })
    );

    const file = new File([new Uint8Array([1, 2, 3])], "test.pdf", {
      type: "application/pdf",
    });
    const form = new FormData();
    form.append("files", file);

    const request = {
      formData: async () => form,
    };

    const response = await POST(request as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.ok).toBe(true);
    expect(payload.errors).toBeGreaterThan(0);
    expect(payload.errorMessages.join(" ")).toContain("order insert failed");
  });
});
