import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveHouseholdContext, householdMemberDataOrFilter } from "@/lib/auth/household-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CandidateDeal = {
  id?: string;
  title: string;
  provider?: string | null;
  source?: string | null;
  dealType: string;
  monthlyCost: number;
  upfrontCost: number;
  termMonths: number;
  annualMileage?: number | null;
  aprPercent?: number | null;
  fuelType?: string | null;
  metadata?: Record<string, unknown> | null;
};

function stringOrNull(value: unknown) {
  const text = String(value || "").trim();
  return text || null;
}

function num(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function addDays(days: number) {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

function itemMatches(deal: CandidateDeal, args: { financeType: string; fuelType: string; budget: number; mileage: number }) {
  if (args.financeType === "lease" && deal.dealType !== "lease") return false;
  if (args.financeType === "pcp" && deal.dealType !== "pcp") return false;
  if (args.fuelType !== "any" && deal.fuelType && deal.fuelType !== args.fuelType) return false;
  if (deal.monthlyCost > Math.max(args.budget * 1.35, args.budget + 100)) return false;
  if (deal.annualMileage && deal.annualMileage < args.mileage * 0.75) return false;
  return true;
}

function fallbackDeals(args: { financeType: string; budget: number; deposit: number; termMonths: number; mileage: number; fuelType: string }): CandidateDeal[] {
  const base: CandidateDeal[] = [
    { title: "Family EV crossover lease", provider: "Aggregator feed placeholder", source: "fallback", dealType: "lease", monthlyCost: 344, upfrontCost: 2064, termMonths: 36, annualMileage: 8000, fuelType: "electric", metadata: { boot_space: "family", notes: "Placeholder until aggregator feed is connected." } },
    { title: "Compact SUV PCP", provider: "Aggregator feed placeholder", source: "fallback", dealType: "pcp", monthlyCost: 389, upfrontCost: 1500, termMonths: 48, annualMileage: 8000, aprPercent: 7.9, fuelType: "hybrid", metadata: { notes: "Illustrative shortlist row." } },
    { title: "Estate / large hatch lease", provider: "Aggregator feed placeholder", source: "fallback", dealType: "lease", monthlyCost: 286, upfrontCost: 1716, termMonths: 36, annualMileage: 5000, fuelType: "petrol", metadata: { notes: "Illustrative shortlist row." } },
    { title: "Premium family SUV PCP", provider: "Aggregator feed placeholder", source: "fallback", dealType: "pcp", monthlyCost: 499, upfrontCost: 2500, termMonths: 48, annualMileage: 10000, aprPercent: 8.9, fuelType: "hybrid", metadata: { notes: "Likely needs household review." } },
    { title: "Small EV runaround lease", provider: "Aggregator feed placeholder", source: "fallback", dealType: "lease", monthlyCost: 219, upfrontCost: 1314, termMonths: 24, annualMileage: 5000, fuelType: "electric", metadata: { notes: "Good cost, check family practicality." } },
  ];
  return base
    .filter((deal) => itemMatches(deal, args))
    .map((deal) => ({ ...deal, termMonths: args.termMonths || deal.termMonths, annualMileage: Math.max(deal.annualMileage || 0, args.mileage || 0) }))
    .slice(0, 5);
}

function plannedAmountByType(rows: any[], direction: "income" | "outgoing", types?: string[]) {
  return rows
    .filter((row) => String(row.direction || "outgoing") === direction)
    .filter((row) => !types || types.includes(String(row.item_type || "")))
    .reduce((sum, row) => sum + num(row.amount), 0);
}

function scoreDeal(deal: CandidateDeal, args: { budget: number; deposit: number; termMonths: number; monthlyIncome: number; committedSpend: number; plannedSavings: number; plannedPension: number }) {
  const upfrontMonthly = deal.upfrontCost > 0 && deal.termMonths > 0 ? deal.upfrontCost / deal.termMonths : 0;
  const monthlyAllIn = Math.round((deal.monthlyCost + upfrontMonthly) * 100) / 100;
  const monthlyDelta = monthlyAllIn;
  const leftoverBefore = args.monthlyIncome > 0 ? args.monthlyIncome - args.committedSpend : null;
  const leftoverAfterDeal = leftoverBefore === null ? null : Math.round((leftoverBefore - monthlyDelta) * 100) / 100;
  const budgetScore = args.budget > 0 ? Math.max(0, Math.min(40, 40 - Math.max(0, (monthlyAllIn - args.budget) / Math.max(args.budget, 1)) * 55)) : 22;
  const leftoverScore = leftoverAfterDeal === null ? 22 : leftoverAfterDeal >= 800 ? 32 : leftoverAfterDeal >= 400 ? 24 : leftoverAfterDeal >= 150 ? 14 : 4;
  const savingsImpact = args.plannedSavings > 0 ? Math.max(0, args.plannedSavings - monthlyDelta) : null;
  const savingsScore = savingsImpact === null ? 12 : savingsImpact >= args.plannedSavings * 0.75 ? 18 : savingsImpact >= args.plannedSavings * 0.45 ? 11 : 4;
  const depositScore = args.deposit >= deal.upfrontCost ? 10 : Math.max(0, 10 - ((deal.upfrontCost - args.deposit) / Math.max(deal.upfrontCost, 1)) * 10);
  const total = Math.round(Math.max(1, Math.min(100, budgetScore + leftoverScore + savingsScore + depositScore)));
  const affordabilityBand = total >= 78 ? "strong" : total >= 60 ? "workable" : total >= 42 ? "stretched" : "review";
  const houseAffordabilityNote = monthlyDelta > 0
    ? `Adds about £${monthlyDelta.toFixed(0)}/mo to committed spending. Re-check mortgage/house affordability before committing.`
    : "No monthly movement detected yet; add the true payment before relying on affordability.";
  const pensionNote = args.plannedPension > 0
    ? `Keep pension plans visible: this deal uses roughly £${monthlyDelta.toFixed(0)}/mo that could otherwise support savings or pension headroom.`
    : "No active pension plan was found in Financial Flow, so this only checks cash affordability.";

  return {
    score: total,
    affordabilityBand,
    summary: `${deal.provider || "Deal source"} · all-in monthly equivalent around £${monthlyAllIn.toFixed(0)} including upfront spread over term.`,
    impact: { monthlyDelta, leftoverAfterDeal, savingsImpact, houseAffordabilityNote, pensionNote },
  };
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  try {
    const body = await request.json();
    const query = stringOrNull(body.query) || "Looking for a new car";
    const workflowType = stringOrNull(body.workflow_type) || "vehicle_purchase";
    const ownerPersonId = stringOrNull(body.owner_person_id);
    const financeType = stringOrNull(body.finance_type) || "lease_or_pcp";
    const fuelType = stringOrNull(body.fuel_type) || "any";
    const monthlyBudget = num(body.monthly_budget, 400);
    const deposit = num(body.deposit, 0);
    const termMonths = Math.max(12, num(body.term_months, 36));
    const annualMileage = Math.max(1000, num(body.annual_mileage, 8000));
    const notes = stringOrNull(body.notes);

    const householdContext = await getActiveHouseholdContext(supabase, user);
    const householdId = householdContext.householdId || null;
    const visibilityScope = householdId ? "household" : "private";
    const dataFilter = householdMemberDataOrFilter(householdContext);

    const { data: plannedRows } = await supabase
      .from("planned_items")
      .select("id,direction,item_type,label,amount,person_id,category_id")
      .or(dataFilter)
      .limit(500);
    const planned = plannedRows || [];
    const monthlyIncome = plannedAmountByType(planned, "income");
    const committedSpend = plannedAmountByType(planned, "outgoing");
    const plannedSavings = plannedAmountByType(planned, "outgoing", ["saving_investment"]);
    const plannedPension = plannedAmountByType(planned, "outgoing", ["saving_investment"]);

    const preferences = {
      query,
      finance_type: financeType,
      monthly_budget: monthlyBudget,
      deposit,
      term_months: termMonths,
      annual_mileage: annualMileage,
      fuel_type: fuelType,
      notes,
    };
    const affordabilityBase = { monthlyIncome, committedSpend, plannedSavings, plannedPension };
    const nextCheckAt = addDays(7);

    const { data: workflow, error: workflowError } = await supabase
      .from("loopwatch_discover_workflows")
      .insert({
        user_id: user.id,
        household_id: householdId,
        visibility_scope: visibilityScope,
        owner_person_id: ownerPersonId,
        workflow_type: workflowType,
        query,
        status: "watching",
        cadence_days: 7,
        next_check_at: nextCheckAt,
        preferences_json: preferences,
        affordability_json: affordabilityBase,
      })
      .select("*")
      .single();
    if (workflowError) throw workflowError;

    let sourceMode = "catalogue";
    const { data: catalogueDeals, error: dealError } = await supabase
      .from("loopwatch_discover_deals")
      .select("id,title,provider_name,source_name,deal_type,monthly_cost,upfront_cost,term_months,annual_mileage,apr_percent,fuel_type,metadata,status")
      .eq("workflow_type", workflowType)
      .eq("status", "active")
      .limit(50);
    if (dealError) throw dealError;

    let candidates: CandidateDeal[] = (catalogueDeals || [])
      .map((row: any) => ({
        id: row.id,
        title: row.title,
        provider: row.provider_name,
        source: row.source_name,
        dealType: row.deal_type,
        monthlyCost: num(row.monthly_cost),
        upfrontCost: num(row.upfront_cost),
        termMonths: num(row.term_months, termMonths),
        annualMileage: num(row.annual_mileage, annualMileage),
        aprPercent: row.apr_percent === null ? null : num(row.apr_percent),
        fuelType: row.fuel_type,
        metadata: row.metadata,
      }))
      .filter((deal) => itemMatches(deal, { financeType, fuelType, budget: monthlyBudget, mileage: annualMileage }));

    if (!candidates.length) {
      sourceMode = "fallback";
      candidates = fallbackDeals({ financeType, budget: monthlyBudget, deposit, termMonths, mileage: annualMileage, fuelType });
    }

    const shortlist = candidates
      .map((deal) => {
        const scored = scoreDeal(deal, { budget: monthlyBudget, deposit, termMonths, monthlyIncome, committedSpend, plannedSavings, plannedPension });
        return {
          id: deal.id,
          title: deal.title,
          provider: deal.provider,
          source: deal.source,
          dealType: deal.dealType,
          monthlyCost: deal.monthlyCost,
          upfrontCost: deal.upfrontCost,
          termMonths: deal.termMonths,
          annualMileage: deal.annualMileage,
          aprPercent: deal.aprPercent,
          score: scored.score,
          affordabilityBand: scored.affordabilityBand,
          summary: scored.summary,
          impact: scored.impact,
        };
      })
      .sort((a, b) => b.score - a.score || a.monthlyCost - b.monthlyCost)
      .slice(0, 5);

    if (shortlist.length) {
      await supabase.from("loopwatch_discover_results").insert(shortlist.map((deal) => ({
        user_id: user.id,
        household_id: householdId,
        visibility_scope: visibilityScope,
        workflow_id: workflow.id,
        deal_id: deal.id || null,
        status: "shortlisted",
        score: deal.score,
        title: deal.title,
        summary: deal.summary,
        monthly_cost: deal.monthlyCost,
        upfront_cost: deal.upfrontCost,
        term_months: deal.termMonths,
        impact_json: deal.impact,
        metadata: { source_mode: sourceMode, deal },
      })) as any);
    }

    await supabase.from("loopwatch_items").insert({
      user_id: user.id,
      household_id: householdId,
      visibility_scope: visibilityScope,
      owner_person_id: ownerPersonId,
      item_type: "vehicle_contract",
      provider_name: "LoopWatch Discover",
      product_name: query,
      intake_category: "vehicle",
      routing_status: "suggested",
      routing_summary: "Vehicle deal watch started. Review affordability before committing to a lease or PCP.",
      routing_suggestions_json: [{
        type: "vehicle_watch",
        title: "Vehicle deal watch",
        question: "Keep checking for better car deals against this budget and household affordability?",
        summary: "LoopWatch will periodically refresh matching deals when feeds are connected/imported.",
        confidence: 0.72,
        target: "vehicle",
        action: "run_watch",
        payload: preferences,
      }],
      attach_mode: "discover_workflow",
      source_kind: "discover",
      context_prompt: query,
      user_context: notes,
      review_state: "needs_user_review",
      summary: `Looking for car deals around £${monthlyBudget}/mo. ${shortlist.length} shortlist item${shortlist.length === 1 ? "" : "s"} found.`,
      terms_json: { workflow_id: workflow.id, preferences, affordability_base: affordabilityBase, shortlist },
      status: "needs_review",
      watch_status: shortlist.length ? "opportunities" : "review",
      watch_summary: shortlist.length ? `${shortlist.length} deal candidates shortlisted.` : "No matching candidates yet; keep this workflow watching.",
      next_price_check_at: nextCheckAt,
      price_check_cadence_days: 7,
    } as any);

    await supabase.from("loopwatch_discover_workflows").update({
      last_checked_at: new Date().toISOString(),
      status: shortlist.length ? "watching" : "needs_feed",
      results_count: shortlist.length,
      best_score: shortlist[0]?.score || null,
      impact_json: { shortlist: shortlist.slice(0, 3), source_mode: sourceMode },
      updated_at: new Date().toISOString(),
    }).eq("id", workflow.id);

    return NextResponse.json({
      ok: true,
      workflow,
      shortlist,
      source_mode: sourceMode,
      summary: shortlist.length
        ? `LoopWatch created a vehicle workflow and shortlisted ${shortlist.length} deal${shortlist.length === 1 ? "" : "s"}. It will check again every 7 days.`
        : "LoopWatch created the workflow, but no matching deals are available yet.",
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: String(error?.message || error || "LoopWatch Discover failed."), hint: "Run the v28.67 LoopWatch Discover migration before using this feature." },
      { status: 400 },
    );
  }
}
