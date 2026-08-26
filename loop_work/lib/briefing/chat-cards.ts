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
  "holdings_table",
  "pension_funds_table",
] as const;

export type BriefingCardKey = (typeof BRIEFING_CARD_KEYS)[number];

export function isBriefingCardKey(value: unknown): value is BriefingCardKey {
  return typeof value === "string" && (BRIEFING_CARD_KEYS as readonly string[]).includes(value);
}

export const BRIEFING_CARD_DESCRIPTIONS: Record<BriefingCardKey, string> = {
  net_worth: "Household net worth headline, assets/liabilities split, and a live net worth trend graph.",
  category_grid: "Live grid of investments, savings, pensions and property equity, each with its own trend graph.",
  actions: "The three ranked priority decisions/recommendations. No graph.",
  flow: "Monthly Financial Flow: income vs spending, savings and unassigned money. No graph.",
  portfolio: "Investment portfolio value, largest single exposure, and a live investments trend graph.",
  savings: "Savings balance, blended interest rate, this month's deposits/withdrawals, and a live savings trend graph.",
  home: "Home equity, mortgage LTV, and a live property equity trend graph, if a property is linked.",
  evidence: "ONLY for when the user broadly asks what data is missing/incomplete across their whole household. Never use this as a filler for a single unanswerable question — use card: null for that instead.",
  holdings_table: "Real table of individual investment holdings by name, current value and today's change. Use for 'what investments/holdings/funds do I have' style questions.",
  pension_funds_table: "Real table of individual pension funds by name, current value, 5-year annualised performance (where available) and annual fee. Use for 'what pension funds do I have' or 'how are my pensions performing' style questions.",
};
