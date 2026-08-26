/**
 * Parse an OrderStream "MM/DD/YYYY hh:mm AM/PM" timestamp (as printed in the
 * CSV export, with no timezone) into a UTC ISO string. The printed wall-clock
 * date and time are preserved verbatim — we only care about the calendar day,
 * so treating the value as UTC keeps that day stable through storage and report
 * bucketing. Returns null when the value is missing or unparseable.
 */
export function parseOrderStreamDateTime(val: string | null | undefined): string | null {
  if (!val) return null;
  const s = String(val).trim();
  if (!s || s === "N/A") return null;

  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;

  const [, mm, dd, yyyy, hourRaw, minute, meridiem] = m;
  let hour = parseInt(hourRaw, 10) % 12;
  if (meridiem.toUpperCase() === "PM") hour += 12;

  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}T${String(hour).padStart(2, "0")}:${minute}:00.000Z`;
}
