import { beforeEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";

const { mockCreateServiceSupabase } = vi.hoisted(() => ({
  mockCreateServiceSupabase: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServiceSupabase: mockCreateServiceSupabase,
}));

import { POST } from "./route";

const HEADER = [
  "#",
  "Date",
  "Customer",
  "Email",
  "Source",
  "Issue Summary",
  "Reply Status",
  "Progress",
  "Stuck",
  "Next Step",
];

function buildXlsxFile(rows: (string | number)[][]): File {
  const sheet = XLSX.utils.aoa_to_sheet([HEADER, ...rows]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
  const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  return new File([buffer], "cases.xlsx");
}

function createSupabaseMock(existing: { customer_email: string; issue_summary: string }[] = []) {
  const inserted: Record<string, unknown>[] = [];
  return {
    inserted,
    client: {
      from: (table: string) => {
        expect(table).toBe("support_tickets");
        return {
          select: async () => ({ data: existing }),
          insert: async (row: Record<string, unknown>) => {
            inserted.push(row);
            return { error: null };
          },
        };
      },
    },
  };
}

function makeRequest(file: File) {
  return {
    formData: async () => ({
      get: (key: string) => (key === "file" ? file : null),
    }),
  } as never;
}

describe("POST /api/support/import", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when file is missing", async () => {
    const request = {
      formData: async () => ({ get: () => null }),
    };
    const response = await POST(request as never);
    expect(response.status).toBe(400);
  });

  it("imports rows, mapping statuses and messy stuck values", async () => {
    const mock = createSupabaseMock();
    mockCreateServiceSupabase.mockResolvedValue(mock.client);

    // Excel serial 46321 = 2026-10-26; gives the year hint for "MM-DD" rows
    const file = buildXlsxFile([
      [
        "1", 46321, "Jackie Wilson", "jackie@example.com", "Direct email",
        "Refrigerant leak at the coil connection", "Replied", "Awaiting customer",
        "Yes", "Provide part number",
      ],
      [
        "2", "10-22 ~ 10-23", "Tony Winstead", "tony@example.com", "Lowe's",
        "Unit delivered damaged", "Not replied", "In progress",
        "No", "Ship replacement",
      ],
      [
        "3", "10-23", "Pat Doe", "pat@example.com", "Forwarded by Home Depot",
        "Refund request", "Replied", "Resolved",
        "Refund submitted 10-26, pending gateway", "",
      ],
    ]);

    const response = await POST(makeRequest(file));
    const payload = await response.json();

    expect(response.status, JSON.stringify(payload)).toBe(200);
    expect(payload).toMatchObject({ ok: true, inserted: 3, skipped: 0 });

    expect(mock.inserted[0]).toMatchObject({
      case_date: "2026-10-26",
      customer_name: "Jackie Wilson",
      reply_status: "replied",
      progress: "awaiting_customer",
      stuck: true,
      next_step: "Provide part number",
    });

    // String date range uses the serial-derived year hint, first date wins
    expect(mock.inserted[1]).toMatchObject({
      case_date: "2026-10-22",
      date_label: "10-22 ~ 10-23",
      reply_status: "not_replied",
      progress: "in_progress",
      stuck: false,
    });

    // Note text in the Stuck column folds into next_step instead
    expect(mock.inserted[2]).toMatchObject({
      progress: "resolved",
      stuck: false,
      next_step: "Refund submitted 10-26, pending gateway",
    });
  });

  it("skips rows already imported (same email + summary)", async () => {
    const mock = createSupabaseMock([
      { customer_email: "jackie@example.com", issue_summary: "Refrigerant leak" },
    ]);
    mockCreateServiceSupabase.mockResolvedValue(mock.client);

    const file = buildXlsxFile([
      [
        "1", "10-21", "Jackie Wilson", "jackie@example.com", "Direct email",
        "Refrigerant leak", "Replied", "Awaiting customer", "Yes", "",
      ],
      [
        "2", "10-21", "Jackie Wilson", "jackie@example.com", "Direct email",
        "A different, new issue", "Replied", "In progress", "No", "",
      ],
    ]);

    const response = await POST(makeRequest(file));
    const payload = await response.json();

    expect(payload).toMatchObject({ ok: true, inserted: 1, skipped: 1 });
    expect(mock.inserted[0]).toMatchObject({ issue_summary: "A different, new issue" });
  });

  it("rejects sheets without the expected columns", async () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ["Foo", "Bar"],
      ["1", "2"],
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
    const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
    const response = await POST(makeRequest(new File([buffer], "bad.xlsx")));
    expect(response.status).toBe(400);
  });
});
