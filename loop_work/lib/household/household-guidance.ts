import type { HouseholdOverviewBreakdown, HouseholdOverviewPerson } from "./household-overview-model";

export type HouseholdHomeCandidate = {
  id?: string | null;
  label?: string | null;
  full_address?: string | null;
  postcode?: string | null;
  property_type?: string | null;
  ownership_status?: string | null;
};

export type HouseholdLivingProfile = {
  id?: string | null;
  household_id?: string | null;
  home_id?: string | null;
  property_kind?: string | null;
  property_style?: string | null;
  tenure?: string | null;
  bedrooms?: number | null;
  occupants_override?: number | null;
  heating_type?: string | null;
  epc_rating?: string | null;
  source?: string | null;
};

export type HouseholdPlanningGuidanceRow = {
  key: string;
  label: string;
  actual: number;
  benchmarkLow: number;
  benchmarkTypical: number;
  benchmarkHigh: number;
  percentOfIncome: number;
  status: "no_data" | "below" | "inside" | "above";
  helper: string;
  assumptions: string[];
  assumptionAdopted?: boolean;
};

export type HouseholdUtilityGuidanceRow = {
  key: "electricity" | "gas" | "water";
  label: string;
  expectedAnnualUsage: number;
  usageUnit: string;
  estimatedMonthlyCost: number;
  helper: string;
};

export type HouseholdHomeUsageGuidance = {
  propertyKind: string;
  propertyStyle: string;
  tenure: string;
  bedrooms: number;
  occupants: number;
  heatingType: string;
  confidence: "low" | "medium" | "high";
  source: string;
  rows: HouseholdUtilityGuidanceRow[];
  totalEstimatedMonthlyCost: number;
  assumptions: string[];
  assumptionAdopted?: boolean;
};

export type HouseholdGuidanceSummary = {
  headline: string;
  body: string;
  nextSteps: string[];
};

const STYLE_LABELS: Record<string, string> = {
  flat: "Flat / apartment",
  terrace: "Terraced house",
  semi_detached: "Semi-detached house",
  detached: "Detached house",
  bungalow: "Bungalow",
  house: "House",
  unknown: "Unknown property type",
};

function n(value: unknown) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function pct(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((value / total) * 100)));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function roundMoney(value: number) {
  return Math.round(value / 5) * 5;
}

function normalisePropertyStyle(raw?: string | null) {
  const text = String(raw || "").toLowerCase();
  if (/flat|apartment|maisonette/.test(text)) return "flat";
  if (/semi/.test(text)) return "semi_detached";
  if (/detached/.test(text)) return "detached";
  if (/terrace|terraced|townhouse/.test(text)) return "terrace";
  if (/bungalow/.test(text)) return "bungalow";
  if (/house|home/.test(text)) return "house";
  return "unknown";
}

function normaliseHeatingType(raw?: string | null) {
  const text = String(raw || "").toLowerCase();
  if (/electric|storage/.test(text)) return "electric";
  if (/heat pump|air source|ground source/.test(text)) return "heat_pump";
  if (/oil/.test(text)) return "oil";
  if (/none|no gas/.test(text)) return "electric";
  return "gas";
}

function actualFor(rows: HouseholdOverviewBreakdown[], keys: string[]) {
  const keySet = new Set(keys);
  return rows.filter((row) => keySet.has(String(row.key))).reduce((sum, row) => sum + row.amount, 0);
}

function guidanceStatus(actual: number, low: number, high: number): HouseholdPlanningGuidanceRow["status"] {
  if (actual <= 0) return "no_data";
  if (actual < low) return "below";
  if (actual > high) return "above";
  return "inside";
}

function makeGuidanceRow(input: {
  key: string;
  label: string;
  actual: number;
  typical: number;
  lowFactor?: number;
  highFactor?: number;
  income: number;
  helper: string;
  assumptions: string[];
  assumptionAdopted?: boolean;
}): HouseholdPlanningGuidanceRow {
  const low = roundMoney(input.typical * (input.lowFactor ?? 0.75));
  const typical = roundMoney(input.typical);
  const high = roundMoney(input.typical * (input.highFactor ?? 1.25));
  return {
    key: input.key,
    label: input.label,
    actual: input.actual,
    benchmarkLow: low,
    benchmarkTypical: typical,
    benchmarkHigh: high,
    percentOfIncome: pct(input.actual, input.income),
    status: guidanceStatus(input.actual, low, high),
    helper: input.helper,
    assumptions: input.assumptions,
    assumptionAdopted: input.assumptionAdopted,
  };
}

export function buildHomeUsageGuidance(input: {
  peopleCount: number;
  livingProfiles?: HouseholdLivingProfile[];
  homes?: HouseholdHomeCandidate[];
}): HouseholdHomeUsageGuidance {
  const firstProfile = (input.livingProfiles || [])[0];
  const firstHome = (input.homes || [])[0];
  const occupants = Math.max(1, Math.round(n(firstProfile?.occupants_override) || input.peopleCount || 1));
  const propertyStyle = normalisePropertyStyle(firstProfile?.property_style || firstProfile?.property_kind || firstHome?.property_type);
  const propertyKind = firstProfile?.property_kind || (propertyStyle === "flat" ? "flat" : "house");
  const tenure = firstProfile?.tenure || firstHome?.ownership_status || "unknown";
  const bedrooms = Math.max(1, Math.round(n(firstProfile?.bedrooms) || (propertyStyle === "flat" ? 2 : occupants >= 4 ? 3 : 2)));
  const heatingType = normaliseHeatingType(firstProfile?.heating_type);

  const styleBase: Record<string, { electricity: number; gas: number }> = {
    flat: { electricity: 1850, gas: 6200 },
    terrace: { electricity: 2600, gas: 9200 },
    semi_detached: { electricity: 3100, gas: 11500 },
    detached: { electricity: 3900, gas: 15800 },
    bungalow: { electricity: 3000, gas: 10600 },
    house: { electricity: 3000, gas: 10800 },
    unknown: { electricity: 2900, gas: 10300 },
  };
  const base = styleBase[propertyStyle] || styleBase.unknown;
  const occupantAdjustment = Math.max(0, occupants - 2);
  const bedroomAdjustment = Math.max(0, bedrooms - 2);
  let electricityKwh = base.electricity + occupantAdjustment * 380 + bedroomAdjustment * 180;
  let gasKwh = base.gas + occupantAdjustment * 850 + bedroomAdjustment * 900;

  if (heatingType === "electric") {
    electricityKwh += gasKwh * 0.42;
    gasKwh = 0;
  }
  if (heatingType === "heat_pump") {
    electricityKwh += gasKwh * 0.22;
    gasKwh = 0;
  }

  const annualWaterM3 = clamp((occupants * 145 * 365) / 1000, 35, 320);
  const electricityMonthly = (electricityKwh * 0.26) / 12;
  const gasMonthly = (gasKwh * 0.065) / 12;
  const waterMonthly = (annualWaterM3 * 4.1) / 12;

  const rows: HouseholdUtilityGuidanceRow[] = [
    {
      key: "electricity",
      label: "Electricity",
      expectedAnnualUsage: Math.round(electricityKwh),
      usageUnit: "kWh/year",
      estimatedMonthlyCost: roundMoney(electricityMonthly),
      helper: `${STYLE_LABELS[propertyStyle] || "Home"}, ${occupants} occupant(s), ${bedrooms} bedroom(s)`,
    },
    {
      key: "gas",
      label: heatingType === "electric" || heatingType === "heat_pump" ? "Space heating allowance" : "Gas",
      expectedAnnualUsage: Math.round(gasKwh),
      usageUnit: "kWh/year",
      estimatedMonthlyCost: roundMoney(gasMonthly),
      helper: heatingType === "gas" ? "Assumes mains gas heating/hot water" : `Assumes ${heatingType.replace("_", " ")} heating`,
    },
    {
      key: "water",
      label: "Water",
      expectedAnnualUsage: Math.round(annualWaterM3),
      usageUnit: "m³/year",
      estimatedMonthlyCost: roundMoney(waterMonthly),
      helper: "Uses 145 litres per person per day as a planning assumption",
    },
  ];

  const hasProfile = Boolean(firstProfile?.property_style || firstProfile?.bedrooms || firstProfile?.heating_type);
  const hasHome = Boolean(firstHome?.property_type || firstHome?.ownership_status);

  return {
    propertyKind: String(propertyKind),
    propertyStyle,
    tenure: String(tenure),
    bedrooms,
    occupants,
    heatingType,
    confidence: hasProfile ? "high" : hasHome ? "medium" : "low",
    source: hasProfile ? "Household living profile" : hasHome ? "Linked home/property record" : "Household-size assumption",
    rows,
    totalEstimatedMonthlyCost: rows.reduce((sum, row) => sum + row.estimatedMonthlyCost, 0),
    assumptions: [
      "Planning estimate only — not supplier tariff advice.",
      "Rates are deliberately stored as assumptions so they can later be replaced by live tariffs or provider data.",
      "Property type, bedrooms, heating and occupant count can be overridden from Account → Wealth or the House page.",
    ],
  };
}

export function buildHouseholdPlanningGuidance(input: {
  people: HouseholdOverviewPerson[];
  monthlyIncome: number;
  outgoingBreakdown: HouseholdOverviewBreakdown[];
  savingsRate: number;
  homeUsageGuidance: HouseholdHomeUsageGuidance;
  foodAssumptionAdopted?: boolean;
}): { rows: HouseholdPlanningGuidanceRow[]; summary: HouseholdGuidanceSummary } {
  const adults = input.people.filter((person) => String(person.relationship || "").toLowerCase() !== "child").length || Math.max(1, input.people.length || 1);
  const children = input.people.filter((person) => String(person.relationship || "").toLowerCase() === "child").length;
  const peopleCount = Math.max(1, input.people.length || 1);
  const income = input.monthlyIncome;
  const energyAndWaterTypical = input.homeUsageGuidance.totalEstimatedMonthlyCost;

  const rows = [
    makeGuidanceRow({
      key: "food",
      label: "Food shopping",
      actual: actualFor(input.outgoingBreakdown, ["food"]),
      typical: 220 + adults * 55 + children * 35,
      lowFactor: 0.7,
      highFactor: 1.35,
      income,
      helper: "Useful for weekly supermarket planning and family meal budgeting.",
      assumptions: ["ONS Family Spending FYE 2025 household anchor", `${adults} adult(s), ${children} child(ren); scaled gently rather than per-person multiplication`, "Excludes eating out and alcohol."],
      assumptionAdopted: Boolean(input.foodAssumptionAdopted),
    }),
    makeGuidanceRow({
      key: "energy_water",
      label: "Energy + water",
      actual: actualFor(input.outgoingBreakdown, ["bills"]),
      typical: energyAndWaterTypical,
      lowFactor: 0.8,
      highFactor: 1.35,
      income,
      helper: "Compares household bills with the home usage estimate.",
      assumptions: [`${input.homeUsageGuidance.source}`, `${input.homeUsageGuidance.occupants} occupant(s)`, `${input.homeUsageGuidance.bedrooms} bedroom(s)`],
    }),
    makeGuidanceRow({
      key: "travel",
      label: "Travel / car / fuel",
      actual: actualFor(input.outgoingBreakdown, ["travel"]),
      typical: 120 + adults * 35 + children * 15,
      lowFactor: 0.5,
      highFactor: 1.6,
      income,
      helper: "Useful for checking car, fuel, parking, train and family travel creep.",
      assumptions: ["Travel use only: fuel, public transport, parking and taxis", "Car finance/leases are shown separately", "Vehicle count is never inferred from working adults."],
    }),
    makeGuidanceRow({
      key: "car_finance",
      label: "Car finance / lease",
      actual: actualFor(input.outgoingBreakdown, ["car_finance"]),
      typical: Math.max(250, actualFor(input.outgoingBreakdown, ["car_finance"])),
      lowFactor: 0.5,
      highFactor: 1.5,
      income,
      helper: "A commitment, not travel usage. Add each vehicle to assess affordability, insurance renewal and carbon from mileage.",
      assumptions: ["No generic affordability judgement until vehicle count and agreements are known", "Lease price is not used as a carbon proxy"],
    }),
    makeGuidanceRow({
      key: "household_goods",
      label: "Household goods",
      actual: actualFor(input.outgoingBreakdown, ["house", "insurance"]),
      typical: peopleCount * 35,
      lowFactor: 0.5,
      highFactor: 1.8,
      income,
      helper: "Covers recurring home admin, maintenance allowance and small replacement items.",
      assumptions: [`${peopleCount} household profile(s) × £35`, "Mortgage/rent should stay separate inside House when possible."],
    }),
    makeGuidanceRow({
      key: "subscriptions",
      label: "Subscriptions",
      actual: actualFor(input.outgoingBreakdown, ["subscriptions"]),
      typical: 30 + adults * 15,
      lowFactor: 0.5,
      highFactor: 1.5,
      income,
      helper: "Good place to find quick savings without changing lifestyle much.",
      assumptions: ["Base £30 household allowance", `${adults} adult(s) × £15`],
    }),
    makeGuidanceRow({
      key: "fun",
      label: "Fun / eating out / leisure",
      actual: actualFor(input.outgoingBreakdown, ["fun"]),
      typical: Math.max(80, income * 0.06),
      lowFactor: 0.4,
      highFactor: 1.7,
      income,
      helper: "Keeps family budget realistic without hiding lifestyle spend.",
      assumptions: ["Typical target uses around 6% of visible income", "Can be lowered when chasing a specific savings pot."],
    }),
  ];

  const above = rows.filter((row) => row.status === "above");
  const missing = rows.filter((row) => row.status === "no_data");
  const headline = above.length ? `${above.length} area(s) look high versus planning assumptions` : missing.length ? "Add more spending detail to unlock stronger guidance" : "Household spending sits broadly inside planning bands";
  const nextSteps = [
    above[0] ? `Review ${above[0].label.toLowerCase()} first — actual is above the planning range.` : "Keep categorising spending so guidance gets more personalised.",
    input.savingsRate < 20 ? "Use the gap between actual and guidance to fund savings pots first." : "Savings rate is healthy; use guidance to stop lifestyle creep.",
    input.homeUsageGuidance.confidence === "low" ? "Add home type, bedrooms and heating type to improve energy/water estimates." : "Replace planning rates with supplier/provider data when integrations are available.",
  ];

  return {
    rows,
    summary: {
      headline,
      body: "LOOP uses household size, child profiles, visible income, home type and your actual categories to give a planning band. It is guidance, not a hard budget.",
      nextSteps,
    },
  };
}
