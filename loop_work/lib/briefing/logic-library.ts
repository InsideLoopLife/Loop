import type { FinancialBriefing } from "./build-financial-briefing";
import type { BriefingCardKey } from "./chat-cards";
import { computePensionProjection, detectPensionProjectionRequest, type BriefingLineChart } from "./projections";

export type LogicSkillResult = { reply: string; card: BriefingCardKey | null; chart?: BriefingLineChart | null };

export type LogicSkill = {
  id: string;
  // Human-readable note on what this skill covers — shown nowhere in the
  // UI, purely so a developer scanning this file (or the gap log below)
  // can see at a glance what's already handled before adding a new skill.
  description: string;
  match: (message: string, briefing: FinancialBriefing) => boolean;
  respond: (message: string, briefing: FinancialBriefing) => LogicSkillResult | null;
};

function money(v: number) {
  return `£${Math.round(Number(v || 0)).toLocaleString("en-GB")}`;
}

/**
 * The logic library itself. Each skill is a self-contained, deterministic
 * answer to a real question shape — grounded entirely in already-computed
 * briefing data, no AI involved. This is the growth mechanism the token
 * budget depends on: the more question shapes get a skill here, the less
 * often a real AI call (and its token cost) is needed at all. Order
 * matters — first match wins, so more specific patterns (e.g. pension
 * projection) are listed before their broader siblings (e.g. pension
 * funds generally).
 */
export const LOGIC_LIBRARY: LogicSkill[] = [
  {
    id: "pension_projection",
    description: "Projected pension pot value N years (or to a target age) from now, at custom intervals — real compound-interest math on real fund data.",
    match: (message, briefing) => detectPensionProjectionRequest(message, briefing.ageYears) != null,
    respond: (message, briefing) => {
      const request = detectPensionProjectionRequest(message, briefing.ageYears);
      if (!request) return null;
      const chart = computePensionProjection(briefing, request.years, request.intervalYears, request.targetAge);
      if (!chart) return null;
      return { reply: `${chart.subtitle}. ${chart.note}`, card: null, chart };
    },
  },
  {
    id: "pension_funds",
    description: "Which pension funds exist and how each is performing (5yr annualised return, fee).",
    match: (message) => /pension.?fund|which pension|what pension|pension.*(up|down|perform)/i.test(message),
    respond: (_message, briefing) => {
      if (!briefing.pensionFunds.length) {
        return { reply: "Your pension pot value is tracked, but no individual fund breakdown is logged yet — add fund detail on a pension account to see it here.", card: null };
      }
      const withPerf = briefing.pensionFunds.filter((f) => f.annualised5y != null);
      const best = [...withPerf].sort((a, b) => (b.annualised5y ?? 0) - (a.annualised5y ?? 0))[0];
      const worst = [...withPerf].sort((a, b) => (a.annualised5y ?? 0) - (b.annualised5y ?? 0))[0];
      const perfLine =
        best && worst && best.name !== worst.name
          ? ` ${best.name} leads on 5-year annualised return at ${best.annualised5y?.toFixed(1)}%, while ${worst.name} is lowest at ${worst.annualised5y?.toFixed(1)}%.`
          : "";
      return {
        reply: `You have ${briefing.pensionFunds.length} pension fund${briefing.pensionFunds.length === 1 ? "" : "s"} logged, totalling ${money(briefing.pensionFunds.reduce((t, f) => t + f.value, 0))}.${perfLine}`,
        card: "pension_funds_table",
      };
    },
  },
  {
    id: "holdings",
    description: "Which investment holdings exist and their combined value.",
    match: (message) => /holding|which (invest|fund|stock|share)|what (invest|fund|stock|share)/i.test(message) && !/pension/i.test(message),
    respond: (_message, briefing) =>
      briefing.holdings.length
        ? { reply: `You have ${briefing.holdings.length} priced holding${briefing.holdings.length === 1 ? "" : "s"} worth ${money(briefing.investments.value)} in total.`, card: "holdings_table" }
        : { reply: "No priced holdings are linked yet — connect or add investment accounts to see them here.", card: null },
  },
  {
    id: "net_worth",
    description: "Overall household net worth, assets vs liabilities.",
    match: (message) => /net.?worth|overall (wealth|worth)|total (wealth|worth)/i.test(message),
    respond: (_message, briefing) => ({
      reply: `Your household net worth is ${money(briefing.currentNetWorth)} — ${money(briefing.assets)} in assets against ${money(briefing.liabilities)} in liabilities.`,
      card: "net_worth",
    }),
  },
  {
    id: "portfolio",
    description: "Investment portfolio value and largest single exposure.",
    match: (message) => /invest|portfolio|\bstock\b|\bfund\b|\bshare\b/i.test(message) && !/pension/i.test(message),
    respond: (_message, briefing) => ({
      reply: `Your priced investments are worth ${money(briefing.investments.value)}. ${
        briefing.investments.topExposure ? `${briefing.investments.topExposure} is your largest exposure at about ${briefing.investments.topExposurePercent.toFixed(0)}%.` : "Connect or refresh holdings for exposure detail."
      }`,
      card: "portfolio",
    }),
  },
  {
    id: "savings",
    description: "Savings balance, blended interest rate, monthly deposits/withdrawals.",
    match: (message) => /saving|\bisa\b|interest rate|blended rate/i.test(message),
    respond: (_message, briefing) => ({
      reply: `Savings sit at ${money(briefing.savings.balance)}, blended rate ${briefing.savings.blendedRate.toFixed(2)}%. £${Math.round(briefing.savings.monthlyDeposits).toLocaleString("en-GB")} banked this month.`,
      card: "savings",
    }),
  },
  {
    id: "home",
    description: "Home equity, mortgage balance, LTV.",
    match: (message) => /mortgage|\bhouse\b|\bhome\b|property|\bequity\b|\bltv\b/i.test(message),
    respond: (_message, briefing) =>
      briefing.home
        ? { reply: `Estimated home equity is ${money(briefing.home.equity)}, mortgage ${money(briefing.home.mortgage)}, LTV around ${briefing.home.ltv.toFixed(0)}%.`, card: "home" }
        : { reply: "No property is linked yet, so I can't show equity or LTV.", card: null },
  },
  {
    id: "financial_flow",
    description: "Monthly income vs spending, savings, unassigned money.",
    match: (message) => /\bspend\b|\bbudget\b|financial flow|\bincome\b|outgoing/i.test(message),
    respond: (_message, briefing) => ({
      reply: `This month: ${money(briefing.flow.income)} income, ${money(briefing.flow.spending)} spending, ${money(briefing.flow.savings)} to savings, ${money(briefing.flow.unassigned)} unassigned.`,
      card: "flow",
    }),
  },
  {
    id: "priority_actions",
    description: "Top recommended next step from the household's priority list.",
    match: (message) => /what should i do|next step|priorit|recommend|advice/i.test(message),
    respond: (_message, briefing) => ({
      reply: briefing.actions[0] ? `Top priority: ${briefing.actions[0].title}. ${briefing.actions[0].body}` : "Nothing urgent stands out right now.",
      card: "actions",
    }),
  },
];

/**
 * Tries every skill in order and returns the first genuine match. Returns
 * null if nothing in the library covers the question — the caller should
 * fall through to a real AI call in that case (and log the gap so the
 * library can grow to cover it next time).
 */
export function runLogicLibrary(message: string, briefing: FinancialBriefing): LogicSkillResult | null {
  for (const skill of LOGIC_LIBRARY) {
    if (skill.match(message, briefing)) {
      const result = skill.respond(message, briefing);
      if (result) return result;
    }
  }
  return null;
}
