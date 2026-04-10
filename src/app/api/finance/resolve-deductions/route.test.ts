import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockCreateServiceSupabase } = vi.hoisted(() => ({
  mockCreateServiceSupabase: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceSupabase: mockCreateServiceSupabase,
}));

import { POST } from "./route";

function createResolveSupabaseMock(opts?: { withUnlinked?: boolean }) {
  const withUnlinked = opts?.withUnlinked ?? true;
  let returnsInserted = 0;
  let remittanceUpdated = 0;

  return {
    get stats() {
      return { returnsInserted, remittanceUpdated };
    },
    from(table: string) {
      if (table === "remittance_lines") {
        return {
          select(columns: string) {
            if (columns.includes("adjustment_number") && columns.includes("remittances(")) {
              return {
                is() {
                  return {
                    not() {
                      return withUnlinked
                        ? {
                            data: [
                              {
                                id: "line-1",
                                adjustment_number: "INV-ADJ-1",
                                adjustment_date: "2025-01-11",
                                adjustment_reason: "Damaged",
                                line_amount: "-25",
                                eft_number: "EFT-1",
                                remittances: { retailer: "Lowes" },
                              },
                            ],
                          }
                        : { data: [] };
                    },
                  };
                },
              };
            }

            if (columns === "invoice_number, order_id, po_number") {
              return {
                in() {
                  return {
                    not: async () => ({
                      data: [
                        {
                          invoice_number: "INV-ADJ-1",
                          order_id: "order-1",
                          po_number: "PO-001",
                        },
                      ],
                    }),
                  };
                },
              };
            }

            if (columns === "id, invoice_number") {
              return {
                is() {
                  return {
                    not: async () => ({ data: [] }),
                  };
                },
              };
            }

            return {};
          },
          update() {
            return {
              eq: async () => {
                remittanceUpdated += 1;
                return {};
              },
            };
          },
        };
      }

      if (table === "order_invoices") {
        return {
          select() {
            return {
              in: async () => ({
                data: [
                  {
                    id: "oinv-1",
                    invoice_number: "INV-ADJ-1",
                    order_id: "order-1",
                    po_number: "PO-001",
                  },
                ],
              }),
            };
          },
        };
      }

      if (table === "returns") {
        return {
          select() {
            return {
              in: async () => ({ data: [] }),
            };
          },
          insert: async () => {
            returnsInserted += 1;
            return {};
          },
        };
      }

      return {};
    },
  };
}

describe("POST /api/finance/resolve-deductions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns early when there are no unlinked deductions", async () => {
    mockCreateServiceSupabase.mockResolvedValue(
      createResolveSupabaseMock({ withUnlinked: false })
    );

    const request = {
      json: async () => ({}),
    };

    const response = await POST(request as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      resolved: 0,
      message: "No unlinked deductions found",
    });
  });

  it("resolves deduction lines and creates return records", async () => {
    const supabase = createResolveSupabaseMock({ withUnlinked: true });
    mockCreateServiceSupabase.mockResolvedValue(supabase);

    const request = {
      json: async () => ({}),
    };

    const response = await POST(request as never);
    const payload = await response.json();

    expect(response.status, JSON.stringify(payload)).toBe(200);
    expect(payload).toMatchObject({
      ok: true,
      checked: 1,
      resolved: 1,
      still_unresolved: 0,
    });
    expect(supabase.stats.remittanceUpdated).toBeGreaterThan(0);
    expect(supabase.stats.returnsInserted).toBe(1);
  });
});
