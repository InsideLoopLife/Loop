import "server-only";

// Energy suppliers and tariffs. Octopus publishes its tariffs and regional rates through a
// public API, so those come back live. Other suppliers don't publish theirs, so we offer their
// standard variable tariff at the Ofgem cap and ask for the rates from the bill otherwise.

import { PRICE_CAP_RATES } from "@/lib/home/items";

const OCTOPUS = "https://api.octopus.energy/v1";
const CACHE_MS = 6 * 60 * 60 * 1000;
const cache = new Map<string, { at: number; value: unknown }>();

async function cachedJson<T>(url: string): Promise<T> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value as T;
  const response = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Octopus answered ${response.status}`);
  const value = (await response.json()) as T;
  cache.set(url, { at: Date.now(), value });
  return value;
}

export const SUPPLIERS = [
  "Octopus Energy", "British Gas", "EDF", "E.ON Next", "OVO", "Scottish Power", "So Energy", "Outfox the Market",
  "Utility Warehouse", "Ecotricity", "Good Energy", "Utilita", "Sainsbury's Energy", "Co-op Energy", "Fuse Energy", "Other",
];

export const REGION_NAMES: Record<string, string> = {
  _A: "Eastern England", _B: "East Midlands", _C: "London", _D: "Merseyside & North Wales", _E: "West Midlands", _F: "North East",
  _G: "North West", _H: "Southern England", _J: "South East", _K: "South Wales", _L: "South West", _M: "Yorkshire", _N: "South Scotland", _P: "North Scotland",
};

export type TariffOption = {
  supplier: string;
  name: string;
  code: string | null;
  electricity: number | null;
  gas: number | null;
  electricityStanding: number | null;
  gasStanding: number | null;
  fixed: boolean;
  green: boolean;
  /** Rates change by time of day or day to day; the standard/peak rate is shown. */
  timeOfUse: boolean;
  note?: string;
};

export type TariffSearch = { supplier: string; region: string | null; regionName: string | null; live: boolean; options: TariffOption[]; message?: string };

export async function regionForPostcode(postcode: string | null | undefined): Promise<string | null> {
  const clean = String(postcode || "").toUpperCase().replace(/[^A-Z0-9 ]/g, "").trim();
  if (clean.length < 5) return null;
  try {
    const data = await cachedJson<{ results?: Array<{ group_id: string }> }>(`${OCTOPUS}/industry/grid-supply-points/?postcode=${encodeURIComponent(clean)}`);
    const group = data.results?.[0]?.group_id;
    return group && REGION_NAMES[group] ? group : null;
  } catch {
    return null;
  }
}

const round = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? Math.round(n * 100) / 100 : null);

function pickPayment(byPayment: Record<string, any> | undefined) {
  if (!byPayment) return null;
  return byPayment.direct_debit_monthly || byPayment.varying || Object.values(byPayment)[0] || null;
}

async function octopusOptions(region: string): Promise<TariffOption[]> {
  const list = await cachedJson<{ results: any[] }>(`${OCTOPUS}/products/?brand=OCTOPUS_ENERGY&is_business=false`);
  const products = (list.results || []).filter((p) => p.direction === "IMPORT" && !p.is_business && !p.is_prepay && !/outgoing|export/i.test(`${p.code} ${p.display_name}`));
  const details = await Promise.all(products.map((p) => cachedJson<any>(`${OCTOPUS}/products/${encodeURIComponent(p.code)}/`).catch(() => null)));
  const options: TariffOption[] = [];
  details.forEach((detail, index) => {
    if (!detail) return;
    const product = products[index];
    const elec = pickPayment(detail.single_register_electricity_tariffs?.[region]);
    const gas = pickPayment(detail.single_register_gas_tariffs?.[region]);
    const electricity = round(elec?.standard_unit_rate_inc_vat);
    const gasRate = round(gas?.standard_unit_rate_inc_vat);
    if (electricity == null && gasRate == null) return;
    const timeOfUse = Boolean(product.is_tracker) || /^(AGILE|GO|INTELLI|COSY|FLUX|SNUG)/i.test(product.code);
    options.push({
      supplier: "Octopus Energy",
      name: product.display_name || product.full_name,
      code: product.code,
      electricity,
      gas: gasRate,
      electricityStanding: round(elec?.standing_charge_inc_vat),
      gasStanding: round(gas?.standing_charge_inc_vat),
      fixed: !product.is_variable,
      green: Boolean(product.is_green),
      timeOfUse,
      note: timeOfUse ? (product.is_tracker ? "Tracks wholesale prices day to day — today's rate shown." : "Cheaper at certain times — the standard/peak rate is shown.") : undefined,
    });
  });
  // Plain tariffs first, then fixed before variable, then name.
  return options.sort((a, b) => Number(a.timeOfUse) - Number(b.timeOfUse) || Number(b.fixed) - Number(a.fixed) || a.name.localeCompare(b.name));
}

export async function searchTariffs(supplier: string, postcode: string | null | undefined): Promise<TariffSearch> {
  const name = SUPPLIERS.find((s) => s.toLowerCase() === supplier.trim().toLowerCase()) || supplier.trim();
  const region = await regionForPostcode(postcode);
  const regionName = region ? REGION_NAMES[region] : null;
  const capOption: TariffOption = {
    supplier: name,
    name: "Standard variable tariff",
    code: null,
    electricity: PRICE_CAP_RATES.electricity,
    gas: PRICE_CAP_RATES.gas,
    electricityStanding: null,
    gasStanding: null,
    fixed: false,
    green: false,
    timeOfUse: false,
    note: `Capped by Ofgem — these are the national average cap rates (${PRICE_CAP_RATES.label}). Your region and payment method can differ slightly; your bill has the exact figures.`,
  };
  if (/octopus/i.test(name)) {
    if (!region) return { supplier: "Octopus Energy", region: null, regionName: null, live: false, options: [], message: "Add your home's postcode so we can look up the rates for your region." };
    try {
      const options = await octopusOptions(region);
      return { supplier: "Octopus Energy", region, regionName, live: true, options };
    } catch {
      return { supplier: "Octopus Energy", region, regionName, live: false, options: [], message: "Couldn't reach Octopus just now — type the rates from your bill instead." };
    }
  }
  return {
    supplier: name,
    region,
    regionName,
    live: false,
    options: [capOption],
    message: `${name === "Other" ? "Most suppliers" : name} don't publish tariff rates for apps to read. If you're on a fixed or special tariff, type the unit rates from your bill or app.`,
  };
}
