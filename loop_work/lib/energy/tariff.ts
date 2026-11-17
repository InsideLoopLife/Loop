import "server-only";

// The household's energy tariff, for use anywhere in Loop: appliance running costs, bills,
// the calendar (fixed-deal end dates), budgeting. One current tariff per household; when there
// isn't one, the regional Ofgem cap for the home's postcode, then the GB average.

import { capFor, PRICE_CAP_PERIOD } from "@/lib/energy/price-cap";
import { regionForPostcode } from "@/lib/home/tariffs";

export type EnergyTariffRow = {
  id: string;
  supplier: string;
  tariff_name: string | null;
  fuel: "electricity" | "gas" | "dual";
  electricity_unit_p: number | null;
  electricity_night_unit_p: number | null;
  electricity_standing_p: number | null;
  gas_unit_p: number | null;
  gas_standing_p: number | null;
  payment_method: string | null;
  fixed_until: string | null;
  exit_fee_gbp: number | null;
  monthly_payment_gbp: number | null;
  annual_electricity_kwh: number | null;
  annual_gas_kwh: number | null;
  gas_tariff_name: string | null;
  gas_fixed_until: string | null;
  gas_exit_fee_gbp: number | null;
  off_peak_start: string | null;
  off_peak_end: string | null;
  region: string | null;
  source: "bill_upload" | "octopus_api" | "price_cap" | "manual";
  confirmed_at: string;
};

export const TARIFF_COLUMNS = "id, supplier, tariff_name, fuel, electricity_unit_p, electricity_night_unit_p, electricity_standing_p, gas_unit_p, gas_standing_p, payment_method, fixed_until, exit_fee_gbp, monthly_payment_gbp, annual_electricity_kwh, annual_gas_kwh, gas_tariff_name, gas_fixed_until, gas_exit_fee_gbp, off_peak_start, off_peak_end, region, source, confirmed_at";

export type EffectiveEnergy = {
  electricity: number;
  /** Night / off-peak electricity rate, when the tariff has one. */
  electricityNight: number | null;
  offPeak: { start: string; end: string } | null;
  gas: number;
  electricityStanding: number | null;
  gasStanding: number | null;
  /** Where the numbers came from, in words. */
  label: string;
  basis: "tariff" | "regional_cap" | "gb_cap";
  tariff: EnergyTariffRow | null;
  region: string | null;
  regionName: string | null;
  /** The most recently saved tariff, when none is current — so it can be restored. */
  lastSaved: { id: string; supplier: string; tariffName: string | null; savedAt: string } | null;
};

const num = (value: unknown) => (value === null || value === undefined || value === "" ? null : Number(value));

/** The household's current tariff, if one has been saved. `filter` is the household visibility filter. */
export async function currentTariff(supabase: any, filter: string): Promise<EnergyTariffRow | null> {
  const { data } = await supabase.from("household_energy_tariffs").select(TARIFF_COLUMNS).eq("is_current", true).or(filter).order("confirmed_at", { ascending: false }).limit(1);
  return toRow(data?.[0]);
}

function toRow(row: any): EnergyTariffRow | null {
  if (!row) return null;
  return {
    ...row,
    electricity_unit_p: num(row.electricity_unit_p), electricity_night_unit_p: num(row.electricity_night_unit_p), electricity_standing_p: num(row.electricity_standing_p),
    gas_unit_p: num(row.gas_unit_p), gas_standing_p: num(row.gas_standing_p), exit_fee_gbp: num(row.exit_fee_gbp), monthly_payment_gbp: num(row.monthly_payment_gbp),
    annual_electricity_kwh: num(row.annual_electricity_kwh), annual_gas_kwh: num(row.annual_gas_kwh), gas_exit_fee_gbp: num(row.gas_exit_fee_gbp),
  } as EnergyTariffRow;
}

/** The rates Loop should use: the household tariff, else the regional cap, else the GB cap. */
export async function effectiveEnergy(supabase: any, filter: string, postcode: string | null | undefined): Promise<EffectiveEnergy> {
  const [tariff, region] = await Promise.all([currentTariff(supabase, filter), regionForPostcode(postcode)]);
  const cap = capFor(tariff?.region || region);
  if (tariff) {
    return {
      electricity: tariff.electricity_unit_p ?? cap.electricity,
      electricityNight: tariff.electricity_night_unit_p,
      offPeak: tariff.off_peak_start && tariff.off_peak_end ? { start: tariff.off_peak_start, end: tariff.off_peak_end } : null,
      lastSaved: null,
      gas: tariff.gas_unit_p ?? cap.gas,
      electricityStanding: tariff.electricity_standing_p,
      gasStanding: tariff.gas_standing_p,
      label: `${tariff.supplier}${tariff.tariff_name ? ` · ${tariff.tariff_name}` : ""}`,
      basis: "tariff",
      tariff,
      region: tariff.region || region,
      regionName: cap.name,
    };
  }
  const { data: previous } = await supabase.from("household_energy_tariffs").select("id, supplier, tariff_name, confirmed_at").eq("is_current", false).or(filter).order("confirmed_at", { ascending: false }).limit(1);
  const last = previous?.[0];
  return {
    electricity: cap.electricity,
    electricityNight: null,
    offPeak: null,
    lastSaved: last ? { id: last.id, supplier: last.supplier, tariffName: last.tariff_name, savedAt: last.confirmed_at } : null,
    gas: cap.gas,
    electricityStanding: cap.electricityStanding,
    gasStanding: cap.gasStanding,
    label: cap.regional ? `${PRICE_CAP_PERIOD.label} · ${cap.name}` : `${PRICE_CAP_PERIOD.label} · GB average`,
    basis: cap.regional ? "regional_cap" : "gb_cap",
    tariff: null,
    region,
    regionName: cap.name,
  };
}
