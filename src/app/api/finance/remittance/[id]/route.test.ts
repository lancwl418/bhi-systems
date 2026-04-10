import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreateServiceSupabase } = vi.hoisted(() => ({
  mockCreateServiceSupabase: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceSupabase: mockCreateServiceSupabase,
}));

import { DELETE } from "./route";

function createDeleteRemittanceSupabaseMock(opts?: { exists?: boolean }) {
  const exists = opts?.exists ?? true;
  let deleted = 0;

  return {
    get deleted() {
      return deleted;
    },
    from(table: string) {
      if (table !== "remittances") return {};

      return {
        select() {
          return {
            eq() {
              return {
                single: async () => ({
                  data: exists
                    ? { id: "rem-1", eft_number: "EFT-001", file_name: "file.xlsx" }
                    : null,
                }),
              };
            },
          };
        },
        delete() {
          return {
            eq: async () => {
              deleted += 1;
              return { error: null };
            },
          };
        },
      };
    },
  };
}

describe("DELETE /api/finance/remittance/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 404 when remittance does not exist", async () => {
    mockCreateServiceSupabase.mockResolvedValue(
      createDeleteRemittanceSupabaseMock({ exists: false })
    );

    const response = await DELETE({} as never, {
      params: Promise.resolve({ id: "missing" }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: "Remittance not found",
    });
  });

  it("deletes remittance successfully", async () => {
    const supabase = createDeleteRemittanceSupabaseMock({ exists: true });
    mockCreateServiceSupabase.mockResolvedValue(supabase);

    const response = await DELETE({} as never, {
      params: Promise.resolve({ id: "rem-1" }),
    });
    const payload = await response.json();

    expect(response.status, JSON.stringify(payload)).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      deleted_remittance: "file.xlsx",
      eft_number: "EFT-001",
    });
    expect(supabase.deleted).toBe(1);
  });
});
