import { householdMemberDataOrFilter, householdWriteFields, type ActiveHouseholdContext } from "@/lib/auth/household-context";
import { createWorkerDatabaseClient } from "@/platform/database/worker-client";

export type LoopWatchRow = {
  id: string;
  user_id: string;
  household_id?: string | null;
  visibility_scope?: string | null;
  owner_person_id?: string | null;
  item_type?: string | null;
  provider_name?: string | null;
  product_name?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  renewal_date?: string | null;
  notice_period_days?: number | null;
  payment_amount?: number | string | null;
  payment_frequency?: string | null;
  annual_cost?: number | string | null;
  auto_renews?: boolean | null;
  cover_level?: string | null;
  excess_total?: number | string | null;
  mileage_limit?: number | null;
  interest_rate_percent?: number | string | null;
  apr_percent?: number | string | null;
  cancellation_summary?: string | null;
  increase_summary?: string | null;
  summary?: string | null;
  terms_json?: Record<string, unknown> | null;
  routing_suggestions_json?: Array<Record<string, unknown>> | null;
  linked_planned_item_id?: string | null;
  next_price_check_at?: string | null;
  price_check_cadence_days?: number | null;
  bill_allocation_mode?: string | null;
  review_state?: string | null;
  status?: string | null;
};

type SupabaseLike = any;

type ProviderRule = {
  id: string;
  provider_slug: string;
  provider_name: string;
  applies_to_item_type: string;
  rule_label: string;
  increase_month: number;
  increase_day: number;
  increase_amount_monthly: number | string | null;
  increase_percent: number | string | null;
  source_url?: string | null;
  source_label?: string | null;
  confidence?: number | null;
};

const TELECOM_TYPES = new Set(["mobile_contract", "broadband_contract"]);
const INSURANCE_TYPES = new Set(["car_insurance", "home_insurance", "life_insurance", "pet_insurance", "travel_insurance"]);
const CONTRACT_TYPES = new Set(["car_finance", "vehicle_contract", "vehicle_service", "utility_contract", "bill_statement", "council_tax_bill", "appointment_letter", "warranty", "school_nursery_contract", "school_calendar", "school_agenda", "tenancy_agreement", "employment_contract", "general_contract"]);

function money(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(/[^0-9.-]+/g, ""));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
}

function roundMoney(value: number | null | undefined) {
  if (!Number.isFinite(Number(value))) return null;
  return Math.round(Number(value) * 100) / 100;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function daysUntil(value?: string | null) {
  if (!value) return null;
  const today = new Date(`${todayIso()}T00:00:00.000Z`).getTime();
  const target = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(target)) return null;
  return Math.round((target - today) / 86400000);
}

function addDays(isoDate: string, days: number) {
  const timestamp = Date.parse(`${isoDate}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp + days * 86400000).toISOString().slice(0, 10);
}

function isoForAnnualDate(month = 4, day = 1) {
  const now = new Date();
  const year = now.getUTCFullYear();
  const candidate = new Date(Date.UTC(year, month - 1, day));
  const today = new Date(Date.UTC(year, now.getUTCMonth(), now.getUTCDate()));
  if (candidate.getTime() < today.getTime()) candidate.setUTCFullYear(year + 1);
  return candidate.toISOString().slice(0, 10);
}

export function normaliseProviderSlug(provider?: string | null) {
  const raw = String(provider || "").toLowerCase();
  const aliases: Array<[RegExp, string]> = [
    [/\bvirgin\s*media\b/, "virgin-media"],
    [/\bvodafone\b/, "vodafone"],
    [/\btalk\s*talk\b/, "talktalk"],
    [/\bthree\b|\b3\b/, "three"],
    [/\bo2\b|\btelefonica\b/, "o2"],
    [/\bee\b/, "ee"],
    [/\bbt\b|\bbritish telecom\b/, "bt"],
    [/\bsky\b/, "sky"],
    [/\bplusnet\b/, "plusnet"],
    [/\btesco\s*mobile\b/, "tesco-mobile"],
    [/\bgiffgaff\b/, "giffgaff"],
  ];
  for (const [regex, slug] of aliases) if (regex.test(raw)) return slug;
  return raw.replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || null;
}

export function monthlyCostFromItem(item: LoopWatchRow) {
  const annual = money(item.annual_cost);
  if (annual && annual > 0) return roundMoney(annual / 12);
  const payment = money(item.payment_amount);
  if (!payment || payment <= 0) return null;
  const frequency = String(item.payment_frequency || "monthly").toLowerCase();
  if (frequency === "annual" || frequency === "yearly") return roundMoney(payment / 12);
  if (frequency === "weekly") return roundMoney((payment * 52) / 12);
  if (frequency === "quarterly") return roundMoney(payment / 3);
  if (frequency === "one_off") return null;
  return roundMoney(payment);
}

function annualFromMonthly(monthly: number | null) {
  return monthly ? roundMoney(monthly * 12) : null;
}

function findMoneyInIncreaseText(text?: string | null) {
  const clean = String(text || "");
  if (!clean) return null;
  const explicit = clean.match(/(?:increase|rise|rises|rising|go up|price change)[^£\d]{0,80}£\s*([0-9]+(?:\.[0-9]{1,2})?)/i)
    || clean.match(/£\s*([0-9]+(?:\.[0-9]{1,2})?)\s*(?:a|per)?\s*(?:month|monthly|pm)/i);
  return money(explicit?.[1] || null);
}

function findPercentInIncreaseText(text?: string | null) {
  const clean = String(text || "");
  if (!clean) return null;
  const match = clean.match(/(?:increase|rise|rises|rising|rpi|cpi|inflation)[^%\d]{0,80}([0-9]+(?:\.[0-9]+)?)\s*%/i);
  return match ? Number(match[1]) : null;
}

function plannedItemTypeFor(itemType?: string | null) {
  if (itemType === "mobile_contract") return "mobile_phone";
  if (itemType === "broadband_contract") return "utilities";
  if (INSURANCE_TYPES.has(String(itemType))) return "insurance";
  if (itemType === "mortgage_offer") return "mortgage_rent";
  if (itemType === "savings_terms") return "saving_investment";
  if (itemType === "school_nursery_contract" || itemType === "school_calendar" || itemType === "school_agenda") return "childcare";
  if (itemType === "utility_contract" || itemType === "bill_statement" || itemType === "council_tax_bill") return "utilities";
  if (itemType === "car_finance" || itemType === "vehicle_contract") return "transport";
  return "monthly_cost";
}

function categoryNameFor(itemType?: string | null) {
  if (itemType === "mobile_contract") return "Mobile phone";
  if (itemType === "broadband_contract") return "Broadband";
  if (INSURANCE_TYPES.has(String(itemType))) return "Insurance";
  if (itemType === "mortgage_offer") return "Mortgage";
  if (itemType === "savings_terms") return "Savings";
  if (itemType === "school_nursery_contract" || itemType === "school_calendar" || itemType === "school_agenda") return "Childcare";
  if (itemType === "council_tax_bill") return "Council tax";
  if (itemType === "utility_contract" || itemType === "bill_statement") return "Utilities";
  if (itemType === "car_finance" || itemType === "vehicle_contract") return "Transport";
  return "Bills";
}

function billLike(itemType?: string | null) {
  const type = String(itemType || "");
  return TELECOM_TYPES.has(type) || INSURANCE_TYPES.has(type) || ["utility_contract", "bill_statement", "council_tax_bill", "car_finance", "vehicle_contract", "school_nursery_contract", "warranty"].includes(type);
}

function normaliseLabel(value: unknown) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function recommendedNextPriceCheck(item: LoopWatchRow, projectionDate?: string | null) {
  const trackedDate = item.renewal_date || item.end_date || projectionDate || null;
  if (trackedDate) {
    const buffer = addDays(trackedDate, -90);
    if (buffer && buffer >= todayIso()) return buffer;
  }
  const cadence = Number(item.price_check_cadence_days || (billLike(item.item_type) ? 90 : 180));
  return addDays(todayIso(), Math.max(14, Math.min(365, cadence)));
}

async function findMatchingPlannedBill(supabase: SupabaseLike, item: LoopWatchRow, ctx: ActiveHouseholdContext, categoryId?: string | null) {
  const amount = monthlyCostFromItem(item);
  const provider = normaliseLabel(item.provider_name);
  const product = normaliseLabel(item.product_name);
  const labelNeedles = [provider, product].filter((value) => value.length >= 3);
  if (!amount && labelNeedles.length === 0) return null;

  const { data: rows } = await supabase
    .from("planned_items")
    .select("id,label,amount,item_type,person_id,category_id,brand_name,notes")
    .or(householdMemberDataOrFilter(ctx))
    .eq("direction", "outgoing")
    .limit(300);

  const candidates = (rows || []).map((row: any) => {
    const haystack = normaliseLabel([row.label, row.brand_name, row.notes].filter(Boolean).join(" "));
    let score = 0;
    if (categoryId && row.category_id === categoryId) score += 2;
    if ((item.owner_person_id || null) === (row.person_id || null)) score += 1;
    for (const needle of labelNeedles) if (needle && haystack.includes(needle)) score += needle === provider ? 5 : 3;
    const rowAmount = money(row.amount);
    if (amount && rowAmount && Math.abs(rowAmount - amount) <= Math.max(3, amount * 0.08)) score += 3;
    return { row, score };
  }).filter((entry: any) => entry.score >= 5).sort((a: any, b: any) => b.score - a.score);

  return candidates[0]?.row || null;
}

function buildOpportunityBase(item: LoopWatchRow, type: string, title: string, summary: string, priority = 50, dueDate?: string | null, metadata: Record<string, unknown> = {}) {
  return {
    user_id: item.user_id,
    household_id: item.household_id || null,
    visibility_scope: item.household_id ? "household" : "private",
    loopwatch_item_id: item.id,
    opportunity_type: type,
    status: "open",
    priority,
    title,
    summary,
    due_date: dueDate || null,
    action_href: "/loopwatch",
    metadata,
    updated_at: new Date().toISOString(),
  };
}

async function upsertOpportunity(supabase: SupabaseLike, payload: Record<string, unknown>) {
  const { error } = await supabase
    .from("loopwatch_opportunities")
    .upsert(payload, { onConflict: "loopwatch_item_id,opportunity_type" });
  if (error && !String(error.message || "").includes("constraint")) throw error;
}

async function findProviderRule(supabase: SupabaseLike, item: LoopWatchRow): Promise<ProviderRule | null> {
  const providerSlug = normaliseProviderSlug(item.provider_name);
  if (!providerSlug || !item.item_type) return null;
  const { data } = await supabase
    .from("loopwatch_provider_rules")
    .select("*")
    .eq("provider_slug", providerSlug)
    .eq("applies_to_item_type", item.item_type)
    .eq("status", "active")
    .order("effective_from", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  return data || null;
}

function costProjection(item: LoopWatchRow, rule: ProviderRule | null) {
  const currentMonthly = monthlyCostFromItem(item);
  let nextIncreaseAmount = findMoneyInIncreaseText(item.increase_summary);
  let increasePercent = findPercentInIncreaseText(item.increase_summary);
  let source = nextIncreaseAmount || increasePercent ? "document_terms" : null;
  let nextIncreaseDate = TELECOM_TYPES.has(String(item.item_type)) ? isoForAnnualDate(4, 1) : null;

  if (rule) {
    nextIncreaseAmount = money(rule.increase_amount_monthly) ?? nextIncreaseAmount;
    increasePercent = money(rule.increase_percent) ?? increasePercent;
    nextIncreaseDate = isoForAnnualDate(Number(rule.increase_month || 4), Number(rule.increase_day || 1));
    source = `provider_rule:${rule.provider_slug}`;
  }

  let projectedMonthly = currentMonthly;
  if (currentMonthly && nextIncreaseAmount) projectedMonthly = roundMoney(currentMonthly + nextIncreaseAmount);
  if (currentMonthly && !nextIncreaseAmount && increasePercent) projectedMonthly = roundMoney(currentMonthly * (1 + increasePercent / 100));

  return {
    currentMonthlyCost: currentMonthly,
    projectedMonthlyCost: projectedMonthly,
    projectedAnnualCost: annualFromMonthly(projectedMonthly),
    nextIncreaseDate,
    nextIncreaseAmount: nextIncreaseAmount ? roundMoney(nextIncreaseAmount) : null,
    increaseSource: source,
  };
}

export async function runLoopWatchForItem(supabase: SupabaseLike, item: LoopWatchRow) {
  const itemType = String(item.item_type || "general_contract");
  const rule = await findProviderRule(supabase, item);
  const projection = costProjection(item, rule);
  const trackedDate = item.renewal_date || item.end_date || null;
  const days = daysUntil(trackedDate);
  const opportunities: string[] = [];

  if (days !== null && days >= 0 && days <= 90) {
    const title = INSURANCE_TYPES.has(itemType)
      ? "Policy renewal window"
      : TELECOM_TYPES.has(itemType)
        ? "Contract renewal window"
        : itemType === "savings_terms"
          ? "Savings account maturity/rate check"
          : "Contract end date approaching";
    await upsertOpportunity(supabase, buildOpportunityBase(
      item,
      "renewal_window",
      title,
      `${item.provider_name || "This provider"} ${item.product_name || "item"} is ${days} days from ${item.renewal_date ? "renewal" : "end date"}. Check whether to renew, cancel, switch or update the household cost forecast.`,
      days <= 30 ? 95 : 75,
      trackedDate,
      { days_until: days, tracked_date: trackedDate, item_type: itemType },
    ));
    opportunities.push("renewal_window");
  }

  if (projection.currentMonthlyCost && item.status !== "archived") {
    await upsertOpportunity(supabase, buildOpportunityBase(
      item,
      "financial_flow_sync",
      "Update household costs",
      `Sync ${item.provider_name || "this contract"} into Financial Flow at £${projection.currentMonthlyCost.toFixed(2)} per month${projection.projectedMonthlyCost && projection.projectedMonthlyCost !== projection.currentMonthlyCost ? `, rising to about £${projection.projectedMonthlyCost.toFixed(2)}` : ""}.`,
      65,
      projection.nextIncreaseDate || trackedDate,
      { current_monthly_cost: projection.currentMonthlyCost, projected_monthly_cost: projection.projectedMonthlyCost },
    ));
    opportunities.push("financial_flow_sync");
  }

  const priceCheckDate = item.next_price_check_at || recommendedNextPriceCheck(item, projection.nextIncreaseDate);
  const priceCheckDays = daysUntil(priceCheckDate);
  if (billLike(itemType) && priceCheckDays !== null && priceCheckDays <= 14) {
    await upsertOpportunity(supabase, buildOpportunityBase(
      item,
      "price_check_due",
      "Check for new prices",
      `${item.provider_name || "This bill"} is due for a price/deal check. Compare against current market prices and update the linked Financial Flow bill if needed.`,
      priceCheckDays <= 0 ? 82 : 64,
      priceCheckDate,
      { next_price_check_at: priceCheckDate, cadence_days: item.price_check_cadence_days || null },
    ));
    opportunities.push("price_check_due");
  }

  if (TELECOM_TYPES.has(itemType)) {
    if (projection.nextIncreaseAmount || projection.projectedMonthlyCost !== projection.currentMonthlyCost) {
      await upsertOpportunity(supabase, buildOpportunityBase(
        item,
        "annual_price_increase",
        "Annual price increase forecast",
        `${item.provider_name || "Provider"} cost can be projected from ${projection.increaseSource || "contract/provider terms"}. Current monthly cost: £${Number(projection.currentMonthlyCost || 0).toFixed(2)}. Projected monthly cost: £${Number(projection.projectedMonthlyCost || projection.currentMonthlyCost || 0).toFixed(2)}.`,
        70,
        projection.nextIncreaseDate,
        { provider_rule_id: rule?.id || null, increase_source: projection.increaseSource, next_increase_amount: projection.nextIncreaseAmount },
      ));
      opportunities.push("annual_price_increase");
    } else if (item.provider_name) {
      await upsertOpportunity(supabase, buildOpportunityBase(
        item,
        "provider_rule_needed",
        "Add provider increase rule",
        `${item.provider_name} is confirmed, but LoopWatch does not yet have an active annual increase rule for this contract type. Add one in Admin so April/March rises can be forecast automatically.`,
        55,
        projection.nextIncreaseDate || trackedDate,
        { provider_slug: normaliseProviderSlug(item.provider_name), item_type: itemType },
      ));
      opportunities.push("provider_rule_needed");
    }
  }

  if (INSURANCE_TYPES.has(itemType)) {
    const flags: string[] = [];
    if (!item.cover_level) flags.push("cover level missing");
    if (money(item.excess_total) && Number(money(item.excess_total)) >= 500) flags.push("high excess");
    if (itemType === "car_insurance" && !item.mileage_limit) flags.push("mileage limit missing");
    if (flags.length > 0) {
      await upsertOpportunity(supabase, buildOpportunityBase(
        item,
        "insurance_cover_review",
        "Insurance cover check",
        `Review ${flags.join(", ")}. LoopWatch can flag possible gaps, but the user should confirm the policy wording before relying on cover.`,
        78,
        trackedDate,
        { flags },
      ));
      opportunities.push("insurance_cover_review");
    }
  }

  if (itemType === "savings_terms" && item.interest_rate_percent) {
    const currentRate = Number(item.interest_rate_percent || 0);
    const { data: betterDeals } = await createWorkerDatabaseClient("rates")
      .from("savings_rate_deals")
      .select("id,provider_name,product_name,rate_aer,rate_gross,source_url")
      .eq("status", "active")
      .gt("rate_aer", currentRate + 0.1)
      .order("rate_aer", { ascending: false })
      .limit(3);
    if ((betterDeals || []).length > 0) {
      const best = betterDeals[0];
      await upsertOpportunity(supabase, buildOpportunityBase(
        item,
        "better_savings_rate",
        "Better savings rate available",
        `${item.provider_name || "Current account"} is around ${currentRate.toFixed(2)}% AER. LOOP has a catalogue deal at about ${Number(best.rate_aer || 0).toFixed(2)}% AER from ${best.provider_name}.`,
        82,
        trackedDate,
        { current_rate: currentRate, matches: betterDeals },
      ));
      opportunities.push("better_savings_rate");
    }
  }

  if (itemType === "mortgage_offer" && (days === null || days <= 270)) {
    await upsertOpportunity(supabase, buildOpportunityBase(
      item,
      "mortgage_watch_candidate",
      "Mortgage watch candidate",
      "This mortgage document has enough date/rate information to be linked into the existing mortgage renewal watch flow. Confirm balance, rate and fixed-end date before comparing deals.",
      80,
      trackedDate,
      { interest_rate_percent: item.interest_rate_percent, apr_percent: item.apr_percent },
    ));
    opportunities.push("mortgage_watch_candidate");
  }

  if (["school_calendar", "school_agenda", "school_nursery_contract"].includes(itemType)) {
    const routingSuggestions = Array.isArray(item.routing_suggestions_json) ? item.routing_suggestions_json : [];
    const hasSchoolImport = routingSuggestions.some((suggestion) => suggestion?.type === "import_school_calendar");
    if (hasSchoolImport) {
      await upsertOpportunity(supabase, buildOpportunityBase(
        item,
        "import_school_calendar",
        "Import school dates",
        "This looks like a school/nursery document with dates. Import the extracted metadata into Family Planning after confirming the child/person.",
        84,
        trackedDate,
        { target: "family_planning" },
      ));
      opportunities.push("import_school_calendar");
    }
  }

  const watchStatus = opportunities.length > 0 ? "opportunities" : "ok";
  const watchSummary = opportunities.length > 0
    ? `${opportunities.length} LoopWatch action${opportunities.length === 1 ? "" : "s"} available.`
    : "No immediate action found. LoopWatch will keep renewal/increase dates available.";

  await supabase.from("loopwatch_items").update({
    current_monthly_cost: projection.currentMonthlyCost,
    projected_monthly_cost: projection.projectedMonthlyCost,
    projected_annual_cost: projection.projectedAnnualCost,
    next_increase_date: projection.nextIncreaseDate,
    next_increase_amount: projection.nextIncreaseAmount,
    increase_source: projection.increaseSource,
    next_price_check_at: item.next_price_check_at || recommendedNextPriceCheck(item, projection.nextIncreaseDate),
    price_check_cadence_days: item.price_check_cadence_days || (billLike(itemType) ? 90 : 180),
    last_watch_checked_at: new Date().toISOString(),
    watch_status: watchStatus,
    watch_summary: watchSummary,
    updated_at: new Date().toISOString(),
  }).eq("id", item.id);

  return { ok: true, watchStatus, watchSummary, opportunities, projection };
}

export async function applyLoopWatchCostToFinancialFlow(supabase: SupabaseLike, item: LoopWatchRow, ctx: ActiveHouseholdContext) {
  const amount = monthlyCostFromItem(item);
  if (!amount || amount <= 0) throw new Error("LoopWatch needs a monthly or annual cost before it can update Financial Flow.");

  const categoryName = categoryNameFor(item.item_type);
  let { data: category } = await supabase
    .from("spending_categories")
    .select("id")
    .or(`user_id.eq.${ctx.userId}${ctx.householdId ? `,and(household_id.eq.${ctx.householdId},visibility_scope.eq.household)` : ""}`)
    .ilike("name", categoryName)
    .limit(1)
    .maybeSingle();

  if (!category?.id) {
    const categoryPayload = {
      ...householdWriteFields(ctx, ctx.userId),
      name: categoryName,
      type: "fixed",
      monthly_budget: amount,
    };
    const created = await supabase.from("spending_categories").insert(categoryPayload as any).select("id").single();
    if (created.error) throw new Error(created.error.message);
    category = created.data;
  }

  const projection = costProjection(item, await findProviderRule(supabase, item));
  const label = [item.provider_name, item.product_name].filter(Boolean).join(" · ") || "LoopWatch cost";
  const payload = {
    ...householdWriteFields(ctx, ctx.userId),
    person_id: item.owner_person_id || null,
    category_id: category.id,
    direction: "outgoing",
    item_type: plannedItemTypeFor(item.item_type),
    label,
    amount,
    recurrence: "monthly",
    start_date: item.start_date || todayIso(),
    end_date: item.end_date || item.renewal_date || null,
    day_of_month: 1,
    end_behavior: item.auto_renews ? "renews" : item.renewal_date ? "review_needed" : "drops_off",
    renewal_notice_days: item.notice_period_days || 30,
    brand_name: item.provider_name || null,
    brand_logo_source: item.provider_name ? "loopwatch" : null,
    notes: [
      "Created/updated from LoopWatch.",
      item.increase_summary ? `Increase terms: ${item.increase_summary}` : null,
      projection.projectedMonthlyCost && projection.projectedMonthlyCost !== amount ? `Projected next monthly cost: £${projection.projectedMonthlyCost.toFixed(2)} from ${projection.nextIncreaseDate || "next increase"}.` : null,
    ].filter(Boolean).join("\n"),
    updated_at: new Date().toISOString(),
  };

  let plannedItemId = item.linked_planned_item_id || null;
  let allocationMode = plannedItemId ? "manual_existing_bill" : "auto_create";
  if (!plannedItemId) {
    const match = await findMatchingPlannedBill(supabase, item, ctx, category.id);
    if (match?.id) {
      plannedItemId = match.id;
      allocationMode = "auto_matched_existing_bill";
    }
  }

  if (plannedItemId) {
    const { error } = await supabase.from("planned_items").update(payload as any).eq("id", plannedItemId);
    if (error) throw new Error(error.message);
  } else {
    const created = await supabase.from("planned_items").insert(payload as any).select("id").single();
    if (created.error) throw new Error(created.error.message);
    plannedItemId = created.data.id;
  }

  await supabase.from("loopwatch_items").update({
    linked_planned_item_id: plannedItemId,
    bill_allocation_mode: allocationMode,
    current_monthly_cost: amount,
    projected_monthly_cost: projection.projectedMonthlyCost,
    projected_annual_cost: projection.projectedAnnualCost,
    next_increase_date: projection.nextIncreaseDate,
    next_increase_amount: projection.nextIncreaseAmount,
    increase_source: projection.increaseSource,
    next_price_check_at: recommendedNextPriceCheck(item, projection.nextIncreaseDate),
    price_check_cadence_days: item.price_check_cadence_days || (billLike(item.item_type) ? 90 : 180),
    watch_status: "opportunities",
    routing_status: "applied_financial_flow",
    review_state: "accepted",
    watch_summary: allocationMode === "auto_matched_existing_bill" ? "Financial Flow cost is linked to an existing bill." : allocationMode === "manual_existing_bill" ? "Financial Flow cost is linked to the selected bill." : "Financial Flow cost is linked.",
    updated_at: new Date().toISOString(),
  }).eq("id", item.id);

  await supabase.from("loopwatch_opportunities").update({ status: "done", updated_at: new Date().toISOString() })
    .eq("loopwatch_item_id", item.id)
    .eq("opportunity_type", "financial_flow_sync");

  return { ok: true, plannedItemId, amount, projectedMonthlyCost: projection.projectedMonthlyCost };
}

export async function runLoopWatchDaily(supabase: SupabaseLike, limit = 100) {
  const { data: items, error } = await supabase
    .from("loopwatch_items")
    .select("*")
    .eq("status", "confirmed")
    .neq("status", "archived")
    .or("last_watch_checked_at.is.null,last_watch_checked_at.lt." + new Date(Date.now() - 22 * 60 * 60 * 1000).toISOString())
    .order("last_watch_checked_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (error) throw new Error(error.message);

  const results = [];
  for (const item of items || []) {
    try {
      results.push({ id: item.id, ...(await runLoopWatchForItem(supabase, item)) });
    } catch (error: any) {
      await supabase.from("loopwatch_items").update({ watch_status: "error", watch_summary: String(error?.message || error), last_watch_checked_at: new Date().toISOString() }).eq("id", item.id);
      results.push({ id: item.id, ok: false, error: String(error?.message || error) });
    }
  }
  return { checked: items?.length || 0, results };
}
