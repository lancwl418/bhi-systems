// Case type taxonomy for support tickets, shared by the UI, the xlsx import
// (keyword classification), and the external API.

export const CASE_TYPES = [
  "shipping_damage",
  "warranty_claim",
  "parts_request",
  "refund_return",
  "technical_support",
  "order_status",
  "review_reward",
  "registration",
  "other",
] as const;

export type CaseType = (typeof CASE_TYPES)[number];

export const CASE_TYPE_LABELS: Record<CaseType, string> = {
  shipping_damage: "Shipping damage",
  warranty_claim: "Warranty claim",
  parts_request: "Parts request",
  refund_return: "Refund / Return",
  technical_support: "Technical support",
  order_status: "Order status",
  review_reward: "Review reward",
  registration: "Registration",
  other: "Other",
};

export const CASE_TYPE_COLORS: Record<CaseType, string> = {
  shipping_damage: "bg-orange-100 text-orange-800",
  warranty_claim: "bg-blue-100 text-blue-800",
  parts_request: "bg-cyan-100 text-cyan-800",
  refund_return: "bg-red-100 text-red-800",
  technical_support: "bg-purple-100 text-purple-800",
  order_status: "bg-yellow-100 text-yellow-800",
  review_reward: "bg-pink-100 text-pink-800",
  registration: "bg-green-100 text-green-800",
  other: "bg-gray-100 text-gray-800",
};

// Part / component nouns customers ask about, used by the parts rule below
const PART_NOUN =
  "(remote( control)?|sensor|(main )?board|pcb|valve|bracket|lineset|line set|pipe|wifi module|compressor|fan motor|indoor unit|outdoor unit|cover|filter|accessor\\w*|hardware)";
const PART_VERB =
  "(order(ed|ing)?|buy|purchase|need(s|ed)?|want(s|ed)?|missing|not included|fits?|replace(d|ment)?|exchange|send|sent|lost|broke(n)?|bent|damaged)";

// Keyword rules, first match wins — more specific intents before generic ones.
const RULES: [CaseType, RegExp][] = [
  [
    "registration",
    /warranty registration|register (the |his |her |my )?(unit|warranty|product)|app setup|wifi setup/i,
  ],
  [
    "review_reward",
    /gift card|review (reward|screenshot|requirements?)|5-star review|review-reward/i,
  ],
  [
    "shipping_damage",
    /damaged (in|during) (transit|shipping)|arrived damaged|delivered .{0,40}damaged|dented|crushed|shipping damage|box (was )?(open|damaged)/i,
  ],
  // High-precision warranty markers outrank refund/parts wording that often
  // appears inside the same claim ("asking for replacement part numbers...")
  [
    "warranty_claim",
    /warranty claim|claim #|under warranty|first american|home warranty/i,
  ],
  [
    "refund_return",
    /refund|returned?|return authorization|\bRA\b|chargeback|cancel(led|lation)?/i,
  ],
  [
    "parts_request",
    new RegExp(
      `part number|replacement (part|order)|spare part|${PART_VERB}.{0,60}${PART_NOUN}|${PART_NOUN}.{0,60}${PART_VERB}`,
      "i"
    ),
  ],
  [
    "order_status",
    /tracking|where is (my|the) order|delivery (date|eta|status)|not (yet )?(arrived|delivered)|shipment status/i,
  ],
  [
    "technical_support",
    /not (working|cooling|heating|running|turning|powering)|error code|troubleshoot|noise|leak|hissing|refrigerant|compressor|pressure|shuts? off|stops? (after|when|while|mid)|won'?t (start|turn)|stopped (working|completely|cooling|heating)|fault|ongoing problems/i,
  ],
];

export function classifyCaseType(text: string): CaseType {
  for (const [type, pattern] of RULES) {
    if (pattern.test(text)) return type;
  }
  return "other";
}
