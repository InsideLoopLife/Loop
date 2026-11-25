// Monthly running costs for a car: fuel or charging, road tax, insurance.
//
// Update FUEL_PRICES roughly monthly and VED each April.

export type FuelType = "petrol" | "diesel" | "hybrid" | "plug_in_hybrid" | "electric";

export const FUEL_LABEL: Record<FuelType, string> = {
  petrol: "Petrol",
  diesel: "Diesel",
  hybrid: "Hybrid (self-charging)",
  plug_in_hybrid: "Plug-in hybrid",
  electric: "Electric",
};

// UK weekly averages, government road fuel price statistics, week of 16 Nov 2026.
export const FUEL_PRICES = { petrolPencePerLitre: 167.1, dieselPencePerLitre: 196.8, asOf: "2026-11-16", source: "UK government weekly road fuel prices" };

// Vehicle Excise Duty 2026/27 (cars registered from April 2017).
export const VED = {
  standard: 200,
  expensiveCarSupplement: 440, // years 2–6 when the list price is over the threshold
  thresholdFuel: 40_000,       // petrol, diesel, hybrids
  thresholdElectric: 50_000,   // zero-emission cars
  firstYearElectric: 10,
  taxYear: "2026/27",
};

// Typical real-world figures used when nothing better is known.
export const TYPICAL_MPG: Record<FuelType, number> = { petrol: 42, diesel: 50, hybrid: 52, plug_in_hybrid: 42, electric: 0 };
export const TYPICAL_MILES_PER_KWH = 3.3;
export const TYPICAL_ANNUAL_MILES = 8_000;
export const TYPICAL_PHEV_ELECTRIC_SHARE = 0.5; // share of miles done on battery

const LITRES_PER_GALLON = 4.54609;

// Maintenance guide: a yearly service plus tyres, brakes and wear by the mile. Rough UK
// independent-garage figures; electric cars need less servicing but wear tyres a little faster.
export const MAINTENANCE = {
  serviceAnnual: { petrol: 220, diesel: 240, hybrid: 200, plug_in_hybrid: 220, electric: 150 } as Record<FuelType, number>,
  wearPencePerMile: { petrol: 3, diesel: 3, hybrid: 3, plug_in_hybrid: 3, electric: 3.5 } as Record<FuelType, number>,
};

// Tyres: a set of four, priced by how big (and dear) the car is, lasting about 20,000 miles
// (15,000 on an electric car, which is heavier). Other wear: brakes, wipers, bulbs, by the mile
// (electric cars use their brakes much less). MOT: the maximum fee, from a car's third year.
export const TYRES = {
  perTyre: [
    { upTo: 22_000, price: 75 },
    { upTo: 35_000, price: 110 },
    { upTo: 50_000, price: 150 },
    { upTo: Infinity, price: 210 },
  ],
  lifeMiles: { petrol: 20_000, diesel: 20_000, hybrid: 20_000, plug_in_hybrid: 18_000, electric: 15_000 } as Record<FuelType, number>,
};
export const OTHER_WEAR_PENCE_PER_MILE: Record<FuelType, number> = { petrol: 1.2, diesel: 1.2, hybrid: 1, plug_in_hybrid: 1, electric: 0.6 };
export const MOT_FEE = 54.85;

export type MaintenanceParts = { service: number; tyres: number; wear: number; mot: number; total: number; tyrePrice: number; tyreLifeMiles: number };

/** Yearly money to set aside for a car, part by part. With servicing included (most lease maintenance packages) the service is left out. */
export function maintenanceParts(fuel: FuelType, miles: number, opts: { serviceIncluded?: boolean; listPrice?: number | null; year?: number | null; today?: string } = {}): MaintenanceParts {
  const m = Math.max(0, miles);
  const tyrePrice = TYRES.perTyre.find((band) => (opts.listPrice || 30_000) <= band.upTo)!.price;
  const tyreLifeMiles = TYRES.lifeMiles[fuel];
  const service = opts.serviceIncluded ? 0 : MAINTENANCE.serviceAnnual[fuel];
  const tyres = (m / tyreLifeMiles) * tyrePrice * 4;
  const wear = (m * OTHER_WEAR_PENCE_PER_MILE[fuel]) / 100;
  const thisYear = Number((opts.today || new Date().toISOString()).slice(0, 4));
  const mot = opts.year && thisYear - opts.year >= 3 ? MOT_FEE : 0;
  const r = (v: number) => Math.round(v);
  return { service: r(service), tyres: r(tyres), wear: r(wear), mot: r(mot), total: r(service + tyres + wear + mot), tyrePrice, tyreLifeMiles };
}

/** Yearly maintenance guess (servicing, tyres, other wear and the MOT). */
export function maintenanceAnnual(fuel: FuelType, miles: number, serviceIncluded = false, listPrice?: number | null, year?: number | null) {
  return maintenanceParts(fuel, miles, { serviceIncluded, listPrice, year }).total;
}

/**
 * Rough yearly insurance from the insurance group (1 cheapest – 50 dearest) for an experienced driver
 * with no claims. A guide only: age, postcode, claims and cover change a real quote a lot.
 */
export function insuranceFromGroup(group: number | null | undefined) {
  if (!group || group < 1 || group > 50) return null;
  return Math.round(420 + group * 14);
}

export type CarInputs = {
  fuelType: FuelType;
  annualMiles: number;
  mpg?: number | null;               // real-world mpg on fuel
  milesPerKwh?: number | null;       // electric efficiency
  electricShare?: number | null;     // plug-in hybrids: share of miles on battery (0–1)
  electricityPence?: number | null;  // home charging price per kWh
  fuelPencePerLitre?: number | null; // override pump price
  insuranceMonthly?: number | null;
  insuranceGroup?: number | null;    // used for a guess when no premium is given
  insuranceTypicalAnnual?: number | null; // typical premium found for this model — preferred over the group formula
  listPrice?: number | null;
  taxIncluded?: boolean;             // e.g. included in a lease
  serviceIncluded?: boolean;         // lease maintenance package
  maintenanceAnnual?: number | null; // override the guess
  year?: number | null;              // first registered — the MOT starts in year 3
};

export type CarCosts = {
  fuelMonthly: number;
  chargingMonthly: number;
  energyMonthly: number;
  taxMonthly: number;
  taxAnnual: number;
  taxNote: string;
  insuranceMonthly: number;
  insuranceSource: "you" | "group" | "none";
  maintenanceMonthly: number;
  maintenanceSource: "you" | "guide";
  /** The guide's parts, a year each (null when you gave your own figure). */
  maintenanceParts: MaintenanceParts | null;
  totalMonthly: number;
  /** For hybrids and EVs: what the same miles would cost in a typical petrol car. */
  petrolEquivalentMonthly: number | null;
  assumptions: string[];
};

const round = (value: number) => Math.round(value * 100) / 100;

function fuelPence(fuel: FuelType, override?: number | null) {
  if (override && override > 0) return override;
  return fuel === "diesel" ? FUEL_PRICES.dieselPencePerLitre : FUEL_PRICES.petrolPencePerLitre;
}

/** £ per month to drive `miles` a year at `mpg` with fuel at `pence` a litre. */
export function fuelCostMonthly(miles: number, mpg: number, pence: number) {
  if (!(miles > 0) || !(mpg > 0)) return 0;
  return (miles / mpg) * LITRES_PER_GALLON * (pence / 100) / 12;
}

export function roadTax(fuel: FuelType, listPrice?: number | null, included = false) {
  if (included) return { annual: 0, note: "Included in the lease" };
  const threshold = fuel === "electric" ? VED.thresholdElectric : VED.thresholdFuel;
  if (listPrice && listPrice > threshold) {
    return { annual: VED.standard + VED.expensiveCarSupplement, note: `£${VED.standard} + £${VED.expensiveCarSupplement} supplement (list price over £${threshold.toLocaleString("en-GB")}), years 2–6` };
  }
  return { annual: VED.standard, note: `Standard rate £${VED.standard} (${VED.taxYear})` };
}

export function carRunningCosts(input: CarInputs): CarCosts {
  const fuel = input.fuelType;
  const miles = input.annualMiles > 0 ? input.annualMiles : TYPICAL_ANNUAL_MILES;
  const mpg = input.mpg && input.mpg > 0 ? input.mpg : TYPICAL_MPG[fuel];
  const milesPerKwh = input.milesPerKwh && input.milesPerKwh > 0 ? input.milesPerKwh : TYPICAL_MILES_PER_KWH;
  const electricity = input.electricityPence && input.electricityPence > 0 ? input.electricityPence : 26.32;
  const share = fuel === "electric" ? 1 : fuel === "plug_in_hybrid" ? Math.min(1, Math.max(0, input.electricShare ?? TYPICAL_PHEV_ELECTRIC_SHARE)) : 0;
  const pump = fuelPence(fuel, input.fuelPencePerLitre);
  const assumptions: string[] = [];

  const fuelMiles = miles * (1 - share);
  const electricMiles = miles * share;
  const fuelMonthly = fuel === "electric" ? 0 : fuelCostMonthly(fuelMiles, mpg, pump);
  const chargingMonthly = electricMiles > 0 ? (electricMiles / milesPerKwh) * (electricity / 100) / 12 : 0;

  if (fuel !== "electric") assumptions.push(`${Math.round(fuelMiles).toLocaleString("en-GB")} miles a year at ${mpg} mpg, ${fuel === "diesel" ? "diesel" : "petrol"} at ${pump.toFixed(1)}p a litre${input.fuelPencePerLitre ? "" : ` (UK average, ${FUEL_PRICES.asOf})`}`);
  if (electricMiles > 0) assumptions.push(`${Math.round(electricMiles).toLocaleString("en-GB")} miles a year on electric at ${milesPerKwh} miles/kWh, ${electricity.toFixed(1)}p a kWh`);

  const tax = roadTax(fuel, input.listPrice, input.taxIncluded);
  const guessed = input.insuranceTypicalAnnual && input.insuranceTypicalAnnual > 0 ? Math.round(input.insuranceTypicalAnnual) : insuranceFromGroup(input.insuranceGroup);
  const insuranceSource: CarCosts["insuranceSource"] = input.insuranceMonthly && input.insuranceMonthly > 0 ? "you" : guessed ? "group" : "none";
  const insurance = insuranceSource === "you" ? Number(input.insuranceMonthly) : insuranceSource === "group" ? (guessed as number) / 12 : 0;
  const maintenanceSource: CarCosts["maintenanceSource"] = input.maintenanceAnnual !== null && input.maintenanceAnnual !== undefined && input.maintenanceAnnual >= 0 ? "you" : "guide";
  const parts = maintenanceSource === "guide" ? maintenanceParts(fuel, miles, { serviceIncluded: Boolean(input.serviceIncluded), listPrice: input.listPrice, year: input.year }) : null;
  const maintenance = (maintenanceSource === "you" ? Number(input.maintenanceAnnual) : parts!.total) / 12;
  if (insuranceSource === "group") assumptions.push(input.insuranceTypicalAnnual ? `insurance: typical for this model${input.insuranceGroup ? ` (group ${input.insuranceGroup})` : ""}, about £${guessed} a year` : `insurance guessed from group ${input.insuranceGroup} (about £${guessed} a year)`);
  if (maintenanceSource === "guide") assumptions.push(`maintenance: ${input.serviceIncluded ? "servicing included, " : `a yearly service (about £${MAINTENANCE.serviceAnnual[fuel]}), `}tyres (4 × about £${parts!.tyrePrice}, lasting ${parts!.tyreLifeMiles.toLocaleString("en-GB")} miles), brakes and wear at ${OTHER_WEAR_PENCE_PER_MILE[fuel]}p a mile${parts!.mot ? `, and the MOT (£${MOT_FEE})` : ""}`);

  let petrolEquivalentMonthly: number | null = null;
  if (fuel !== "petrol" && fuel !== "diesel") {
    petrolEquivalentMonthly = round(fuelCostMonthly(miles, TYPICAL_MPG.petrol, FUEL_PRICES.petrolPencePerLitre));
  }

  const energyMonthly = fuelMonthly + chargingMonthly;
  return {
    fuelMonthly: round(fuelMonthly),
    chargingMonthly: round(chargingMonthly),
    energyMonthly: round(energyMonthly),
    taxMonthly: round(tax.annual / 12),
    taxAnnual: tax.annual,
    taxNote: tax.note,
    insuranceMonthly: round(insurance),
    insuranceSource,
    maintenanceMonthly: round(maintenance),
    maintenanceSource,
    maintenanceParts: parts,
    totalMonthly: round(energyMonthly + tax.annual / 12 + insurance + maintenance),
    petrolEquivalentMonthly,
    assumptions,
  };
}

/** Guess whether a description is a car, and its fuel type, from words in it. */
export function guessCar(text: string): { isCar: boolean; fuelType: FuelType | null; lease: boolean } {
  const t = text.toLowerCase();
  const isCar = /\b(car|lease|pcp|hp|suv|hatchback|estate|saloon|tiguan|golf|polo|fiesta|focus|kuga|puma|corsa|astra|qashqai|juke|yaris|corolla|rav4|tesla|model [3ysx]|ioniq|kona|tucson|sportage|niro|octavia|superb|kodiaq|karoq|a[1-8]\b|q[2-8]\b|[1-5] series|x[1-7]\b|mini|clio|captur|2008|3008|5008|mg[345]?|zs|hs|id\.?[3-7]|enyaq|cupra|leon|ateca|evoque|discovery|defender|xc[469]0|ev[369]|bmw|audi|mercedes|vw|volkswagen|ford|toyota|nissan|kia|hyundai|skoda|seat|peugeot|vauxhall|renault|volvo|honda|mazda|lexus|byd|polestar)\b/.test(t);
  const fuelType: FuelType | null = /\b(phev|plug[- ]in)\b/.test(t)
    ? "plug_in_hybrid"
    : /\b(ev|electric|e-tron|id\.?[3-7]|tesla|enyaq|ioniq 5|ioniq 6|polestar)\b/.test(t)
      ? "electric"
      : /\b(hybrid|hev|e-hybrid|mhev|self-charging)\b/.test(t)
        ? "hybrid"
        : /\b(diesel|tdi|hdi|crdi|dci|blue ?hdi)\b/.test(t)
          ? "diesel"
          : /\b(petrol|tsi|tfsi|ecoboost)\b/.test(t)
            ? "petrol"
            : null;
  return { isCar, fuelType, lease: /\blease|contract hire|pch\b/.test(t) };
}
