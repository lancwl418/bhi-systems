import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { mockCreateServiceSupabase } = vi.hoisted(() => ({
  mockCreateServiceSupabase: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceSupabase: mockCreateServiceSupabase,
}));

import { GET as listTickets, POST as createTicket } from "./route";
import { GET as searchTickets } from "./search/route";

const TOKEN = "test-token-123";

function request(
  url: string,
  init: { method?: string; token?: string | null; body?: unknown } = {}
): NextRequest {
  const headers: Record<string, string> = {};
  if (init.token !== null) headers.Authorization = `Bearer ${init.token ?? TOKEN}`;
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  return new NextRequest(`http://localhost${url}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
}

describe("support API v1 auth and validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("SUPPORT_API_TOKEN", TOKEN);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects requests without a token", async () => {
    const response = await listTickets(request("/api/v1/tickets", { token: null }));
    expect(response.status).toBe(401);
  });

  it("rejects requests with a wrong token", async () => {
    const response = await listTickets(
      request("/api/v1/tickets", { token: "wrong" })
    );
    expect(response.status).toBe(401);
  });

  it("returns 503 when the token is not configured", async () => {
    vi.stubEnv("SUPPORT_API_TOKEN", "");
    const response = await listTickets(request("/api/v1/tickets"));
    expect(response.status).toBe(503);
  });

  it("requires q or thread_id on search", async () => {
    const response = await searchTickets(request("/api/v1/tickets/search"));
    expect(response.status).toBe(400);
  });

  it("requires issue_summary and a customer identifier on create", async () => {
    const response = await createTicket(
      request("/api/v1/tickets", {
        method: "POST",
        body: { customer_name: "No summary" },
      })
    );
    expect(response.status).toBe(400);
  });

  it("creates a ticket from valid input", async () => {
    let inserted: Record<string, unknown> | null = null;
    mockCreateServiceSupabase.mockResolvedValue({
      from: () => ({
        insert: (row: Record<string, unknown>) => {
          inserted = row;
          return {
            select: () => ({
              single: async () => ({ data: { id: "t-1", ...row }, error: null }),
            }),
          };
        },
      }),
    });

    const response = await createTicket(
      request("/api/v1/tickets", {
        method: "POST",
        body: {
          customer_email: "jane@example.com",
          issue_summary: "Unit arrived damaged",
          po_number: "PO-9",
          stuck: true,
        },
      })
    );

    expect(response.status).toBe(201);
    expect(inserted).toMatchObject({
      customer_email: "jane@example.com",
      issue_summary: "Unit arrived damaged",
      po_number: "PO-9",
      stuck: true,
    });
  });
});
