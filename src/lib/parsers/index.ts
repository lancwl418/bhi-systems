export { parseHomeDepotPDF, parseHomeDepotPDFMulti } from "./home-depot";
export { parseLowesPDF, parseLowesPDFMulti } from "./lowes";
export type { ParsedOrder, ParsedOrderItem } from "./types";

export function detectRetailer(text: string): "Home Depot" | "Lowes" | null {
  if (/home\s*depot/i.test(text) || /homedepot\.com/i.test(text)) return "Home Depot";
  if (/lowe'?s/i.test(text) || /lowes\.com/i.test(text)) return "Lowes";
  return null;
}
