// Planned purchases: what one adds to the household plan, and whether the plan can carry it.
import { carRunningCosts, type CarCosts, type FuelType } from "@/lib/vehicles/running-costs";

export type OneOffCost = { label: string; amount: number; date?: string | null };

export type CarDetails = {
  fuelType?: FuelType | null;
  annualMiles?: number | null;
  mpg?: number | null;
  milesPerKwh?: number | null;
  electricShare?: number | null;
  insuranceMonthly?: number | null;
  listPrice?: number | null;
  taxIncluded?: boolean | null;
  /** Servicing included in a lease maintenance package. */
  serviceIncluded?: boolean | null;
  /** What the car being replaced costs to run each month (fuel + insurance + tax), if known. */
  currentRunningMonthly?: number | null;
  lookup?: {
    matched?: string;
    insuranceGroup?: number | null;
    insuranceAnnualLow?: number | null;
    insuranceAnnualHigh?: number | null;
    wltpMpg?: number | null;
    realWorldMpg?: number | null;
    sources?: string[];
    lookedUpAt?: string;
  } | null;
};

export type Purchase = {
  id?: string;
  kind: "car" | "other";
  name: string;
  status?: "draft" | "planned";
  start_date: string | null;
  monthly_cost: number;
  term_months: number | null;
  upfront_cost: number;
  one_off_costs: OneOffCost[];
  replaces_planned_item_id: string | null;
  car: CarDetails;
  category_id?: string | null;
  person_id?: string | null;
};

export type ReplacedLine = { id: string; label: string; amount: number; start_date: string | null; end_date: string | null };

export const PURCHASE_TAG = (id: string) => `[planned_purchase:${id}]`;

export function addMonths(date: string, months: number) {
  const [y, m, d] = date.split("-").map(Number);
  const base = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
  base.setUTCDate(Math.min(d, last));
  return base.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

const round = (value: number) => Math.round(value * 100) / 100;

export function carCostsFor(purchase: Purchase, electricityPence?: number | null): CarCosts | null {
  if (purchase.kind !== "car") return null;
  const car = purchase.car || {};
  return carRunningCosts({
    fuelType: (car.fuelType || "petrol") as FuelType,
    annualMiles: Number(car.annualMiles || 0),
    mpg: car.mpg ?? null,
    milesPerKwh: car.milesPerKwh ?? null,
    electricShare: car.electricShare ?? null,
    electricityPence: electricityPence ?? null,
    insuranceMonthly: car.insuranceMonthly ?? null,
    insuranceGroup: car.lookup?.insuranceGroup ?? null,
    insuranceTypicalAnnual: car.lookup?.insuranceAnnualLow && car.lookup?.insuranceAnnualHigh ? (car.lookup.insuranceAnnualLow + car.lookup.insuranceAnnualHigh) / 2 : null,
    listPrice: car.listPrice ?? null,
    taxIncluded: Boolean(car.taxIncluded),
    serviceIncluded: Boolean(car.serviceIncluded),
  });
}

/** When the purchase stops costing money each month (last payment), or null if open-ended. */
export function purchaseEnd(purchase: Purchase) {
  if (!purchase.start_date || !purchase.term_months) return null;
  return addMonths(purchase.start_date, purchase.term_months);
}

/** The planned_items rows a purchase becomes once it's added to the plan (household fields added by the caller). */
export function purchaseItems(purchase: Purchase & { id: string }, opts: { carCosts: CarCosts | null; categoryId: string | null }) {
  if (!purchase.start_date) return [];
  const start = purchase.start_date;
  const end = purchaseEnd(purchase);
  const day = Number(start.slice(8, 10));
  const tag = PURCHASE_TAG(purchase.id);
  const monthly = (label: string, amount: number, itemType: string, from: string) => ({
    direction: "outgoing",
    item_type: itemType,
    label: label.slice(0, 120),
    amount: round(amount),
    recurrence: "monthly",
    start_date: from,
    end_date: end,
    day_of_month: Number(from.slice(8, 10)) || day,
    payment_timing: "fixed_day",
    payment_adjustment: "previous_workday",
    end_behavior: "drops_off",
    category_id: opts.categoryId,
    person_id: purchase.person_id || null,
    notes: tag,
  });
  const oneOff = (label: string, amount: number, date: string, itemType = "one_off") => ({
    direction: "outgoing",
    item_type: itemType,
    label: label.slice(0, 120),
    amount: round(amount),
    recurrence: "one_off",
    start_date: date,
    end_date: null,
    day_of_month: null,
    payment_timing: null,
    payment_adjustment: null,
    end_behavior: "drops_off",
    category_id: opts.categoryId,
    person_id: purchase.person_id || null,
    notes: tag,
  });

  const rows: Record<string, unknown>[] = [];
  if (purchase.upfront_cost > 0) rows.push(oneOff(`${purchase.name} · upfront`, purchase.upfront_cost, start));
  if (purchase.monthly_cost > 0) {
    // Leases and finance: the upfront payment covers the first month, monthly payments follow.
    const firstPayment = purchase.upfront_cost > 0 ? addMonths(start, 1) : start;
    rows.push(monthly(purchase.name, purchase.monthly_cost, "bill", firstPayment));
  }
  const car = opts.carCosts;
  if (car) {
    if (car.energyMonthly > 0) rows.push(monthly(`${purchase.name} · ${car.fuelMonthly > 0 && car.chargingMonthly > 0 ? "fuel & charging" : car.chargingMonthly > 0 ? "charging" : "fuel"}`, car.energyMonthly, "transport", start));
    if (car.insuranceMonthly > 0) rows.push(monthly(`${purchase.name} · insurance`, car.insuranceMonthly, "insurance", start));
    if (car.taxMonthly > 0) rows.push(monthly(`${purchase.name} · road tax`, car.taxMonthly, "transport", start));
    if (car.maintenanceMonthly > 0) rows.push(monthly(`${purchase.name} · servicing & tyres`, car.maintenanceMonthly, "transport", start));
  }
  for (const cost of purchase.one_off_costs || []) {
    if (!(cost.amount > 0)) continue;
    rows.push(oneOff(cost.label || `${purchase.name} · extra`, cost.amount, cost.date || start));
  }
  return rows;
}

function monthOf(date: string | null | undefined) {
  return date ? date.slice(0, 7) : null;
}

/** What the purchase costs in a given month (before taking off anything it replaces). */
export function purchaseCostInMonth(purchase: Purchase, carCosts: CarCosts | null, month: string) {
  const startMonth = monthOf(purchase.start_date);
  if (!startMonth || month < startMonth) return 0;
  const endMonth = monthOf(purchaseEnd(purchase));
  const running = !endMonth || month <= endMonth;
  let total = 0;
  if (month === startMonth) total += purchase.upfront_cost;
  const paymentsFrom = purchase.upfront_cost > 0 ? monthOf(addMonths(purchase.start_date as string, 1)) as string : startMonth;
  if (running && month >= paymentsFrom) total += purchase.monthly_cost;
  if (running && carCosts) total += carCosts.totalMonthly;
  for (const cost of purchase.one_off_costs || []) {
    if (cost.amount > 0 && (monthOf(cost.date) || startMonth) === month) total += cost.amount;
  }
  return round(total);
}

function lineActive(line: ReplacedLine, month: string) {
  const from = monthOf(line.start_date);
  const to = monthOf(line.end_date);
  return (!from || from <= month) && (!to || to >= month);
}

export type PurchaseCheck = {
  verdict: "yes" | "tight" | "not_yet" | "no_date";
  monthlyChange: number;          // per month once it's running, vs today (negative = cheaper)
  newMonthly: number;             // everything the new thing costs each month
  replacedMonthly: number;        // what stops (payment + running costs of what it replaces)
  atStart: number;                // one-off money needed in the first month
  lowest: number;                 // lowest savings balance over the forecast, with it
  lowestMonth: string | null;
  lowestWithout: number;          // same, without it
  firstShortMonth: string | null; // first month savings would go below zero
  bufferBreachMonth: string | null;
  earliestComfortable: string | null; // earliest start month that keeps the safety net intact
  months: number;
};

/**
 * `forecast` must NOT include this purchase's own lines or the line it replaces —
 * the caller excludes both, so drafts and purchases already in the plan are judged the same way.
 */
export function checkPurchase({
  purchase,
  carCosts,
  replaced,
  forecast,
  savingsNow,
  buffer,
}: {
  purchase: Purchase;
  carCosts: CarCosts | null;
  replaced: ReplacedLine | null;
  forecast: { month: string; leftOver: number }[];
  savingsNow: number;
  buffer: number;
}): PurchaseCheck {
  const currentRunning = purchase.kind === "car" && replaced ? Number(purchase.car?.currentRunningMonthly || 0) : 0;
  const newMonthly = round(purchase.monthly_cost + (carCosts?.totalMonthly || 0));
  const replacedMonthly = round((replaced?.amount || 0) + currentRunning);
  const startMonth = monthOf(purchase.start_date);
  const atStart = startMonth
    ? round(purchase.upfront_cost + (purchase.one_off_costs || []).filter((c) => (monthOf(c.date) || startMonth) === startMonth).reduce((s, c) => s + (c.amount || 0), 0))
    : round(purchase.upfront_cost + (purchase.one_off_costs || []).reduce((s, c) => s + (c.amount || 0), 0));

  const simulate = (start: string | null) => {
    const p = { ...purchase, start_date: start };
    const startM = monthOf(start);
    let balance = savingsNow;
    let balanceWithout = savingsNow;
    let lowest = Infinity;
    let lowestMonth: string | null = null;
    let lowestWithout = Infinity;
    let firstShort: string | null = null;
    let bufferBreach: string | null = null;
    for (const row of forecast) {
      const replacedCost = replaced && lineActive(replaced, row.month) ? replaced.amount : 0;
      const runningOld = replaced && currentRunning ? currentRunning : 0;
      const before = !startM || row.month < startM;
      // With: the old line keeps going until the new thing starts.
      // Running costs of the old car aren't in the plan, so once it goes they come back as a saving.
      const withIt = row.leftOver - (before ? replacedCost : 0) - (startM ? purchaseCostInMonth(p, carCosts, row.month) : 0) + (!before ? runningOld : 0);
      balance += withIt;
      balanceWithout += row.leftOver - replacedCost;
      if (balance < lowest) { lowest = balance; lowestMonth = row.month; }
      lowestWithout = Math.min(lowestWithout, balanceWithout);
      if (!firstShort && balance < 0) firstShort = row.month;
      if (!bufferBreach && balance < buffer) bufferBreach = row.month;
    }
    return { lowest: round(lowest), lowestMonth, lowestWithout: round(lowestWithout), firstShort, bufferBreach };
  };

  const result = simulate(purchase.start_date);
  const baseline = simulate(null);
  // The purchase only "causes" a squeeze if the safety net is breached earlier than it would be anyway.
  const causesBreach = (breach: string | null) => Boolean(breach) && (!baseline.bufferBreach || (breach as string) < baseline.bufferBreach);
  let earliestComfortable: string | null = null;
  const day = (purchase.start_date || "2000-01-01").slice(8, 10);
  for (const row of forecast) {
    const trial = simulate(`${row.month}-${day}`);
    if (!trial.firstShort && !causesBreach(trial.bufferBreach)) { earliestComfortable = row.month; break; }
  }

  const verdict: PurchaseCheck["verdict"] = !startMonth
    ? "no_date"
    : result.firstShort && result.firstShort !== baseline.firstShort
      ? "not_yet"
      : causesBreach(result.bufferBreach)
        ? "tight"
        : "yes";

  return {
    verdict,
    monthlyChange: round(newMonthly - replacedMonthly),
    newMonthly,
    replacedMonthly,
    atStart,
    lowest: result.lowest,
    lowestMonth: result.lowestMonth,
    lowestWithout: result.lowestWithout,
    firstShortMonth: result.firstShort,
    bufferBreachMonth: result.bufferBreach,
    earliestComfortable,
    months: forecast.length,
  };
}
