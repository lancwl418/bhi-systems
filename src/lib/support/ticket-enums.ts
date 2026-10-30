// Valid enum values for ticket status fields, used by API input validation.

export const REPLY_STATUSES = ["not_replied", "in_progress", "replied"] as const;

export const PROGRESS_VALUES = [
  "in_progress",
  "awaiting_customer",
  "awaiting_internal",
  "awaiting_third_party",
  "resolved",
] as const;

export function invalidEnumMessage(
  field: string,
  values: readonly string[]
): string {
  return `Invalid ${field}; expected one of: ${values.join(", ")}`;
}
