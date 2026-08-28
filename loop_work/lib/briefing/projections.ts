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

export type PensionProjectionRequest = { years: number; intervalYears: number; targetAge: number | null };

const DEFAULT_FALLBACK_RATE_PERCENT = 4; // used only if no fund has any known performance data
const DEFAULT_PROJECTION_YEARS = 10;
const MAX_PROJECTION_YEARS = 60;

// Deliberately requires an explicit pension mention — only pension
// projections are computed today, so a generic "project my savings"
// shouldn't accidentally trigger this. Beyond that, recognises several
// real phrasings: an explicit year count ("in 10 years"), a target age
// ("to 70" / "until I'm 70" / "when I turn 70" — requires a known
// currentAge to convert to a year count), chart/graph/project wording on
// its own (defaults to 10 years), and an interval hint ("5 year
// intervals" / "every 5 years") for how far apart the plotted points are.
//
// "Performance" alone is deliberately NOT enough on its own to trigger
// this — "how are my pensions performing" should stay with the plain
// pension-funds skill. It only counts here alongside an actual horizon
// (years/age), which is what previously misfired: a message like "pension
// chart showing my possible performance... to 70" was being swallowed by
// the funds skill's broader "pension...perform" pattern before this
// function ever got a chance to recognise the "to 70" horizon.
export function detectPensionProjectionRequest(message: string, currentAge: number | null): PensionProjectionRequest | null {
  const q = message.toLowerCase();
  if (!/pension/.test(q)) return null;

  const explicitYearsMatch = q.match(/(\d{1,2})\s*(?:years|yrs|yr)\b/);
  const toAgeMatch = q.match(/(?:\bto\b|\buntil\b|\bby\b|when i(?:'m|\s+am)?\s+(?:turn|reach|hit))\s*(?:age\s*)?(\d{2,3})\b/);
  const mentionsProjectionWord = /project|forecast|\bchart\b|\bgraph\b|\bplot\b|show me/.test(q);
  const mentionsGrowthYear = /grow(th)?.*year/.test(q);
  const mentionsPerformanceWord = /perform/.test(q);

  const hasExplicitHorizon = Boolean(explicitYearsMatch) || Boolean(toAgeMatch);
  const looksLikeProjection = mentionsProjectionWord || mentionsGrowthYear || hasExplicitHorizon || (mentionsPerformanceWord && hasExplicitHorizon);
  if (!looksLikeProjection) return null;

  let years: number | null = null;
  let targetAge: number | null = null;
  if (explicitYearsMatch) {
    years = Math.min(MAX_PROJECTION_YEARS, Math.max(1, parseInt(explicitYearsMatch[1], 10)));
  } else if (toAgeMatch && currentAge != null) {
    targetAge = parseInt(toAgeMatch[1], 10);
    years = Math.min(MAX_PROJECTION_YEARS, Math.max(1, targetAge - currentAge));
  }
  if (years == null) years = DEFAULT_PROJECTION_YEARS;

  let intervalYears = 1;
  const intervalMatch = q.match(/every\s*(\d{1,2})\s*years?|(\d{1,2})\s*[- ]?year intervals?/);
  if (intervalMatch) {
    intervalYears = Math.max(1, parseInt(intervalMatch[1] || intervalMatch[2], 10));
  }

  return { years, intervalYears, targetAge };
}

// Compound-interest projection of total pension value, using a
// value-weighted blend of each fund's real 5-year annualised return
// (falling back to a conservative default for funds with no logged
// performance), plus the household's current monthly pension contribution
// continuing at the same rate — i.e. exactly "same input and growth"
// assumptions, computed for real rather than hand-waved.
//
// intervalYears controls how far apart the plotted points are (e.g. 5 for
// "5 year intervals") — the underlying math is still compounded monthly
// for accuracy, only the chart's point spacing changes. Year 0 and the
// final year are always included even if they don't land on an interval
// boundary, so the chart always starts and ends where you'd expect.
export function computePensionProjection(briefing: FinancialBriefing, years: number, intervalYears = 1, targetAge: number | null = null): BriefingLineChart | null {
  const funds = briefing.pensionFunds;
  const startValue = funds.reduce((sum, f) => sum + f.value, 0);
  if (!funds.length || startValue <= 0) return null;

  const known = funds.filter((f) => f.annualised5y != null);
  const knownValue = known.reduce((sum, f) => sum + f.value, 0);
  const blendedRate = knownValue > 0 ? known.reduce((sum, f) => sum + f.value * (f.annualised5y as number), 0) / knownValue : DEFAULT_FALLBACK_RATE_PERCENT;
  const coveragePercent = Math.round((knownValue / startValue) * 100);

  const monthlyContribution = Math.max(0, briefing.flow.pensions);
  const monthlyRate = blendedRate / 100 / 12;
  const step = Math.max(1, Math.round(intervalYears));

  function valueAtYear(year: number) {
    const months = year * 12;
    const futureValueOfLump = startValue * Math.pow(1 + monthlyRate, months);
    const futureValueOfContributions = monthlyRate > 0 ? monthlyContribution * ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate) : monthlyContribution * months;
    return Math.round(futureValueOfLump + futureValueOfContributions);
  }

  const points: BriefingLineChartPoint[] = [];
  for (let year = 0; year <= years; year += step) {
    points.push({ x: year, y: valueAtYear(year) });
  }
  if (points[points.length - 1]?.x !== years) {
    points.push({ x: years, y: valueAtYear(years) });
  }

  const endValue = points[points.length - 1].y;
  const money = (v: number) => `£${Math.round(v).toLocaleString("en-GB")}`;
  const horizonLabel = targetAge != null ? `to age ${targetAge}` : `in ${years} years`;

  return {
    id: "pension_projection",
    title: targetAge != null ? `Pension projection · to age ${targetAge}` : `Pension projection · ${years} years`,
    subtitle: `${money(startValue)} today → ${money(endValue)} ${horizonLabel}, at a ${blendedRate.toFixed(1)}% blended annual rate`,
    xLabel: "Years from now",
    yLabel: "Projected value (£)",
    points,
    note: `Assumes ${money(monthlyContribution)}/month contribution continuing unchanged and a ${blendedRate.toFixed(1)}% blended annual growth rate, weighted by fund value (${coveragePercent}% of your pension value has a known 5-year annualised return; the rest assumes ${DEFAULT_FALLBACK_RATE_PERCENT}%)${step > 1 ? `, plotted every ${step} years` : ""}. This is a projection, not a promise — real returns vary and this isn't financial advice.`,
  };
}
