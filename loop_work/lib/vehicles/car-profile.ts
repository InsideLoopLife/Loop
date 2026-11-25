// A household car: what it costs each month, how many miles it really does, and whether a
// lease / PCP is heading over its mileage allowance.
import { carRunningCosts, roadTax, TYPICAL_ANNUAL_MILES, type FuelType } from "@/lib/vehicles/running-costs";

export type MotReading = { date: string; miles: number };

export type Car = {
  id?: string;
  name: string;
  registration?: string | null;
  make?: string | null;
  model?: string | null;
  variant?: string | null;
  colour?: string | null;
  year?: number | null;
  fuel_type: FuelType;
  engine_cc?: number | null;
  co2_g_km?: number | null;
  list_price?: number | null;
  ownership: "lease" | "pcp" | "hp" | "loan" | "owned";
  planned_item_id?: string | null;
  person_id?: string | null;
  agreement_start?: string | null;
  agreement_end?: string | null;
  mileage_allowance_annual?: number | null;
  excess_pence_per_mile?: number | null;
  final_payment?: number | null;
  odometer_miles?: number | null;
  odometer_date?: string | null;
  mot_due?: string | null;
  tax_due?: string | null;
  tax_included?: boolean;
  insurer?: string | null;
  insurance_renewal?: string | null;
  insurance_annual?: number | null;
  insurance_group?: number | null;
  maintenance_included?: boolean;
  maintenance_annual?: number | null;
  annual_miles?: number | null;
  mpg?: number | null;
  miles_per_kwh?: number | null;
  electric_share?: number | null;
  mot_mileage?: MotReading[];
  lookup?: Record<string, unknown> | null;
  notes?: string | null;
};

export const OWNERSHIP_LABEL: Record<Car["ownership"], string> = {
  lease: "Lease (contract hire)",
  pcp: "PCP finance",
  hp: "Hire purchase",
  loan: "Bought with a loan",
  owned: "Owned outright",
};

const DAY = 86_400_000;
const days = (from: string, to: string) => (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY;
const round = (value: number) => Math.round(value * 100) / 100;

/** Miles a year from MOT readings: the last few years of tests, ignoring obvious odometer errors. */
export function milesFromMot(readings: MotReading[] | undefined | null) {
  const sorted = (readings || [])
    .filter((r) => r && /^\d{4}-\d{2}-\d{2}$/.test(r.date) && Number(r.miles) > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < 2) return null;
  const last = sorted[sorted.length - 1];
  // Use readings from up to ~3 years before the latest test.
  const start = [...sorted].reverse().find((r) => days(r.date, last.date) >= 330 && days(r.date, last.date) <= 1200) || sorted[0];
  const span = days(start.date, last.date);
  const miles = last.miles - start.miles;
  if (span < 300 || miles <= 0) return null;
  return Math.round((miles / span) * 365);
}

/** Best estimate of miles a year, and where it came from. */
export function annualMiles(car: Car): { miles: number; source: "you" | "odometer" | "mot" | "allowance" | "typical" } {
  if (car.annual_miles && car.annual_miles > 0) return { miles: car.annual_miles, source: "you" };
  if (car.odometer_miles && car.odometer_date && car.agreement_start && car.odometer_date > car.agreement_start) {
    const span = days(car.agreement_start, car.odometer_date);
    if (span >= 60) return { miles: Math.round((car.odometer_miles / span) * 365), source: "odometer" };
  }
  const mot = milesFromMot(car.mot_mileage);
  if (mot) return { miles: mot, source: "mot" };
  if (car.mileage_allowance_annual) return { miles: car.mileage_allowance_annual, source: "allowance" };
  return { miles: TYPICAL_ANNUAL_MILES, source: "typical" };
}

export type AllowanceCheck = {
  allowedSoFar: number;
  usedSoFar: number;
  projectedTotal: number;
  allowedTotal: number;
  overBy: number;           // projected miles over the allowance at the end (0 if under)
  excessCost: number;       // £ at the excess rate
  status: "on_track" | "close" | "over";
};

/** Lease / PCP: on the current pace, will the car go over its mileage allowance? Needs an odometer reading. */
export function allowanceCheck(car: Car, today: string): AllowanceCheck | null {
  if (!car.mileage_allowance_annual || !car.agreement_start || !car.agreement_end) return null;
  if (car.odometer_miles === null || car.odometer_miles === undefined || !car.odometer_date) return null;
  const totalDays = days(car.agreement_start, car.agreement_end);
  const soFarDays = days(car.agreement_start, car.odometer_date);
  if (totalDays <= 0 || soFarDays <= 30) return null;
  const allowedTotal = Math.round((car.mileage_allowance_annual * totalDays) / 365);
  const allowedSoFar = Math.round((car.mileage_allowance_annual * soFarDays) / 365);
  const pace = car.odometer_miles / soFarDays;
  const projectedTotal = Math.round(pace * totalDays);
  const overBy = Math.max(0, projectedTotal - allowedTotal);
  const excessCost = round((overBy * Number(car.excess_pence_per_mile || 0)) / 100);
  const status = overBy > 0 ? "over" : projectedTotal > allowedTotal * 0.95 ? "close" : "on_track";
  void today;
  return { allowedSoFar, usedSoFar: car.odometer_miles, projectedTotal, allowedTotal, overBy, excessCost, status };
}

export type CarMonthly = {
  payment: number;
  energy: number;
  insurance: number;
  insuranceSource: "you" | "group" | "none";
  maintenance: number;
  maintenanceSource: "you" | "guide";
  maintenanceParts: import("@/lib/vehicles/running-costs").MaintenanceParts | null;
  tax: number;
  total: number;
  perMile: number;
  miles: number;
  milesSource: ReturnType<typeof annualMiles>["source"];
  energyLabel: string;
  taxNote: string;
};

export function carMonthly(car: Car, paymentMonthly: number, electricityPence?: number | null): CarMonthly {
  const miles = annualMiles(car);
  const costs = carRunningCosts({
    fuelType: car.fuel_type,
    annualMiles: miles.miles,
    mpg: car.mpg ?? null,
    milesPerKwh: car.miles_per_kwh ?? null,
    electricShare: car.electric_share ?? null,
    electricityPence: electricityPence ?? null,
    insuranceMonthly: car.insurance_annual ? car.insurance_annual / 12 : null,
    insuranceGroup: car.insurance_group ?? (car.lookup?.insuranceGroup as number | null | undefined) ?? null,
    insuranceTypicalAnnual: car.lookup?.insuranceAnnualLow && car.lookup?.insuranceAnnualHigh ? (Number(car.lookup.insuranceAnnualLow) + Number(car.lookup.insuranceAnnualHigh)) / 2 : null,
    listPrice: car.list_price ?? null,
    taxIncluded: Boolean(car.tax_included),
    serviceIncluded: Boolean(car.maintenance_included),
    maintenanceAnnual: car.maintenance_annual ?? null,
    year: car.year ?? null,
  });
  // Older cars (registered before April 2017) pay by CO2 band — use the standard rate as a guide.
  const tax = car.tax_included ? { annual: 0, note: "Included in the lease" } : roadTax(car.fuel_type, car.list_price, false);
  const total = paymentMonthly + costs.energyMonthly + costs.insuranceMonthly + costs.maintenanceMonthly + tax.annual / 12;
  return {
    payment: round(paymentMonthly),
    energy: costs.energyMonthly,
    insurance: costs.insuranceMonthly,
    insuranceSource: costs.insuranceSource,
    maintenance: costs.maintenanceMonthly,
    maintenanceSource: costs.maintenanceSource,
    maintenanceParts: costs.maintenanceParts,
    tax: round(tax.annual / 12),
    total: round(total),
    perMile: miles.miles > 0 ? round((total * 12 * 100) / miles.miles) : 0,
    miles: miles.miles,
    milesSource: miles.source,
    energyLabel: costs.chargingMonthly > 0 && costs.fuelMonthly > 0 ? "Fuel & charging" : costs.chargingMonthly > 0 ? "Charging" : "Fuel",
    taxNote: tax.note,
  };
}

/** Upcoming dates for a car, soonest first. */
export function carDates(car: Car, today: string) {
  const list: { key: string; date: string; label: string }[] = [];
  if (car.mot_due) list.push({ key: "mot", date: car.mot_due, label: "MOT due" });
  if (car.tax_due && !car.tax_included) list.push({ key: "tax", date: car.tax_due, label: "Road tax due" });
  if (car.insurance_renewal) list.push({ key: "insurance", date: car.insurance_renewal, label: `Insurance renews${car.insurer ? ` (${car.insurer})` : ""}` });
  if (car.agreement_end && car.ownership !== "owned") list.push({ key: "agreement", date: car.agreement_end, label: car.ownership === "lease" ? "Lease ends" : car.ownership === "pcp" ? "PCP ends — final payment, return or part-exchange" : "Finance ends" });
  return list.filter((d) => d.date >= today).sort((a, b) => a.date.localeCompare(b.date));
}

/** Next yearly date on or after today (MOT, tax and insurance repeat every year). */
export function rollForward(date: string | null | undefined, today: string) {
  if (!date) return null;
  let next = date;
  for (let i = 0; i < 50 && next < today; i += 1) {
    const [y, m, d] = next.split("-").map(Number);
    next = `${y + 1}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  return next;
}
