import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveIntegrationSecret } from "@/lib/integrations/secrets";
import { checkAiRouteAllowed, recordAiRouteUsage } from "@/lib/ai/route-budget";
import {
  UK_MORTGAGE_LOGIC_SOURCES,
  buildLenderAffordabilityChecks,
  calculateMortgageBreakdown,
  fallbackMortgageProducts,
  scoreMortgageAffordability,
  type LenderAffordabilityCheck,
  type MortgageAffordabilityBreakdown,
  type MortgagePlanningContext,
  type MortgageProductOption,
} from "@/lib/affordability/mortgage-market";

function extractMoney(text: string) {
  const normal = text.toLowerCase().replace(/,/g, "");
  const match = normal.match(/£?\s*([0-9]+(?:\.[0-9]+)?)\s*(k|m|thousand|million)?/i);
  if (!match) return 0;
  const value = Number(match[1] || 0);
  const unit = match[2] || "";
  if (unit === "m" || unit === "million") return value * 1_000_000;
  if (unit === "k" || unit === "thousand") return value * 1_000;
  return value;
}

function classify(text: string) {
  const q = text.toLowerCase();
  if (/house|home|property|mortgage|bigger/.test(q)) return "house" as const;
  if (/car|pcp|lease|vehicle/.test(q)) return "car" as const;
  if (/tv|television|sofa|laptop|phone/.test(q)) return "tv" as const;
  if (/holiday|trip|travel/.test(q)) return "holiday" as const;
  return "other" as const;
}

function money(value: number) {
  return `£${Math.round(Number(value || 0)).toLocaleString()}`;
}

type CoachContext = {
  currentGrossIncome?: number;
  currentNetMonthlyIncome?: number;
  currentChildcare?: number;
  fixedCosts?: number;
  debtPayments?: number;
  carFinance?: number;
  studentLoans?: number;
  currentMortgagePayment?: number;
  currentMortgageBalance?: number;
  currentPropertyValue?: number;
  dependantChildren?: number;
  dependantAdults?: number;
};

type CoachResult = {
  title: string;
  itemType: "house" | "car" | "tv" | "holiday" | "other";
  summary: string;
  questions: string[];
  assumptions: string[];
  score: string;
  scoreLabel: string;
  mortgageBreakdown?: MortgageAffordabilityBreakdown | null;
  mortgageProducts?: MortgageProductOption[];
  lenderChecks?: LenderAffordabilityCheck[];
  researchSources?: typeof UK_MORTGAGE_LOGIC_SOURCES;
  draftScenario: {
    label: string;
    purchase_price: number;
    deposit_cash: number;
    current_property_sale_price: number;
    current_mortgage_balance: number;
    gross_household_income: number;
    monthly_fixed_costs: number;
    monthly_childcare: number;
    interest_rate: number;
    stress_rate: number;
    term_years: number;
    arrangement_and_moving_costs: number;
    notes: string;
  };
};

function buildMortgageInput(query: string, context: CoachContext, target: number): MortgagePlanningContext {
  const assumedDeposit = Math.round(target * 0.1);
  return {
    targetPrice: target,
    depositCash: assumedDeposit,
    currentPropertySalePrice: Number(context.currentPropertyValue || 0),
    currentMortgageBalance: Number(context.currentMortgageBalance || 0),
    grossHouseholdIncome: Number(context.currentGrossIncome || 0),
    netMonthlyIncome: Number(context.currentNetMonthlyIncome || 0),
    monthlyFixedCosts: Number(context.fixedCosts || 0),
    monthlyChildcare: Number(context.currentChildcare || 0),
    monthlyDebtPayments: Number(context.debtPayments || 0),
    monthlyCarFinance: Number(context.carFinance || 0),
    monthlyStudentLoans: Number(context.studentLoans || 0),
    dependantChildren: Number(context.dependantChildren || 0),
    dependantAdults: Number(context.dependantAdults || 0),
    currentMortgagePayment: Number(context.currentMortgagePayment || 0),
    termYears: /25\s*year|25yr|25 yr/i.test(query) ? 25 : 30,
    productRate: 4.75,
    stressRate: 6.5,
    includeCurrentMortgageAsBackgroundCost: /keep|retain|rent out|second home|additional property|buy to let|btl/i.test(query),
  };
}

function fallbackResult(query: string, context: CoachContext): CoachResult {
  const itemType = classify(query);
  const target = extractMoney(query) || (itemType === "house" ? 550000 : itemType === "car" ? 30000 : itemType === "tv" ? 900 : 5000);
  const monthlyNetEstimate = Number(context.currentNetMonthlyIncome || 0) || Number(context.currentGrossIncome || 0) / 12 * 0.68;
  const committed = Number(context.fixedCosts || 0) + Number(context.currentChildcare || 0) + Number(context.debtPayments || 0) + Number(context.carFinance || 0) + Number(context.studentLoans || 0);
  const mortgageInput = buildMortgageInput(query, context, target);
  const mortgageBreakdown = itemType === "house" ? calculateMortgageBreakdown(mortgageInput) : null;
  const mortgageProducts = itemType === "house" ? fallbackMortgageProducts(mortgageInput) : [];
  const lenderChecks = itemType === "house" ? buildLenderAffordabilityChecks(mortgageInput) : [];
  const roughMonthly = itemType === "house" ? Math.round(mortgageBreakdown?.newMortgagePayment || 0) : itemType === "car" ? Math.round(target / 48) : Math.round(target / 12);
  const buffer = monthlyNetEstimate - committed - roughMonthly;
  const score = itemType === "house" && mortgageBreakdown ? scoreMortgageAffordability(mortgageBreakdown) : Math.max(5, Math.min(95, Math.round(55 + buffer / Math.max(1, monthlyNetEstimate) * 80)));
  const title = itemType === "house" ? `Bigger house around ${money(target)}` : itemType === "car" ? "Car affordability check" : `Affordability check for ${money(target)}`;
  const questions = itemType === "house"
    ? ["What deposit/equity do you want to use?", "What is your current property value and remaining mortgage?", "Do you want to compare 2-year, 5-year or tracker style rates?", "Do you want moving costs/stamp duty included?"]
    : itemType === "car"
      ? ["Is this PCP, lease, HP or cash?", "What deposit and term are you considering?", "What APR/interest rate and balloon payment apply?", "Should insurance, tax and servicing be included?"]
      : ["Is this cash, finance or credit card?", "What deposit/upfront payment applies?", "How many months should it be spread over?", "Is this a one-off or recurring cost?"];
  const assumptions = itemType === "house"
    ? [
        `Household gross income loaded as ${money(Number(context.currentGrossIncome || 0))}.`,
        `Financial Flow committed costs used before the new mortgage: ${money(mortgageBreakdown?.monthlyCommittedBeforeNewMortgage || committed)}/month, including childcare where loaded.`,
        `Current mortgage payment is not counted against the score unless the query says the old property is being kept as a second home/rental.`,
        `Loan required is estimated at ${money(mortgageBreakdown?.loanRequired || 0)} after the starting deposit/equity assumption.`,
      ]
    : [
        `Household gross income loaded as ${money(Number(context.currentGrossIncome || 0))}.`,
        `Committed fixed costs and childcare loaded as about ${money(committed)} per month.`,
        "Monthly impact is a rough spread until finance type and APR are confirmed.",
      ];
  return {
    title,
    itemType,
    summary: itemType === "house"
      ? "I have treated this as a house-move scenario, pulled in household income, Financial Flow costs, childcare and dependant counts, and excluded the current mortgage from affordability unless you are keeping that property."
      : "I have treated this as a consumer affordability check. The next answers can convert it into PCP/lease/cash/finance calculations and store it in the log.",
    questions,
    assumptions,
    score: String(score),
    scoreLabel: score >= 75 ? "Looks comfortable" : score >= 50 ? "Needs details" : "Looks tight",
    mortgageBreakdown,
    mortgageProducts,
    lenderChecks,
    researchSources: itemType === "house" ? UK_MORTGAGE_LOGIC_SOURCES : [],
    draftScenario: {
      label: query || title,
      purchase_price: target,
      deposit_cash: itemType === "house" ? Math.round(target * 0.1) : 0,
      current_property_sale_price: Number(context.currentPropertyValue || 0),
      current_mortgage_balance: Number(context.currentMortgageBalance || 0),
      gross_household_income: Number(context.currentGrossIncome || 0),
      monthly_fixed_costs: Number(context.fixedCosts || 0) + Number(context.debtPayments || 0) + Number(context.carFinance || 0) + Number(context.studentLoans || 0),
      monthly_childcare: Number(context.currentChildcare || 0),
      interest_rate: itemType === "house" ? Number(mortgageProducts[0]?.rate || 4.75) : 9.9,
      stress_rate: itemType === "house" ? Number(mortgageBreakdown ? Math.max(6.5, Number(mortgageProducts[0]?.rate || 4.75) + 1.5) : 6.5) : 12.9,
      term_years: itemType === "house" ? Number(mortgageInput.termYears || 30) : 4,
      arrangement_and_moving_costs: itemType === "house" ? 3500 : 0,
      notes: [
        `Original query: ${query}`,
        `Affordability score: ${score}/100`,
        itemType === "house" && mortgageBreakdown ? `Loan required: ${money(mortgageBreakdown.loanRequired)} at ${mortgageBreakdown.ltv.toFixed(1)}% LTV.` : `Estimated spare buffer after rough monthly impact: ${money(buffer)}/month`,
        itemType === "house" && mortgageBreakdown ? `Current mortgage excluded from score: ${mortgageBreakdown.currentMortgageExcludedFromScore ? "yes" : "no - treated as a retained/background property"}.` : "",
      ].filter(Boolean).join("\n"),
    },
  };
}

function safeJson(text: string) {
  try { return JSON.parse(text); } catch {}
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

function normaliseProducts(products: unknown, fallbackProducts: MortgageProductOption[], breakdown?: MortgageAffordabilityBreakdown | null) {
  if (!Array.isArray(products) || products.length === 0) return fallbackProducts;
  return products.slice(0, 6).map((item: any) => ({
    lender: String(item.lender || "Research option"),
    productName: String(item.productName || item.product_name || "Mortgage product"),
    rate: Number(item.rate || 0) || Number(fallbackProducts[0]?.rate || 4.75),
    rateType: String(item.rateType || item.rate_type || "planning") as MortgageProductOption["rateType"],
    maxLtv: Number(item.maxLtv || item.max_ltv || 95),
    productFee: Number(item.productFee || item.product_fee || 0),
    termYears: Number(item.termYears || item.term_years || fallbackProducts[0]?.termYears || 30),
    monthlyPayment: Number(item.monthlyPayment || item.monthly_payment || 0) || Number(breakdown?.newMortgagePayment || 0),
    stressedPayment: Number(item.stressedPayment || item.stressed_payment || 0) || Number(breakdown?.stressedNewMortgagePayment || 0),
    totalInitialPeriodCost: Number(item.totalInitialPeriodCost || item.total_initial_period_cost || 0) || undefined,
    notes: String(item.notes || "Verify rate, fees, LTV and eligibility before relying on this."),
    sourceName: item.sourceName || item.source_name ? String(item.sourceName || item.source_name) : undefined,
    sourceUrl: item.sourceUrl || item.source_url ? String(item.sourceUrl || item.source_url) : undefined,
    refreshedAt: new Date().toISOString(),
  }));
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const query = String(body.query || "").trim();
  const context = (body.context || {}) as CoachContext;
  if (!query) return NextResponse.json({ error: "Query is required" }, { status: 400 });

  const fallback = fallbackResult(query, context);
  const secret = await getActiveIntegrationSecret(supabase, user.id, "openai");
  if (!secret?.value) return NextResponse.json(fallback);
  const budget = await checkAiRouteAllowed(supabase, user.id, "profile_insight");
  if (!budget.allowed) return NextResponse.json({ ...fallback, note: `${budget.reason} Resets at midnight.` });

  try {
    const prompt = `You are an affordability coach inside a private UK household finance app. Interpret the user's natural-language affordability query and return JSON only matching this shape: {"title":"", "itemType":"house|car|tv|holiday|other", "summary":"", "questions":[""], "assumptions":[""], "score":"0-100", "scoreLabel":"", "mortgageProducts":[{"lender":"","productName":"","rate":0,"rateType":"2yr_fixed|3yr_fixed|5yr_fixed|tracker|planning","maxLtv":0,"productFee":0,"termYears":0,"monthlyPayment":0,"stressedPayment":0,"notes":"","sourceName":"","sourceUrl":""}], "draftScenario":{"label":"", "purchase_price":0, "deposit_cash":0, "current_property_sale_price":0, "current_mortgage_balance":0, "gross_household_income":0, "monthly_fixed_costs":0, "monthly_childcare":0, "interest_rate":0, "stress_rate":0, "term_years":0, "arrangement_and_moving_costs":0, "notes":""}}.
User query: ${JSON.stringify(query)}.
Household context: ${JSON.stringify(context)}.
Fallback maths already calculated by the app: ${JSON.stringify(fallback)}.
Rules: For a house move, do not count the current mortgage payment against affordability unless the user says they are keeping/renting out the current property. Do use equity/current mortgage balance for loan required when supplied. Include Financial Flow fixed costs, childcare, student loan, debt, car costs and dependant count in lender logic. Use current UK mortgage rate/product research if web search is available. Do not give regulated financial advice; make it a representative planning estimate and ask missing questions.`;

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret.value}` },
      body: JSON.stringify({
        model: process.env.OPENAI_RESEARCH_MODEL || "gpt-4.1-mini",
        input: prompt,
        tools: [{ type: "web_search_preview" }],
        text: { format: { type: "json_object" } },
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return NextResponse.json(fallback);
    const text = String(payload.output_text || payload.output?.flatMap?.((item: { content?: { text?: string }[] }) => item.content?.map((content) => content.text) || []).join("\n") || "");
    const parsed = safeJson(text);
    if (!parsed?.draftScenario) return NextResponse.json(fallback);
    const mortgageProducts = normaliseProducts(parsed.mortgageProducts, fallback.mortgageProducts || [], fallback.mortgageBreakdown);
    await recordAiRouteUsage({ supabase, userId: user.id, tierKey: budget.tierKey, routeKey: "profile_insight", provider: "openai", model: process.env.OPENAI_RESEARCH_MODEL || "gpt-4.1-mini" });
    return NextResponse.json({
      ...fallback,
      ...parsed,
      mortgageBreakdown: fallback.mortgageBreakdown,
      lenderChecks: fallback.lenderChecks,
      researchSources: fallback.researchSources,
      mortgageProducts,
      draftScenario: { ...fallback.draftScenario, ...parsed.draftScenario },
    });
  } catch {
    return NextResponse.json(fallback);
  }
}
