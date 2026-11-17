// Ofgem energy price cap, single-rate, paying by Direct Debit. Region codes are the electricity
// distribution regions (Octopus "grid supply point" group letters).
//
// 1 Oct – 31 Dec 2026. GB averages from ofgem.gov.uk (26.32p / 54.83p electricity, 7.97p / 29.68p
// gas). Regional rows as republished by Uswitch and cross-checked against suppliers' own capped
// tariffs (Octopus Flexible in Merseyside & N Wales = 27.86p / 7.91p; British Gas Standard Variable
// in the East Midlands = 25.36p / 51.45p). Electricity carries no VAT from 1 Oct 2026 to 31 Mar 2027;
// gas includes 5% VAT. Update every quarter (next: 1 Jan 2027).

export type CapRates = { electricity: number; electricityStanding: number; gas: number; gasStanding: number };

export const PRICE_CAP_PERIOD = { label: "Ofgem price cap, Oct–Dec 2026", from: "2026-10-01", to: "2026-12-31" };

export const PRICE_CAP_GB: CapRates = { electricity: 26.32, electricityStanding: 54.83, gas: 7.97, gasStanding: 29.68 };

export const PRICE_CAP_BY_REGION: Record<string, CapRates & { name: string }> = {
  _A: { name: "Eastern England", electricity: 26.61, electricityStanding: 51.84, gas: 7.91, gasStanding: 29.34 },
  _B: { name: "East Midlands", electricity: 25.36, electricityStanding: 51.45, gas: 7.82, gasStanding: 29.41 },
  _C: { name: "London", electricity: 26.6, electricityStanding: 42.92, gas: 8.15, gasStanding: 30.2 },
  _D: { name: "Merseyside & North Wales", electricity: 27.86, electricityStanding: 67.66, gas: 7.91, gasStanding: 30.08 },
  _E: { name: "West Midlands", electricity: 25.6, electricityStanding: 57.23, gas: 7.9, gasStanding: 29.71 },
  _F: { name: "North East", electricity: 25.46, electricityStanding: 61.58, gas: 7.92, gasStanding: 29.79 },
  _G: { name: "North West", electricity: 26.49, electricityStanding: 45.68, gas: 7.86, gasStanding: 29.81 },
  _H: { name: "Southern England", electricity: 26.47, electricityStanding: 47.81, gas: 8.17, gasStanding: 29.16 },
  _J: { name: "South East", electricity: 26.88, electricityStanding: 52.32, gas: 8.05, gasStanding: 29.26 },
  _K: { name: "South Wales", electricity: 26.55, electricityStanding: 55.41, gas: 8.09, gasStanding: 29.96 },
  _L: { name: "South West", electricity: 26.58, electricityStanding: 55.58, gas: 8.12, gasStanding: 29.31 },
  _M: { name: "Yorkshire", electricity: 25.6, electricityStanding: 61.67, gas: 7.9, gasStanding: 29.77 },
  _N: { name: "South Scotland", electricity: 26.11, electricityStanding: 61.41, gas: 7.87, gasStanding: 29.89 },
  _P: { name: "North Scotland", electricity: 26.35, electricityStanding: 55.14, gas: 7.87, gasStanding: 29.87 },
};

export function capFor(region: string | null | undefined): CapRates & { name: string | null; regional: boolean } {
  const row = region ? PRICE_CAP_BY_REGION[region] : undefined;
  return row ? { ...row, regional: true } : { ...PRICE_CAP_GB, name: null, regional: false };
}
