import { describe, expect, it } from "vitest";
import { parseOrderStreamDateTime } from "./orderstream-dates";

describe("parseOrderStreamDateTime", () => {
  it("parses an afternoon download timestamp, preserving the printed day/time", () => {
    expect(parseOrderStreamDateTime("08/25/2026 06:01 PM")).toBe("2026-08-25T18:01:00.000Z");
    expect(parseOrderStreamDateTime("08/25/2026 04:47 PM")).toBe("2026-08-25T16:47:00.000Z");
  });

  it("handles 12 AM / 12 PM boundaries", () => {
    expect(parseOrderStreamDateTime("01/03/2026 12:00 AM")).toBe("2026-01-03T00:00:00.000Z");
    expect(parseOrderStreamDateTime("01/03/2026 12:30 PM")).toBe("2026-01-03T12:30:00.000Z");
  });

  it("returns null for missing or unparseable values", () => {
    expect(parseOrderStreamDateTime(null)).toBeNull();
    expect(parseOrderStreamDateTime("")).toBeNull();
    expect(parseOrderStreamDateTime("N/A")).toBeNull();
    expect(parseOrderStreamDateTime("08/25/2026")).toBeNull();
  });
});
