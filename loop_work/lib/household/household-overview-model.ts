import { buildHomeUsageGuidance, buildHouseholdPlanningGuidance, type HouseholdGuidanceSummary, type HouseholdHomeCandidate, type HouseholdHomeUsageGuidance, type HouseholdLivingProfile, type HouseholdPlanningGuidanceRow } from "./household-guidance";
export type HouseholdOverviewPerson = {
  id: string;
  name: string;
  relationship: string | null;
  avatar_url?: string | null;
  birth_date?: string | null;
  linked_user_id?: string | null;
  income_visible_to_household?: boolean | null;
  costs_visible_to_household?: boolean | null;
};

export type HouseholdPayEvent = {
  id: string;
  person_id: string | null;
  label?: string | null;
  pay_kind?: string | null;
  monthly_take_home_override?: number | null;
  gross_annual_salary?: number | null;
  effective_from?: string | null;
  effective_until?: string | null;
};

export type HouseholdIncomeEntry = {
  id: string;
  person_id?: string | null;
  label?: string | null;
  gross_amount?: number | null;
  net_amount?: number | null;
  frequency?: string | null;
  entry_date?: string | null;
};

export type HouseholdPlannedItem = {
  id: string;
  person_id?: string | null;
  category_id?: string | null;
  direction?: string | null;
  label?: string | null;
  amount?: number | null;
  recurrence?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  item_type?: string | null;
  notes?: string | null;
};

export type HouseholdSpendingEntry = {
  id: string;
  person_id?: string | null;
  category_id?: string | null;
  label?: string | null;
  amount?: number | null;
  spent_at?: string | null;
  notes?: string | null;
};

export type HouseholdCategory = {
  id: string;
  name?: string | null;
  type?: string | null;
  standard_category_key?: string | null;
};

export type HouseholdFinancialAccount = {
  id: string;
  owner_person_id?: string | null;
  person_id?: string | null;
  ownership_scope?: string | null;
  name?: string | null;
  provider?: string | null;
  account_type?: string | null;
  current_balance?: number | null;
  is_liability?: boolean | null;
  monthly_top_up_amount?: number | null;
};

export type HouseholdPensionAccount = {
  id: string;
  person_id?: string | null;
  label?: string | null;
  provider?: string | null;
  fixed_monthly_contribution?: number | null;
};

export type HouseholdSavingsPot = {
  id: string;
  person_id?: string | null;
  name: string;
  target_amount?: number | null;
  target_date?: string | null;
  monthly_target?: number | null;
  current_allocated_amount?: number | null;
  status?: string | null;
  visibility_scope?: string | null;
  icon?: string | null;
  colour?: string | null;
};

export type HouseholdVehicle = { id: string; name: string; fuel_type?: string | null; annual_miles?: number | null; mpg?: number | null };
export type HouseholdCarbonProfile = { food_assumption_adopted?: boolean | null; annual_offset_kg?: number | null };

export type HouseholdOverviewBreakdown = {
  key: string;
  label: string;
  amount: number;
  percent: number;
  helper?: string;
  personId?: string | null;
};

export type HouseholdPotSummary = {
  id: string;
  label: string;
  amount: number;
  target: number;
  percent: number;
  monthlyTarget: number;
  targetDate?: string | null;
  ownerPersonId?: string | null;
  status: string;
  icon?: string | null;
};

export type HouseholdOverviewModel = {
  monthKey: string;
  peopleCount: number;
  adultsCount: number;
  childrenCount: number;
  monthlyIncome: number;
  monthlyOutgoings: number;
  savingsAndInvestments: number;
  leftover: number;
  averageCostPerHead: number;
  savingsRate: number;
  costToIncomeRatio: number;
  optimisationScore: number;
  annualCarbonKg: number;
  monthlyCarbonKg: number;
  carbonConfidence: "low" | "medium" | "high";
  incomeBreakdown: HouseholdOverviewBreakdown[];
  outgoingBreakdown: HouseholdOverviewBreakdown[];
  savingsBreakdown: HouseholdOverviewBreakdown[];
  carbonBreakdown: HouseholdOverviewBreakdown[];
  kidsPots: HouseholdPotSummary[];
  allPots: HouseholdPotSummary[];
  nextActions: Array<{ key: string; title: string; body: string; tone: "green" | "orange" | "blue" | "slate" }>;
  variableSpendGuidance: HouseholdPlanningGuidanceRow[];
  homeUsageGuidance: HouseholdHomeUsageGuidance;
  guidanceSummary: HouseholdGuidanceSummary;
};

function n(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function pct(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((value / total) * 100)));
}

function monthBounds(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const last = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  return { start, end };
}

function isActiveInMonth(start?: string | null, end?: string | null, rangeStart?: string, rangeEnd?: string) {
  const starts = start || "1900-01-01";
  const ends = end || "9999-12-31";
  return starts <= String(rangeEnd) && ends >= String(rangeStart);
}

function isInMonth(value?: string | null, monthKey?: string) {
  if (!value) return true;
  return String(value).slice(0, 7) === monthKey;
}

function monthlyise(value: number, frequency?: string | null) {
  const freq = String(frequency || "monthly").toLowerCase();
  if (freq === "annual" || freq === "yearly") return value / 12;
  if (freq === "weekly") return (value * 52) / 12;
  if (freq === "fortnightly") return (value * 26) / 12;
  return value;
}

function categoryKey(label?: string | null, category?: HouseholdCategory | null, itemType?: string | null) {
  const standard = String(category?.standard_category_key || "").toLowerCase();
  const combined = `${label || ""} ${itemType || ""}`.toLowerCase();
  if (standard === "travel" && /lease|pcp|hp|finance|vehicle|car payment|\bvw\b|volkswagen|ford|tesla|bmw|audi|mercedes|toyota|nissan|kia|hyundai/.test(combined)) return "car_finance";
  if (standard) return standard;
  const text = `${label || ""} ${category?.name || ""} ${category?.type || ""}`.toLowerCase();
  if (/mortgage|rent|house|home|property/.test(text)) return "house";
  if (/council|energy|electric|gas|water|broadband|phone|bill/.test(text)) return "bills";
  if (/insurance|cover|policy/.test(text)) return "insurance";
  if (/tesco|aldi|sainsbury|asda|morrisons|food|grocery|supermarket/.test(text)) return "food";
  if (/car|fuel|train|bus|uber|taxi|parking|travel|flight/.test(text)) return "travel";
  if (/child|nursery|school|wraparound|club|activity/.test(text)) return "childcare";
  if (/netflix|spotify|prime|subscription|streaming|icloud|sub/.test(text)) return "subscriptions";
  if (/lottery|fun|leisure|entertainment|hobby/.test(text)) return "fun";
  if (/gym|health|dental|doctor|pharmacy|medical/.test(text)) return "health";
  if (/loan|debt|credit card|student/.test(text)) return "debt";
  if (/saving|isa|top.?up|cash/.test(text)) return "savings";
  if (/investment|shares|stock|etf|trading/.test(text)) return "investments";
  if (/pension|retirement/.test(text)) return "pension";
  return category?.name || label || "Other";
}

function categoryLabel(key: string) {
  const labels: Record<string, string> = {
    house: "House",
    bills: "Bills",
    insurance: "Insurance",
    food: "Food shopping",
    travel: "Travel",
    car_finance: "Car finance / lease",
    childcare: "Childcare",
    subscriptions: "Subscriptions",
    fun: "Fun",
    health: "Health",
    debt: "Debt",
    savings: "Savings",
    investments: "Investments",
    pension: "Pension",
  };
  return labels[key] || key.replace(/[-_]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

const CARBON_KG_PER_POUND: Record<string, number> = {
  house: 0.15,
  bills: 0.42,
  insurance: 0.04,
  food: 0.62,
  travel: 0.88,
  car_finance: 0,
  childcare: 0.12,
  subscriptions: 0.03,
  fun: 0.18,
  health: 0.08,
  debt: 0,
  savings: 0,
  investments: 0.02,
  pension: 0.02,
  Other: 0.12,
};

function pushGrouped(map: Map<string, HouseholdOverviewBreakdown>, key: string, label: string, amount: number, helper?: string, personId?: string | null) {
  if (!amount) return;
  const existing = map.get(key) || { key, label, amount: 0, percent: 0, helper, personId };
  existing.amount += amount;
  map.set(key, existing);
}

function buildBreakdowns(map: Map<string, HouseholdOverviewBreakdown>, total: number) {
  return Array.from(map.values())
    .map((row) => ({ ...row, percent: pct(row.amount, total) }))
    .sort((a, b) => b.amount - a.amount);
}

function isLinkedSavingsTransfer(item: HouseholdPlannedItem) {
  const notes = String(item.notes || "");
  const itemType = String(item.item_type || "").toLowerCase();
  return itemType === "saving_investment" && notes.includes("[linked_savings_account:");
}

export function buildHouseholdOverviewModel(input: {
  monthKey: string;
  people: HouseholdOverviewPerson[];
  payEvents: HouseholdPayEvent[];
  incomeEntries: HouseholdIncomeEntry[];
  plannedItems: HouseholdPlannedItem[];
  spendingEntries: HouseholdSpendingEntry[];
  categories: HouseholdCategory[];
  financialAccounts: HouseholdFinancialAccount[];
  pensionAccounts: HouseholdPensionAccount[];
  savingsPots: HouseholdSavingsPot[];
  homes?: HouseholdHomeCandidate[];
  livingProfiles?: HouseholdLivingProfile[];
  vehicles?: HouseholdVehicle[];
  carbonProfile?: HouseholdCarbonProfile | null;
}): HouseholdOverviewModel {
  const people = input.people || [];
  const { start, end } = monthBounds(input.monthKey);
  const categoriesById = new Map(input.categories.map((category) => [category.id, category]));
  const incomeMap = new Map<string, HouseholdOverviewBreakdown>();
  const outgoingMap = new Map<string, HouseholdOverviewBreakdown>();
  const savingsMap = new Map<string, HouseholdOverviewBreakdown>();

  for (const event of input.payEvents.filter((row) => isActiveInMonth(row.effective_from, row.effective_until, start, end))) {
    const amount = n(event.monthly_take_home_override) || (n(event.gross_annual_salary) / 12) * 0.68;
    pushGrouped(incomeMap, `person:${event.person_id || "household"}`, event.label || "Salary", amount, "Pay event", event.person_id);
  }

  for (const entry of input.incomeEntries.filter((row) => isInMonth(row.entry_date, input.monthKey))) {
    const amount = monthlyise(n(entry.net_amount ?? entry.gross_amount), entry.frequency);
    pushGrouped(incomeMap, `income:${entry.id}`, entry.label || "Income", amount, "Logged income", entry.person_id);
  }

  for (const item of input.plannedItems.filter((row) => row.direction === "income" && isActiveInMonth(row.start_date, row.end_date, start, end))) {
    pushGrouped(incomeMap, `planned-income:${item.id}`, item.label || "Planned income", monthlyise(n(item.amount), item.recurrence), "Planned income", item.person_id);
  }

  for (const item of input.plannedItems.filter((row) => row.direction !== "income" && !isLinkedSavingsTransfer(row) && isActiveInMonth(row.start_date, row.end_date, start, end))) {
    const category = categoriesById.get(String(item.category_id || ""));
    const key = categoryKey(item.label, category, item.item_type);
    const amount = monthlyise(n(item.amount), item.recurrence);
    const targetMap = ["savings", "investments", "pension"].includes(key) ? savingsMap : outgoingMap;
    pushGrouped(targetMap, key, categoryLabel(key), amount, item.label || "Planned item", item.person_id);
  }

  for (const entry of input.spendingEntries.filter((row) => isInMonth(row.spent_at, input.monthKey))) {
    const category = categoriesById.get(String(entry.category_id || ""));
    const key = categoryKey(entry.label || entry.notes, category);
    const targetMap = ["savings", "investments", "pension"].includes(key) ? savingsMap : outgoingMap;
    pushGrouped(targetMap, key, categoryLabel(key), n(entry.amount), entry.label || "Logged spend", entry.person_id);
  }

  for (const account of input.financialAccounts.filter((row) => !row.is_liability && n(row.monthly_top_up_amount) > 0)) {
    const type = String(account.account_type || "").toLowerCase();
    const key = type.includes("invest") || type.includes("share") || type.includes("gia") || type.includes("isa stocks") ? "investments" : "savings";
    pushGrouped(savingsMap, key, categoryLabel(key), n(account.monthly_top_up_amount), account.name || account.provider || "Account top-up", account.owner_person_id || account.person_id);
  }

  for (const pension of input.pensionAccounts.filter((row) => n(row.fixed_monthly_contribution) > 0)) {
    pushGrouped(savingsMap, "pension", "Pension", n(pension.fixed_monthly_contribution), pension.label || pension.provider || "Pension contribution", pension.person_id);
  }

  const incomeBreakdown = buildBreakdowns(incomeMap, Array.from(incomeMap.values()).reduce((sum, row) => sum + row.amount, 0));
  const monthlyIncome = incomeBreakdown.reduce((sum, row) => sum + row.amount, 0);
  const outgoingBreakdown = buildBreakdowns(outgoingMap, monthlyIncome);
  const savingsBreakdown = buildBreakdowns(savingsMap, monthlyIncome);
  const monthlyOutgoings = outgoingBreakdown.reduce((sum, row) => sum + row.amount, 0);
  const savingsAndInvestments = savingsBreakdown.reduce((sum, row) => sum + row.amount, 0);
  const leftover = monthlyIncome - monthlyOutgoings - savingsAndInvestments;
  const adultsCount = people.filter((person) => String(person.relationship || "").toLowerCase() !== "child").length;
  const childrenCount = people.length - adultsCount;
  const averageCostPerHead = people.length > 0 ? monthlyOutgoings / people.length : monthlyOutgoings;
  const savingsRate = pct(savingsAndInvestments, monthlyIncome);
  const costToIncomeRatio = pct(monthlyOutgoings, monthlyIncome);

  const carbonMap = new Map<string, HouseholdOverviewBreakdown>();
  for (const row of outgoingBreakdown) {
    const factor = CARBON_KG_PER_POUND[row.key] ?? CARBON_KG_PER_POUND.Other;
    pushGrouped(carbonMap, row.key, row.label, row.amount * factor * 12, factor > 0 ? `£${Math.round(row.amount).toLocaleString()} monthly spend × heuristic factor` : "Finance cost excluded from carbon; add mileage and fuel instead");
  }
  for (const vehicle of input.vehicles || []) {
    const miles = n(vehicle.annual_miles);
    if (!miles) continue;
    const fuel = String(vehicle.fuel_type || "petrol").toLowerCase();
    let emissions = 0;
    if (fuel === "electric") emissions = miles * 0.3 * 0.177;
    else {
      const litres = (miles / Math.max(1, n(vehicle.mpg) || 36)) * 4.54609;
      emissions = litres * (fuel === "diesel" ? 2.69 : fuel === "hybrid" || fuel === "phev" ? 1.55 : 2.31);
    }
    pushGrouped(carbonMap, `vehicle:${vehicle.id}`, vehicle.name, emissions, `${Math.round(miles).toLocaleString()} miles/year · ${fuel}`);
  }
  const grossCarbonKg = Array.from(carbonMap.values()).reduce((sum, row) => sum + row.amount, 0);
  const annualCarbonKg = Math.max(0, grossCarbonKg - n(input.carbonProfile?.annual_offset_kg));
  const carbonBreakdown = buildBreakdowns(carbonMap, grossCarbonKg);

  const pots = input.savingsPots
    .filter((pot) => String(pot.status || "active") !== "archived")
    .map((pot) => {
      const amount = n(pot.current_allocated_amount);
      const target = n(pot.target_amount);
      return {
        id: pot.id,
        label: pot.name,
        amount,
        target,
        percent: target > 0 ? pct(amount, target) : 0,
        monthlyTarget: n(pot.monthly_target),
        targetDate: pot.target_date,
        ownerPersonId: pot.person_id,
        status: pot.status || "active",
        icon: pot.icon,
      };
    })
    .sort((a, b) => (a.percent - b.percent) || (b.target - a.target));
  const childIds = new Set(people.filter((person) => String(person.relationship || "").toLowerCase() === "child").map((person) => person.id));
  const kidsPots = pots.filter((pot) => pot.ownerPersonId && childIds.has(pot.ownerPersonId));

  const scoreParts = [
    Math.min(35, savingsRate * 1.4),
    Math.max(0, 30 - Math.max(0, costToIncomeRatio - 50) * 0.8),
    monthlyIncome > 0 && leftover >= 0 ? 15 : 4,
    pots.length ? 10 : 3,
    outgoingBreakdown.length >= 3 ? 10 : 4,
  ];
  const optimisationScore = Math.max(0, Math.min(100, Math.round(scoreParts.reduce((sum, value) => sum + value, 0))));
  const homeUsageGuidance = buildHomeUsageGuidance({
    peopleCount: people.length || 1,
    livingProfiles: input.livingProfiles || [],
    homes: input.homes || [],
  });
  const { rows: variableSpendGuidance, summary: guidanceSummary } = buildHouseholdPlanningGuidance({
    people,
    monthlyIncome,
    outgoingBreakdown,
    savingsRate,
    homeUsageGuidance,
    foodAssumptionAdopted: Boolean(input.carbonProfile?.food_assumption_adopted),
  });
  const nextActions: HouseholdOverviewModel["nextActions"] = [];
  if (monthlyIncome <= 0) nextActions.push({ key: "income", title: "Add household income", body: "Income is the anchor for affordability, savings rate and average cost-per-head calculations.", tone: "blue" });
  if (savingsRate < 20) nextActions.push({ key: "savings-rate", title: "Build the savings rate", body: `Current visible savings rate is ${savingsRate}%. LOOP can suggest which pots or accounts should receive spare cash first.`, tone: "orange" });
  if (!pots.length) nextActions.push({ key: "pots", title: "Create goal pots", body: "Add holiday, emergency, school or car pots so the household can see whether it is saving enough for specific goals.", tone: "green" });
  const highGuidance = variableSpendGuidance.find((row) => row.status === "above");
  if (highGuidance) nextActions.push({ key: `guidance-${highGuidance.key}`, title: `Review ${highGuidance.label.toLowerCase()}`, body: `${highGuidance.label} is above LOOP's planning band for this household. Open spending detail to see the lines behind it.`, tone: "orange" });
  if (homeUsageGuidance.confidence === "low") nextActions.push({ key: "home-profile", title: "Add home details", body: "Tell LOOP whether this is a flat, terrace, semi or detached home, plus bedrooms and heating type, to improve energy and water expectations.", tone: "blue" });
  if (annualCarbonKg > 0) nextActions.push({ key: "carbon", title: "Improve the carbon estimate", body: "Connect energy, travel and food detail later to replace the first-pass spending-based footprint estimate.", tone: "slate" });
  if (nextActions.length === 0) nextActions.push({ key: "optimised", title: "Household is well structured", body: "Income, costs and pots are connected. Next step is deeper optimisation across providers, bills and savings goals.", tone: "green" });

  return {
    monthKey: input.monthKey,
    peopleCount: people.length,
    adultsCount,
    childrenCount,
    monthlyIncome,
    monthlyOutgoings,
    savingsAndInvestments,
    leftover,
    averageCostPerHead,
    savingsRate,
    costToIncomeRatio,
    optimisationScore,
    annualCarbonKg,
    monthlyCarbonKg: annualCarbonKg / 12,
    carbonConfidence: (input.vehicles || []).some((vehicle) => n(vehicle.annual_miles) > 0) ? "high" : outgoingBreakdown.length >= 6 ? "medium" : "low",
    incomeBreakdown,
    outgoingBreakdown,
    savingsBreakdown,
    carbonBreakdown,
    kidsPots,
    allPots: pots,
    nextActions: nextActions.slice(0, 4),
    variableSpendGuidance,
    homeUsageGuidance,
    guidanceSummary,
  };
}
