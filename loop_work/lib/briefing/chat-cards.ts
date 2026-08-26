// The fixed set of visual "cards" the chat can attach to a reply. Numbers
// inside every card always come from buildFinancialBriefing() — the model
// only ever picks WHICH card (if any) best answers the question; it never
// supplies the figures themselves. Keeping this list small and closed means
// a malformed or hallucinated model response can't cause an unknown
// component to render.
export const BRIEFING_CARD_KEYS = [
  "net_worth",
  "category_grid",
  "actions",
  "flow",
  "portfolio",
  "savings",
  "home",
  "evidence",
] as const;

export type BriefingCardKey = (typeof BRIEFING_CARD_KEYS)[number];

export function isBriefingCardKey(value: unknown): value is BriefingCardKey {
  return typeof value === "string" && (BRIEFING_CARD_KEYS as readonly string[]).includes(value);
}

export const BRIEFING_CARD_DESCRIPTIONS: Record<BriefingCardKey, string> = {
  net_worth: "Household net worth headline, assets/liabilities split, and the net worth trend line.",
  category_grid: "Live grid of investments, savings, pensions and property equity, each with its own trend line.",
  actions: "The three ranked priority decisions/recommendations.",
  flow: "Monthly Financial Flow: income vs spending, savings and unassigned money.",
  portfolio: "Investment portfolio value and largest single exposure.",
  savings: "Savings balance, blended interest rate, and this month's deposits/withdrawals.",
  home: "Home equity and mortgage LTV, if a property is linked.",
  evidence: "Data-quality notes — what's missing or incomplete in the household's records.",
};
