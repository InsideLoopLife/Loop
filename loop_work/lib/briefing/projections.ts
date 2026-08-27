import type { FinancialBriefing } from "./build-financial-briefing";

// A generic computed line chart. Deliberately not tied to pensions
// specifically — any future "project X forward" feature (savings, net
// worth) can return this same shape and reuse LineChartCard to render it.
export type BriefingLineChartPoint = { x: number; y: number };
export type BriefingLineChart = {
  id: string;
  title: string;
  subtitle: string;
  xLabel: string;
  yLabel: string;
  points: BriefingLineChartPoint[];
  note: string;
};

const DEFAULT_FALLBACK_RATE_PERCENT = 4; // used only if no fund has any known performance data

function extractYears(q: string, defaultYears: number): number {
  const explicit = q.match(/(\d{1,2})\s*(?:years|yrs|yr)\b/);
  if (explicit) return Math.min(40, Math.max(1, parseInt(explicit[1], 10)));
  return defaultYears;
}

// Deliberately requires an explicit pension mention alongside a
// projection-style phrase — only pension projections are computed today,
// so a generic "project my savings" shouldn't accidentally trigger this.
export function detectPensionProjectionYears(message: string): number | null {
  const q = message.toLowerCase();
  const mentionsPension = /pension/.test(q);
  const mentionsProjection = /project|forecast|in \d+ years|over the next|grow(th)?.*year/.test(q);
  if (!mentionsPension || !mentionsProjection) return null;
  return extractYears(q, 10);
}

// Compound-interest projection of total pension value, using a
// value-weighted blend of each fund's real 5-year annualised return
// (falling back to a conservative default for funds with no logged
// performance), plus the household's current monthly pension contribution
// continuing at the same rate — i.e. exactly "same input and growth"
// assumptions, computed for real rather than hand-waved.
export function computePensionProjection(briefing: FinancialBriefing, years: number): BriefingLineChart | null {
  const funds = briefing.pensionFunds;
  const startValue = funds.reduce((sum, f) => sum + f.value, 0);
  if (!funds.length || startValue <= 0) return null;

  const known = funds.filter((f) => f.annualised5y != null);
  const knownValue = known.reduce((sum, f) => sum + f.value, 0);
  const blendedRate = knownValue > 0 ? known.reduce((sum, f) => sum + f.value * (f.annualised5y as number), 0) / knownValue : DEFAULT_FALLBACK_RATE_PERCENT;
  const coveragePercent = Math.round((knownValue / startValue) * 100);

  const monthlyContribution = Math.max(0, briefing.flow.pensions);
  const monthlyRate = blendedRate / 100 / 12;

  const points: BriefingLineChartPoint[] = [];
  for (let year = 0; year <= years; year++) {
    const months = year * 12;
    const futureValueOfLump = startValue * Math.pow(1 + monthlyRate, months);
    const futureValueOfContributions = monthlyRate > 0 ? monthlyContribution * ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate) : monthlyContribution * months;
    points.push({ x: year, y: Math.round(futureValueOfLump + futureValueOfContributions) });
  }

  const endValue = points[points.length - 1].y;
  const money = (v: number) => `£${Math.round(v).toLocaleString("en-GB")}`;

  return {
    id: "pension_projection",
    title: `Pension projection · ${years} years`,
    subtitle: `${money(startValue)} today → ${money(endValue)} in ${years} years, at a ${blendedRate.toFixed(1)}% blended annual rate`,
    xLabel: "Years from now",
    yLabel: "Projected value (£)",
    points,
    note: `Assumes ${money(monthlyContribution)}/month contribution continuing unchanged and a ${blendedRate.toFixed(1)}% blended annual growth rate, weighted by fund value (${coveragePercent}% of your pension value has a known 5-year annualised return; the rest assumes ${DEFAULT_FALLBACK_RATE_PERCENT}%). This is a projection, not a promise — real returns vary and this isn't financial advice.`,
  };
}
