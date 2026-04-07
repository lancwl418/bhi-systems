// Canonical retailer names — single source of truth
export const RETAILERS = {
  HOME_DEPOT: "Home Depot",
  LOWES: "Lowe's",
  WAYFAIR: "Wayfair",
  EBAY: "eBay",
  SHOPIFY: "Shopify",
  DSCO: "DSCO / AAFES",
} as const;

// Map any variant to canonical name
const RETAILER_ALIASES: Record<string, string> = {
  // Home Depot
  "home depot": RETAILERS.HOME_DEPOT,
  "the home depot": RETAILERS.HOME_DEPOT,
  "the home depot inc": RETAILERS.HOME_DEPOT,
  "the home depot inc.": RETAILERS.HOME_DEPOT,
  "homedepot": RETAILERS.HOME_DEPOT,
  "home depot (via commercehub)": RETAILERS.HOME_DEPOT,
  // Lowe's
  "lowe's": RETAILERS.LOWES,
  "lowes": RETAILERS.LOWES,
  "lowe\u2019s": RETAILERS.LOWES,
  "lowes (via commercehub)": RETAILERS.LOWES,
  // Wayfair
  "wayfair": RETAILERS.WAYFAIR,
  // eBay
  "ebay": RETAILERS.EBAY,
  // Shopify
  "shopify": RETAILERS.SHOPIFY,
  "shopify (direct)": RETAILERS.SHOPIFY,
  // DSCO
  "dsco": RETAILERS.DSCO,
  "dsco / aafes": RETAILERS.DSCO,
  "aafes": RETAILERS.DSCO,
};

export function normalizeRetailer(name: string): string {
  if (!name) return "Unknown";
  const lower = name.toLowerCase().trim();
  return RETAILER_ALIASES[lower] || name;
}
