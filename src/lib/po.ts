/**
 * Normalize PO number based on retailer.
 * - Home Depot: 8 digits (10-digit with "00" prefix → strip to 8)
 * - Lowe's: 9 digits
 * - XLSX/CSV often strips leading zeros, so we pad back.
 */
export function normalizePO(po: string, retailer: string = ""): string {
  const r = retailer.toLowerCase();
  const isLowes = r.includes("lowe");
  const targetLen = isLowes ? 9 : 8;

  // HD sends 10-digit POs with "00" prefix → strip to 8
  if (!isLowes && po.length === 10 && po.startsWith("00")) {
    return po.slice(2);
  }

  // Pad short numeric POs back to target length
  if (po.length < targetLen && /^\d+$/.test(po)) {
    return po.padStart(targetLen, "0");
  }

  return po;
}
