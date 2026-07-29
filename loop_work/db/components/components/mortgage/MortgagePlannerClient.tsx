"use client";

import { useMemo, useState, type ReactNode } from "react";
import { SectionCard } from "@/components/SectionCard";
import { StatCard } from "@/components/StatCard";
import { SubmitButton } from "@/components/SubmitButton";
import { formatMoney } from "@/lib/format/money";
import { calculateMonthlyMortgagePayment, calculateProjectedMortgageBalance, estimateTotalInterest } from "@/lib/calculations/mortgage";
import { calculateStampDutyEngland } from "@/lib/calculations/property";
import type { MonthPlan } from "@/lib/planning/month-plan";
import {
  addHome,
  addHomeMortgageDeal,
  addHomeValuationSource,
  addMortgageScenario,
  deleteHome,
  deleteHomeMortgageDeal,
  deleteHomeValuationSource,
  deleteMortgageScenario,
  updateHome,
  updateHomeMortgageDeal,
  updateHomeValuationSource,
} from "@/app/mortgage/actions";

export type MortgageScenario = {
  id: string;
  name: string;
  balance: number;
  interest_rate: number;
  term_years: number;
  monthly_overpayment: number;
};

export type Person = {
  id: string;
  name: string;
  relationship: string;
  birth_date?: string | null;
};

export type Home = {
  id: string;
  label: string;
  house_number: string | null;
  address_line: string | null;
  postcode: string | null;
  full_address: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  map_url: string | null;
  lookup_source: string | null;
  uprn: string | null;
  property_type: string | null;
  purchase_source_url: string | null;
  last_lookup_at: string | null;
  ownership_status: string;
  property_value: number;
  estimated_value_low: number | null;
  estimated_value_mid: number | null;
  estimated_value_high: number | null;
  estimated_value_date: string | null;
  purchase_price: number | null;
  purchase_date: string | null;
  target_purchase_price: number | null;
  target_extra_cash: number | null;
  target_interest_rate: number | null;
  target_term_years: number | null;
  notes: string | null;
};

export type HomeOwner = {
  id: string;
  home_id: string;
  person_id: string;
  ownership_percent: number | null;
};

export type HomeMortgageDeal = {
  id: string;
  home_id: string | null;
  lender: string | null;
  product_name: string | null;
  balance: number;
  balance_as_of_date: string | null;
  interest_rate: number;
  rate_type: string;
  repayment_type: string | null;
  initial_period_end: string | null;
  term_years: number;
  monthly_payment_override: number | null;
  start_date: string;
  end_date: string | null;
  notes: string | null;
};

export type HomeValuationSource = {
  id: string;
  home_id: string;
  source_name: string;
  source_type: string;
  valuation_low: number | null;
  valuation_mid: number | null;
  valuation_high: number | null;
  valuation_amount: number | null;
  confidence: string | null;
  valuation_date: string | null;
  source_url: string | null;
  notes: string | null;
};

type Props = {
  scenarios: MortgageScenario[];
  people: Person[];
  homes: Home[];
  owners: HomeOwner[];
  deals: HomeMortgageDeal[];
  valuations: HomeValuationSource[];
  monthPlan: MonthPlan;
};

type ModalState =
  | null
  | { type: "add_home" }
  | { type: "edit_home"; home: Home }
  | { type: "add_mortgage"; homeId?: string }
  | { type: "edit_mortgage"; deal: HomeMortgageDeal }
  | { type: "add_valuation"; homeId?: string }
  | { type: "edit_valuation"; valuation: HomeValuationSource }
  | { type: "add_scenario" };

type AddressLookupResult = {
  houseNumber: string;
  postcode: string;
  fullAddress: string;
  addressLine: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  mapUrl: string;
  purchasePrice: number | null;
  purchaseDate: string | null;
  lookupSource: string;
  lastLookupAt: string;
  sourceNotes: string[];
  landRegistrySearchUrl: string;
  error?: string;
};

const inputClass = "mt-1 w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-sm font-medium outline-none ring-orange-500 focus:ring-2";
const softInputClass = "w-full rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-sm font-medium outline-none ring-orange-500 focus:ring-2";

function currentDate() {
  return new Date().toISOString().slice(0, 10);
}

function numberValue(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "";
  return String(value);
}

function numberOrZero(value: number | null | undefined) {
  return Number(value ?? 0) || 0;
}

function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}

function mortgagePaymentForDeal(deal: HomeMortgageDeal) {
  if (deal.monthly_payment_override !== null && deal.monthly_payment_override !== undefined) {
    return Number(deal.monthly_payment_override);
  }

  return calculateMonthlyMortgagePayment({
    balance: Number(deal.balance),
    annualInterestRate: Number(deal.interest_rate),
    termYears: Number(deal.term_years),
  });
}

function projectedMortgageForDeal(deal: HomeMortgageDeal, asOfDate: Date = new Date()) {
  return calculateProjectedMortgageBalance({
    openingBalance: Number(deal.balance),
    annualInterestRate: Number(deal.interest_rate),
    termYears: Number(deal.term_years),
    balanceAsOfDate: deal.balance_as_of_date ?? deal.start_date,
    asOfDate,
    monthlyPayment: deal.monthly_payment_override,
    repaymentType: deal.repayment_type ?? "repayment",
  });
}

function currentMortgageBalanceForDeal(deal: HomeMortgageDeal) {
  return projectedMortgageForDeal(deal).projectedBalance;
}

function balanceAsOfLabel(deal: HomeMortgageDeal) {
  return deal.balance_as_of_date ?? deal.start_date ?? "Not set";
}

function mapQueryForHome(home: Home) {
  if (home.latitude && home.longitude) return `${home.latitude},${home.longitude}`;
  return [home.full_address, home.address_line, home.postcode, home.city, home.country].filter(Boolean).join(" ");
}

function mapUrlForHome(home: Home) {
  if (home.map_url) return home.map_url;
  const query = mapQueryForHome(home);
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : null;
}

function embedMapUrlForHome(home: Home) {
  const query = mapQueryForHome(home);
  return query ? `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed` : null;
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function confidenceWeight(confidence: string | null) {
  if (confidence === "high") return 1.25;
  if (confidence === "low") return 0.75;
  return 1;
}

function weightedAverage(values: { value: number; confidence: string | null }[]) {
  const usable = values.filter((item) => item.value > 0);
  if (usable.length === 0) return 0;
  const totalWeight = usable.reduce((sum, item) => sum + confidenceWeight(item.confidence), 0);
  return usable.reduce((sum, item) => sum + item.value * confidenceWeight(item.confidence), 0) / totalWeight;
}

function valuationSummary(home: Home, valuations: HomeValuationSource[]) {
  const sourceLows = valuations.map((item) => ({ value: Number(item.valuation_low ?? item.valuation_mid ?? item.valuation_amount ?? 0), confidence: item.confidence }));
  const sourceMids = valuations.map((item) => ({ value: Number(item.valuation_mid ?? item.valuation_amount ?? 0), confidence: item.confidence }));
  const sourceHighs = valuations.map((item) => ({ value: Number(item.valuation_high ?? item.valuation_mid ?? item.valuation_amount ?? 0), confidence: item.confidence }));

  const sourceLow = weightedAverage(sourceLows);
  const sourceMid = weightedAverage(sourceMids);
  const sourceHigh = weightedAverage(sourceHighs);

  const low = Number(home.estimated_value_low ?? 0) || sourceLow || Number(home.property_value ?? 0);
  const mid = Number(home.estimated_value_mid ?? 0) || sourceMid || Number(home.property_value ?? 0);
  const high = Number(home.estimated_value_high ?? 0) || sourceHigh || Number(home.property_value ?? 0);

  return { low, mid, high, sourceLow, sourceMid, sourceHigh, sourceCount: valuations.length, hasManualOverride: Boolean(home.estimated_value_low || home.estimated_value_mid || home.estimated_value_high) };
}

function ltvBand(ltv: number) {
  if (ltv <= 0) return "Add value/mortgage";
  if (ltv <= 60) return "60% LTV band";
  if (ltv <= 75) return "75% LTV band";
  if (ltv <= 80) return "80% LTV band";
  if (ltv <= 85) return "85% LTV band";
  if (ltv <= 90) return "90% LTV band";
  if (ltv <= 95) return "95% LTV band";
  return "Above 95% LTV / specialist check";
}

function affordabilityLabel({ futureSurplus, paymentToIncomeRatio }: { futureSurplus: number; paymentToIncomeRatio: number }) {
  if (futureSurplus >= 1000 && paymentToIncomeRatio <= 0.35) return { label: "Strong", className: "bg-emerald-100 text-emerald-700", notes: "Looks comfortable against current tracked income/outgoings." };
  if (futureSurplus >= 500 && paymentToIncomeRatio <= 0.4) return { label: "Comfortable", className: "bg-lime-100 text-lime-700", notes: "Likely workable, but check childcare and maternity months." };
  if (futureSurplus >= 0) return { label: "Tight", className: "bg-amber-100 text-amber-700", notes: "May work, but the monthly buffer is thin." };
  return { label: "Stretch", className: "bg-red-100 text-red-700", notes: "Based on current tracked data this would create a monthly shortfall." };
}



type RateSuggestion = {
  lender: string;
  productName: string;
  rate: number;
  rateType: string;
  termYears: number;
  score: number;
  notes: string;
  sourceUrl?: string;
};

function lenderAccent(lender: string | null) {
  const name = (lender || "").toLowerCase();
  if (name.includes("natwest")) return "from-purple-600 to-pink-500";
  if (name.includes("halifax")) return "from-blue-700 to-cyan-500";
  if (name.includes("nationwide")) return "from-blue-600 to-red-500";
  if (name.includes("santander")) return "from-red-600 to-red-400";
  return "from-slate-900 to-slate-600";
}

function monthsBetweenToday(dateString: string | null | undefined) {
  if (!dateString) return null;
  const end = new Date(dateString);
  if (Number.isNaN(end.getTime())) return null;
  const today = new Date();
  return Math.max(0, (end.getFullYear() - today.getFullYear()) * 12 + (end.getMonth() - today.getMonth()));
}

function ageFromBirthDate(birthDate: string | null | undefined) {
  if (!birthDate) return null;
  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age -= 1;
  return age;
}

function planningMaxTermYears(people: Person[]) {
  const adultAges = people
    .filter((person) => ["self", "partner"].includes(person.relationship))
    .map((person) => ageFromBirthDate(person.birth_date))
    .filter((age): age is number => age !== null);
  if (adultAges.length === 0) return { maxTerm: 35, helper: "Add adult birth dates in Household to check the term against age." };
  const oldest = Math.max(...adultAges);
  const maxTerm = Math.max(5, Math.min(40, 75 - oldest));
  return { maxTerm, helper: `Planning guide: oldest borrower is ${oldest}, so age 75 implies roughly ${maxTerm} years max. Lenders vary.` };
}

function SelectField({ label, name, defaultValue, children }: { label: string; name: string; defaultValue?: string | number | null; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <select name={name} defaultValue={defaultValue ?? ""} className={inputClass}>
        {children}
      </select>
    </label>
  );
}

function TextField({ label, name, defaultValue, type = "text", placeholder, step, required }: { label: string; name: string; defaultValue?: string | number | null; type?: string; placeholder?: string; step?: string; required?: boolean }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input name={name} type={type} defaultValue={defaultValue ?? ""} placeholder={placeholder} step={step} required={required} className={inputClass} />
    </label>
  );
}

function ControlledField({ label, name, value, onChange, type = "text", placeholder, step, required }: { label: string; name: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string; step?: string; required?: boolean }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input name={name} type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} step={step} required={required} className={inputClass} />
    </label>
  );
}

function Modal({ title, description, children, onClose }: { title: string; description?: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-6">
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-[2rem] border border-white/70 bg-white/92 p-6 shadow-2xl backdrop-blur-2xl sm:max-w-5xl sm:rounded-[2rem]">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black tracking-tight text-slate-950">{title}</h2>
            {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
          </div>
          <button type="button" onClick={onClose} className="rounded-full bg-slate-100 px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-200">
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function HomeForm({ people, owners, home, action }: { people: Person[]; owners: HomeOwner[]; home?: Home; action: (formData: FormData) => void | Promise<void> }) {
  const assignedOwners = new Set(owners.filter((owner) => owner.home_id === home?.id).map((owner) => owner.person_id));
  const [houseNumber, setHouseNumber] = useState(home?.house_number ?? home?.address_line?.split(" ")[0] ?? "");
  const [postcode, setPostcode] = useState(home?.postcode ?? "");
  const [label, setLabel] = useState(home?.label ?? "");
  const [addressLine, setAddressLine] = useState(home?.address_line ?? "");
  const [fullAddress, setFullAddress] = useState(home?.full_address ?? "");
  const [city, setCity] = useState(home?.city ?? "");
  const [region, setRegion] = useState(home?.region ?? "");
  const [country, setCountry] = useState(home?.country ?? "United Kingdom");
  const [latitude, setLatitude] = useState(numberValue(home?.latitude));
  const [longitude, setLongitude] = useState(numberValue(home?.longitude));
  const [mapUrl, setMapUrl] = useState(home?.map_url ?? (home ? mapUrlForHome(home) ?? "" : ""));
  const [purchasePrice, setPurchasePrice] = useState(numberValue(home?.purchase_price));
  const [purchaseDate, setPurchaseDate] = useState(home?.purchase_date ?? "");
  const [lowEstimate, setLowEstimate] = useState(numberValue(home?.estimated_value_low));
  const [midEstimate, setMidEstimate] = useState(numberValue(home?.estimated_value_mid ?? home?.property_value));
  const [highEstimate, setHighEstimate] = useState(numberValue(home?.estimated_value_high));
  const [lookupSource, setLookupSource] = useState(home?.lookup_source ?? "manual");
  const [lastLookupAt, setLastLookupAt] = useState(home?.last_lookup_at ?? "");
  const [purchaseSourceUrl, setPurchaseSourceUrl] = useState(home?.purchase_source_url ?? "");
  const [lookupMessage, setLookupMessage] = useState<string | null>(null);
  const [lookupBusy, setLookupBusy] = useState(false);

  async function runLookup() {
    setLookupBusy(true);
    setLookupMessage(null);
    try {
      const response = await fetch(`/api/property/address-lookup?postcode=${encodeURIComponent(postcode)}&houseNumber=${encodeURIComponent(houseNumber)}`);
      const data = (await response.json()) as AddressLookupResult;
      if (!response.ok || data.error) throw new Error(data.error || "Address lookup failed");

      const suggestedLabel = houseNumber ? `${houseNumber} ${postcode.toUpperCase()}` : postcode.toUpperCase();
      setLabel((current) => current || suggestedLabel);
      setAddressLine(data.addressLine || houseNumber || "");
      setFullAddress(data.fullAddress || [houseNumber, postcode].filter(Boolean).join(" "));
      setCity(data.city || "");
      setRegion(data.region || "");
      setCountry(data.country || "United Kingdom");
      setLatitude(data.latitude === null ? "" : String(data.latitude));
      setLongitude(data.longitude === null ? "" : String(data.longitude));
      setMapUrl(data.mapUrl || "");
      setPurchasePrice(data.purchasePrice === null ? purchasePrice : String(data.purchasePrice));
      setPurchaseDate(data.purchaseDate || purchaseDate);
      setLookupSource(data.lookupSource || "postcode_geocode");
      setLastLookupAt(data.lastLookupAt || currentDate());
      setPurchaseSourceUrl((current) => current || data.landRegistrySearchUrl || "");
      setLookupMessage(data.sourceNotes?.join(" ") || "Lookup complete.");
    } catch (error) {
      setLookupMessage(error instanceof Error ? error.message : "Address lookup failed");
    } finally {
      setLookupBusy(false);
    }
  }

  function seedValuationFromPurchase() {
    const base = Number(purchasePrice || midEstimate || 0);
    if (!base) {
      setLookupMessage("Add a purchase price or mid value first, then seed low/mid/high.");
      return;
    }
    setLowEstimate(String(Math.round(base * 0.95)));
    setMidEstimate(String(Math.round(base)));
    setHighEstimate(String(Math.round(base * 1.05)));
    setLookupMessage("Low/mid/high seeded from the current purchase/mid figure. Overwrite these with real valuations when you have them.");
  }

  return (
    <form action={action} className="space-y-5">
      {home ? <input type="hidden" name="id" value={home.id} /> : null}
      <input type="hidden" name="lookup_source" value={lookupSource} />
      <input type="hidden" name="last_lookup_at" value={lastLookupAt} />
      <input type="hidden" name="property_value" value={midEstimate || purchasePrice || "0"} />

      <div className="rounded-3xl border border-orange-200 bg-orange-50/50 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <ControlledField label="House number/name" name="house_number" value={houseNumber} onChange={setHouseNumber} placeholder="8" />
          <ControlledField label="Postcode" name="postcode" value={postcode} onChange={setPostcode} placeholder="WA5 8AT" required />
          <button type="button" onClick={runLookup} disabled={lookupBusy || !postcode} className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {lookupBusy ? "Looking up..." : "Find address"}
          </button>
          <button type="button" onClick={seedValuationFromPurchase} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700">
            Seed low/mid/high
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500">Fast mode: enter house number and postcode. The app will fill the map fields now, while purchase price/date can be manual or source-linked until Land Registry/PropertyData import is wired.</p>
        {lookupMessage ? <div className="mt-3 rounded-2xl bg-white px-3 py-2 text-sm text-slate-600">{lookupMessage}</div> : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <ControlledField label="Home label" name="label" value={label} onChange={setLabel} placeholder="Current home, next house" required />
        <ControlledField label="Address line" name="address_line" value={addressLine} onChange={setAddressLine} placeholder="Street or house name" />
        <SelectField label="Status" name="ownership_status" defaultValue={home?.ownership_status ?? "current_home"}>
          <option value="current_home">Current home</option>
          <option value="future_purchase">Future purchase</option>
          <option value="watchlist">Watchlist</option>
          <option value="sold">Sold / historic</option>
        </SelectField>
        <ControlledField label="Full address" name="full_address" value={fullAddress} onChange={setFullAddress} placeholder="Full address from lookup" />
        <ControlledField label="Town / city" name="city" value={city} onChange={setCity} />
        <ControlledField label="Region" name="region" value={region} onChange={setRegion} placeholder="Cheshire, Greater Manchester" />
        <ControlledField label="Country" name="country" value={country} onChange={setCountry} />
        <ControlledField label="Latitude" name="latitude" type="number" step="0.0000001" value={latitude} onChange={setLatitude} />
        <ControlledField label="Longitude" name="longitude" type="number" step="0.0000001" value={longitude} onChange={setLongitude} />
        <ControlledField label="Map URL" name="map_url" value={mapUrl} onChange={setMapUrl} placeholder="Generated by lookup or paste Google Maps link" />
        <ControlledField label="Purchase price" name="purchase_price" type="number" step="0.01" value={purchasePrice} onChange={setPurchasePrice} />
        <ControlledField label="Purchase date" name="purchase_date" type="date" value={purchaseDate} onChange={setPurchaseDate} />
        <ControlledField label="Low estimate" name="estimated_value_low" type="number" step="0.01" value={lowEstimate} onChange={setLowEstimate} placeholder="Low valuation" />
        <ControlledField label="Mid estimate" name="estimated_value_mid" type="number" step="0.01" value={midEstimate} onChange={setMidEstimate} placeholder="Expected valuation" />
        <ControlledField label="High estimate" name="estimated_value_high" type="number" step="0.01" value={highEstimate} onChange={setHighEstimate} placeholder="High valuation" />
        <TextField label="Valuation checked" name="estimated_value_date" type="date" defaultValue={home?.estimated_value_date ?? currentDate()} />
        <ControlledField label="Purchase source URL" name="purchase_source_url" value={purchaseSourceUrl} onChange={setPurchaseSourceUrl} placeholder="Land Registry/search/listing URL" />
        <TextField label="Property type" name="property_type" defaultValue={home?.property_type} placeholder="Detached, semi, terrace" />
        <TextField label="UPRN / provider ID" name="uprn" defaultValue={home?.uprn} placeholder="Optional address ID" />
        <TextField label="Target purchase price" name="target_purchase_price" type="number" step="0.01" defaultValue={numberValue(home?.target_purchase_price)} placeholder="e.g. 550000" />
        <TextField label="Extra cash/deposit" name="target_extra_cash" type="number" step="0.01" defaultValue={numberValue(home?.target_extra_cash)} />
        <TextField label="Assumed target rate %" name="target_interest_rate" type="number" step="0.001" defaultValue={numberValue(home?.target_interest_rate)} />
        <TextField label="Target term years" name="target_term_years" type="number" step="1" defaultValue={numberValue(home?.target_term_years ?? 30)} />
        <TextField label="Notes" name="notes" defaultValue={home?.notes} placeholder="Valuation source, Rightmove link, assumptions" />
      </div>

      <div>
        <p className="text-sm font-medium text-slate-700">Assign to household</p>
        <div className="mt-2 grid gap-2 md:grid-cols-4">
          {people.map((person) => (
            <label key={person.id} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
              <input type="checkbox" name="owner_ids" value={person.id} defaultChecked={assignedOwners.has(person.id)} />
              <span>{person.name} <span className="text-xs capitalize text-slate-400">({person.relationship})</span></span>
            </label>
          ))}
          {people.length === 0 ? <p className="text-sm text-slate-500">Add people in Household first if you want ownership attached.</p> : null}
        </div>
      </div>

      <SubmitButton>{home ? "Save home" : "Add home"}</SubmitButton>
    </form>
  );
}

function MortgageForm({ homes, deal, homeId, action }: { homes: Home[]; deal?: HomeMortgageDeal; homeId?: string; action: (formData: FormData) => void | Promise<void> }) {
  return (
    <form action={action} className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {deal ? <input type="hidden" name="id" value={deal.id} /> : null}
      <SelectField label="Home" name="home_id" defaultValue={deal?.home_id ?? homeId ?? homes[0]?.id ?? ""}>
        {homes.map((home) => <option key={home.id} value={home.id}>{home.label}</option>)}
      </SelectField>
      <TextField label="Lender" name="lender" defaultValue={deal?.lender} placeholder="NatWest, Halifax" />
      <TextField label="Product name" name="product_name" defaultValue={deal?.product_name} placeholder="2-year fix, tracker" />
      <TextField label="Opening / last known balance" name="balance" type="number" step="0.01" defaultValue={numberValue(deal?.balance)} required />
      <TextField label="Balance date" name="balance_as_of_date" type="date" defaultValue={deal?.balance_as_of_date ?? deal?.start_date ?? currentDate()} />
      <TextField label="Interest rate %" name="interest_rate" type="number" step="0.001" defaultValue={numberValue(deal?.interest_rate)} required />
      <SelectField label="Repayment type" name="repayment_type" defaultValue={deal?.repayment_type ?? "repayment"}>
        <option value="repayment">Repayment</option>
        <option value="interest_only">Interest only</option>
      </SelectField>
      <SelectField label="Rate type" name="rate_type" defaultValue={deal?.rate_type ?? "fixed"}>
        <option value="fixed">Fixed</option>
        <option value="tracker">Tracker</option>
        <option value="variable">Variable</option>
        <option value="standard_variable">SVR</option>
      </SelectField>
      <TextField label="Rate ends" name="initial_period_end" type="date" defaultValue={deal?.initial_period_end} />
      <TextField label="Term years" name="term_years" type="number" step="1" defaultValue={numberValue(deal?.term_years ?? 25)} required />
      <TextField label="Payment override" name="monthly_payment_override" type="number" step="0.01" defaultValue={numberValue(deal?.monthly_payment_override)} placeholder="Actual direct debit" />
      <TextField label="Start date" name="start_date" type="date" defaultValue={deal?.start_date ?? currentDate()} />
      <TextField label="End date" name="end_date" type="date" defaultValue={deal?.end_date} />
      <TextField label="Notes" name="notes" defaultValue={deal?.notes} placeholder="Fees, ERC, source URL" />
      <div className="flex items-end"><SubmitButton>{deal ? "Save mortgage" : "Add mortgage"}</SubmitButton></div>
    </form>
  );
}

function ValuationForm({ homes, valuation, homeId, action }: { homes: Home[]; valuation?: HomeValuationSource; homeId?: string; action: (formData: FormData) => void | Promise<void> }) {
  return (
    <form action={action} className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {valuation ? <input type="hidden" name="id" value={valuation.id} /> : null}
      <SelectField label="Home" name="home_id" defaultValue={valuation?.home_id ?? homeId ?? homes[0]?.id ?? ""}>
        {homes.map((home) => <option key={home.id} value={home.id}>{home.label}</option>)}
      </SelectField>
      <SelectField label="Source type" name="source_type" defaultValue={valuation?.source_type ?? "user_estimate"}>
        <option value="user_estimate">Your estimate</option>
        <option value="estate_agent">Estate agent</option>
        <option value="survey">Survey / RICS</option>
        <option value="zoopla">Zoopla / AVM</option>
        <option value="rightmove">Rightmove / listing</option>
        <option value="land_registry">Land Registry comparable</option>
        <option value="propertydata">PropertyData / API</option>
        <option value="other">Other</option>
      </SelectField>
      <TextField label="Source name" name="source_name" defaultValue={valuation?.source_name} placeholder="Zoopla, agent name, Land Registry" required />
      <SelectField label="Confidence" name="confidence" defaultValue={valuation?.confidence ?? "medium"}>
        <option value="low">Low</option>
        <option value="medium">Medium</option>
        <option value="high">High</option>
      </SelectField>
      <TextField label="Single valuation" name="valuation_amount" type="number" step="0.01" defaultValue={numberValue(valuation?.valuation_amount)} />
      <TextField label="Low" name="valuation_low" type="number" step="0.01" defaultValue={numberValue(valuation?.valuation_low)} />
      <TextField label="Mid" name="valuation_mid" type="number" step="0.01" defaultValue={numberValue(valuation?.valuation_mid)} />
      <TextField label="High" name="valuation_high" type="number" step="0.01" defaultValue={numberValue(valuation?.valuation_high)} />
      <TextField label="Valuation date" name="valuation_date" type="date" defaultValue={valuation?.valuation_date ?? currentDate()} />
      <TextField label="Source URL" name="source_url" defaultValue={valuation?.source_url} placeholder="Paste source/listing link" />
      <TextField label="Notes" name="notes" defaultValue={valuation?.notes} placeholder="Condition, comparable sale, caveats" />
      <div className="flex items-end"><SubmitButton>{valuation ? "Save valuation" : "Add valuation"}</SubmitButton></div>
    </form>
  );
}

function ScenarioForm() {
  return (
    <form action={addMortgageScenario} className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
      <TextField label="Scenario name" name="name" placeholder="Current deal, 5% rate, overpay £200" required />
      <TextField label="Balance" name="balance" type="number" step="0.01" required />
      <TextField label="Interest rate %" name="interest_rate" type="number" step="0.001" required />
      <TextField label="Term years" name="term_years" type="number" step="1" defaultValue={25} required />
      <TextField label="Monthly overpayment" name="monthly_overpayment" type="number" step="0.01" defaultValue={0} />
      <div className="flex items-end"><SubmitButton>Add scenario</SubmitButton></div>
    </form>
  );
}

function HomeMapHero({ home, owners, peopleById, deals, valuations, summary, onEdit, onAddMortgage, onAddValuation }: { home: Home; owners: HomeOwner[]; peopleById: Map<string, Person>; deals: HomeMortgageDeal[]; valuations: HomeValuationSource[]; summary: ReturnType<typeof valuationSummary>; onEdit: () => void; onAddMortgage: () => void; onAddValuation: () => void }) {
  const mapsUrl = mapUrlForHome(home);
  const embedUrl = embedMapUrlForHome(home);
  const homeBalance = deals.reduce((sum, deal) => sum + currentMortgageBalanceForDeal(deal), 0);
  const homePayment = deals.reduce((sum, deal) => sum + mortgagePaymentForDeal(deal), 0);
  const ltv = summary.mid > 0 ? (homeBalance / summary.mid) * 100 : 0;
  const ownerNames = owners.length > 0 ? owners.map((owner) => peopleById.get(owner.person_id)?.name ?? "Unknown").join(", ") : "Not assigned";

  return (
    <SectionCard title="Tracked home" description="Click a home card below to change the focus. The map, valuation range and mortgage panel update together.">
      <div className="grid gap-5 lg:grid-cols-[1.25fr_0.75fr]">
        <div className="relative min-h-[390px] overflow-hidden rounded-3xl border border-slate-200 bg-slate-100">
          {embedUrl ? (
            <iframe title={`${home.label} map`} src={embedUrl} className="absolute inset-0 h-full w-full border-0" loading="lazy" />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-slate-200 via-slate-100 to-orange-100" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/45 via-slate-950/5 to-transparent" />
          <div className="absolute left-1/2 top-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-orange-500 text-white shadow-2xl ring-8 ring-orange-500/20">⌂</div>
          <div className="absolute bottom-4 left-4 right-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-white/30 bg-white/80 p-4 shadow-lg backdrop-blur">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{statusLabel(home.ownership_status)}</p>
              <p className="mt-1 text-xl font-bold text-slate-950">{home.label}</p>
              <p className="mt-1 text-xs text-slate-600">{home.full_address || home.address_line || "No address"}{home.postcode ? ` · ${home.postcode}` : ""}</p>
            </div>
            <div className="rounded-2xl border border-white/30 bg-white/80 p-4 shadow-lg backdrop-blur">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Valuation range</p>
              <p className="mt-1 text-lg font-bold text-slate-950">{formatMoney(summary.low)} – {formatMoney(summary.high)}</p>
              <p className="mt-1 text-xs text-slate-600">Mid {formatMoney(summary.mid)} · {summary.sourceCount} source(s)</p>
            </div>
            <div className="rounded-2xl border border-white/30 bg-white/80 p-4 shadow-lg backdrop-blur">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Mortgage</p>
              <p className="mt-1 text-lg font-bold text-slate-950">{formatMoney(homeBalance)}</p>
              <p className="mt-1 text-xs text-slate-600">{ltv.toFixed(1)}% LTV · {formatMoney(homePayment)}/mo</p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-3xl border border-slate-200 bg-white p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Home details</p>
                <h3 className="mt-1 text-2xl font-bold text-slate-950">{home.label}</h3>
                <p className="mt-1 text-sm text-slate-500">Owners: {ownerNames}</p>
              </div>
              <button onClick={onEdit} className="rounded-full bg-slate-950 px-3 py-1.5 text-xs font-bold text-white">Edit</button>
            </div>
            <dl className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-slate-50 p-3"><dt className="text-xs text-slate-500">Purchase</dt><dd className="font-bold">{formatMoney(home.purchase_price)}</dd><dd className="text-xs text-slate-500">{home.purchase_date || "Date not set"}</dd></div>
              <div className="rounded-2xl bg-slate-50 p-3"><dt className="text-xs text-slate-500">Source average</dt><dd className="font-bold">{formatMoney(summary.sourceMid || summary.mid)}</dd><dd className="text-xs text-slate-500">{summary.hasManualOverride ? "Manual override active" : "Weighted by confidence"}</dd></div>
              <div className="rounded-2xl bg-slate-50 p-3"><dt className="text-xs text-slate-500">Coordinates</dt><dd className="font-bold">{home.latitude && home.longitude ? "Set" : "Missing"}</dd><dd className="text-xs text-slate-500">{home.latitude && home.longitude ? `${home.latitude}, ${home.longitude}` : "Use lookup"}</dd></div>
              <div className="rounded-2xl bg-slate-50 p-3"><dt className="text-xs text-slate-500">Lookup</dt><dd className="font-bold capitalize">{home.lookup_source?.replaceAll("_", " ") || "Manual"}</dd><dd className="text-xs text-slate-500">{home.last_lookup_at || "Not checked"}</dd></div>
            </dl>
            <div className="mt-4 flex flex-wrap gap-2">
              {mapsUrl ? <a href={mapsUrl} target="_blank" rel="noreferrer" className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700">Open map</a> : null}
              {home.purchase_source_url ? <a href={home.purchase_source_url} target="_blank" rel="noreferrer" className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700">Purchase/source</a> : null}
              <button onClick={onAddValuation} className="rounded-full bg-slate-950 px-3 py-1.5 text-xs font-bold text-white">+ valuation</button>
              <button onClick={onAddMortgage} className="rounded-full bg-slate-950 px-3 py-1.5 text-xs font-bold text-white">+ mortgage</button>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white p-5">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Attached mortgage/rate</p>
            <div className="mt-3 space-y-3">
              {deals.map((deal) => {
                const projection = projectedMortgageForDeal(deal);
                return (
                  <div key={deal.id} className="rounded-2xl bg-slate-50 p-4">
                    <p className="font-bold text-slate-950">{deal.lender || "Mortgage"}{deal.product_name ? ` · ${deal.product_name}` : ""}</p>
                    <p className="mt-1 text-sm text-slate-600">Current est. {formatMoney(projection.projectedBalance)} · opened {formatMoney(deal.balance)} on {balanceAsOfLabel(deal)}</p>
                    <p className="mt-1 text-sm text-slate-600">{deal.interest_rate}% · {deal.rate_type.replaceAll("_", " ")} · {deal.repayment_type?.replaceAll("_", " ") || "repayment"}</p>
                    <p className="mt-1 text-sm text-slate-600">Payment {formatMoney(mortgagePaymentForDeal(deal))}/mo{deal.initial_period_end ? ` · ends ${deal.initial_period_end}` : ""}</p>
                  </div>
                );
              })}
              {deals.length === 0 ? <p className="text-sm text-slate-500">No mortgage attached yet. Add one to make affordability more useful.</p> : null}
            </div>
          </div>
        </div>
      </div>
    </SectionCard>
  );
}



function RateResearchModal({
  targetPrice,
  loanRequired,
  ltv,
  termYears,
  currentRate,
  maxTermYears,
  onSelect,
  onClose,
}: {
  targetPrice: number;
  loanRequired: number;
  ltv: number;
  termYears: number;
  currentRate: number;
  maxTermYears: number;
  onSelect: (suggestion: RateSuggestion) => void;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<RateSuggestion[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  async function runResearch() {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/mortgage/rate-research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetPrice, loanRequired, ltv, termYears, currentRate }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not run rate research");
      setSuggestions(data.suggestions ?? []);
      setMessage(data.note ?? null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not run rate research");
    } finally {
      setLoading(false);
    }
  }

  const seededSuggestions = suggestions.length > 0 ? suggestions : [
    { lender: "Best-buy search", productName: `${ltvBand(ltv)} fixed-rate benchmark`, rate: currentRate || 4.75, rateType: "fixed", termYears, score: 72, notes: "Use as a placeholder until OpenAI/source research is connected." },
    { lender: "Stress test", productName: "Planning buffer rate", rate: Math.max((currentRate || 4.75) + 1.5, 6.5), rateType: "stress", termYears, score: 55, notes: "Useful to check whether affordability still works if rates move against you." },
  ];

  return (
    <Modal title="Mortgage rate research" description="Run an AI-assisted check, then select a rate assumption to apply to the move planner. Treat results as research notes until you verify lender eligibility/source URLs." onClose={onClose}>
      <div className="space-y-5">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Target price</p><p className="font-bold">{formatMoney(targetPrice)}</p></div>
          <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Loan required</p><p className="font-bold">{formatMoney(loanRequired)}</p></div>
          <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-500">LTV</p><p className="font-bold">{ltv.toFixed(1)}%</p></div>
          <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Term guide</p><p className="font-bold">{termYears} / max {maxTermYears}</p></div>
        </div>
        <button type="button" onClick={runResearch} disabled={loading} className="rounded-full bg-slate-950 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
          {loading ? "Researching..." : "Run AI rate check"}
        </button>
        {message ? <p className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{message}</p> : null}
        <div className="grid gap-4 lg:grid-cols-2">
          {seededSuggestions.map((item, index) => (
            <div key={`${item.lender}-${index}`} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{item.lender}</p><h3 className="mt-1 text-lg font-bold text-slate-950">{item.productName}</h3></div>
                <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-bold text-white">Score {item.score}</span>
              </div>
              <p className="mt-4 text-3xl font-bold text-slate-950">{Number(item.rate).toFixed(2)}%</p>
              <p className="text-sm text-slate-500 capitalize">{item.rateType} · {item.termYears} years</p>
              <p className="mt-3 text-sm text-slate-600">{item.notes}</p>
              <button type="button" onClick={() => onSelect(item)} className="mt-4 rounded-full bg-orange-600 px-4 py-2 text-sm font-bold text-white">Use this rate</button>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

export function MortgagePlannerClient({ scenarios, people, homes, owners, deals, valuations, monthPlan }: Props) {
  const [modal, setModal] = useState<ModalState>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [selectedHomeId, setSelectedHomeId] = useState(homes[0]?.id ?? "");
  const [targetPrice, setTargetPrice] = useState(String(homes[0]?.target_purchase_price ?? 550000));
  const [extraCash, setExtraCash] = useState(String(homes[0]?.target_extra_cash ?? 0));
  const [targetRate, setTargetRate] = useState(String(homes[0]?.target_interest_rate ?? 4.75));
  const [termYears, setTermYears] = useState(String(homes[0]?.target_term_years ?? 30));
  const [movingCosts, setMovingCosts] = useState("4000");
  const [viewMode, setViewMode] = useState<"low" | "mid" | "high">("mid");
  const [rateResearchOpen, setRateResearchOpen] = useState(false);

  const personById = useMemo(() => new Map(people.map((person) => [person.id, person])), [people]);
  const termGuide = useMemo(() => planningMaxTermYears(people), [people]);
  const homeById = useMemo(() => new Map(homes.map((home) => [home.id, home])), [homes]);
  const selectedHome = homeById.get(selectedHomeId) ?? homes[0];

  const valuationsByHome = useMemo(() => {
    const map = new Map<string, HomeValuationSource[]>();
    for (const valuation of valuations) {
      const list = map.get(valuation.home_id) ?? [];
      list.push(valuation);
      map.set(valuation.home_id, list);
    }
    return map;
  }, [valuations]);

  const selectedHomeDeals = selectedHome ? deals.filter((deal) => deal.home_id === selectedHome.id) : [];
  const selectedHomeOwners = selectedHome ? owners.filter((owner) => owner.home_id === selectedHome.id) : [];
  const selectedHomeValuations = selectedHome ? valuationsByHome.get(selectedHome.id) ?? [] : [];
  const selectedSummary = selectedHome ? valuationSummary(selectedHome, selectedHomeValuations) : null;

  const totalPropertyValue = homes.reduce((sum, home) => sum + valuationSummary(home, valuationsByHome.get(home.id) ?? []).mid, 0);
  const totalMortgageBalance = deals.reduce((sum, deal) => sum + currentMortgageBalanceForDeal(deal), 0);
  const totalMortgagePayment = deals.reduce((sum, deal) => sum + mortgagePaymentForDeal(deal), 0);
  const currentLtv = totalPropertyValue > 0 ? (totalMortgageBalance / totalPropertyValue) * 100 : 0;
  const firstScenario = scenarios[0];
  const firstPayment = firstScenario
    ? calculateMonthlyMortgagePayment({
        balance: Number(firstScenario.balance),
        annualInterestRate: Number(firstScenario.interest_rate),
        termYears: Number(firstScenario.term_years),
      })
    : 0;

  const movePlanner = useMemo(() => {
    if (!selectedHome) {
      return {
        saleValue: 0,
        currentMortgage: 0,
        currentPayment: 0,
        equity: 0,
        target: Number(targetPrice) || 0,
        stampDuty: 0,
        loanRequired: 0,
        ltv: 0,
        payment: 0,
        ltvBand: "Add a home first",
      };
    }
    const summary = valuationSummary(selectedHome, valuationsByHome.get(selectedHome.id) ?? []);
    const saleValue = summary[viewMode];
    const currentMortgage = deals.filter((deal) => deal.home_id === selectedHome.id).reduce((sum, deal) => sum + currentMortgageBalanceForDeal(deal), 0);
    const currentPayment = deals.filter((deal) => deal.home_id === selectedHome.id).reduce((sum, deal) => sum + mortgagePaymentForDeal(deal), 0);
    const equity = Math.max(0, saleValue - currentMortgage);
    const target = Number(targetPrice) || 0;
    const stampDuty = calculateStampDutyEngland({ purchasePrice: target });
    const cash = Number(extraCash) || 0;
    const upfront = stampDuty + (Number(movingCosts) || 0);
    const depositAvailableAfterCosts = Math.max(0, equity + cash - upfront);
    const loanRequired = Math.max(0, target - depositAvailableAfterCosts);
    const ltv = target > 0 ? (loanRequired / target) * 100 : 0;
    const payment = calculateMonthlyMortgagePayment({ balance: loanRequired, annualInterestRate: Number(targetRate) || 0, termYears: Number(termYears) || 30 });
    return { saleValue, currentMortgage, currentPayment, equity, target, stampDuty, loanRequired, ltv, payment, ltvBand: ltvBand(ltv) };
  }, [deals, extraCash, movingCosts, selectedHome, targetPrice, targetRate, termYears, valuationsByHome, viewMode]);

  const futureOutgoings = Math.max(0, monthPlan.outgoings - movePlanner.currentPayment + movePlanner.payment);
  const futureSurplus = monthPlan.income - futureOutgoings;
  const paymentToIncomeRatio = monthPlan.income > 0 ? movePlanner.payment / monthPlan.income : 0;
  const score = affordabilityLabel({ futureSurplus, paymentToIncomeRatio });

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-orange-600">Home move command centre</p>
          <h1 className="mt-2 text-4xl font-black tracking-tight text-slate-950 md:text-5xl">Mortgage & homes</h1>
          <p className="mt-1 max-w-3xl text-slate-600">Start with the question you care about: can we afford the next move? Then drill into the home, valuation sources and mortgage deal underneath.</p>
        </div>
        <div className="relative">
          <button onClick={() => setAddMenuOpen((open) => !open)} className="flex items-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-xl shadow-slate-950/15 hover:bg-slate-800">
            <span className="text-lg leading-none">+</span> Add
          </button>
          {addMenuOpen ? (
            <div className="absolute right-0 z-20 mt-2 w-72 overflow-hidden rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
              <button onClick={() => { setModal({ type: "add_home" }); setAddMenuOpen(false); }} className="block w-full rounded-xl px-3 py-3 text-left text-sm font-bold hover:bg-slate-50">Add home / address<span className="mt-1 block text-xs font-medium text-slate-500">House number, postcode, map and ownership</span></button>
              <button onClick={() => { setModal({ type: "add_valuation", homeId: selectedHome?.id }); setAddMenuOpen(false); }} className="block w-full rounded-xl px-3 py-3 text-left text-sm font-bold hover:bg-slate-50">Add valuation source<span className="mt-1 block text-xs font-medium text-slate-500">Agent, Zoopla, Land Registry comp or manual</span></button>
              <button onClick={() => { setModal({ type: "add_mortgage", homeId: selectedHome?.id }); setAddMenuOpen(false); }} className="block w-full rounded-xl px-3 py-3 text-left text-sm font-bold hover:bg-slate-50">Add mortgage / rate<span className="mt-1 block text-xs font-medium text-slate-500">Balance, rate, end date and payment</span></button>
              <button onClick={() => { setModal({ type: "add_scenario" }); setAddMenuOpen(false); }} className="block w-full rounded-xl px-3 py-3 text-left text-sm font-bold hover:bg-slate-50">Add standalone scenario</button>
            </div>
          ) : null}
        </div>
      </div>

      <section className="relative overflow-hidden rounded-[2.25rem] border border-white/70 bg-slate-950 p-6 text-white shadow-[0_36px_110px_-64px_rgba(15,23,42,.9)] md:p-8">
        <div className="absolute -right-24 -top-28 h-80 w-80 rounded-full bg-orange-500/30 blur-3xl" />
        <div className="absolute -bottom-32 left-1/3 h-72 w-72 rounded-full bg-emerald-400/20 blur-3xl" />
        <div className="relative grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-orange-200">Can we afford the move?</p>
            <h2 className="mt-3 text-4xl font-black tracking-tight md:text-6xl">{formatMoney(movePlanner.payment)} <span className="text-2xl text-slate-300 md:text-3xl">/ month</span></h2>
            <p className="mt-2 max-w-2xl text-sm font-medium text-slate-300">For a {formatMoney(movePlanner.target)} target home with a {formatMoney(movePlanner.loanRequired)} mortgage, {movePlanner.ltv.toFixed(1)}% LTV and {Number(targetRate || 0).toFixed(2)}% assumed rate.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <span className={`rounded-full px-3 py-1.5 text-xs font-black ${score.label === "Strong" || score.label === "Comfortable" ? "bg-emerald-400/20 text-emerald-100" : score.label === "Tight" ? "bg-amber-400/20 text-amber-100" : "bg-red-400/20 text-red-100"}`}>{score.label}</span>
              <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-black text-slate-200">Future buffer {formatMoney(futureSurplus)}</span>
              <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-black text-slate-200">{movePlanner.ltvBand}</span>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-3xl border border-white/15 bg-white/10 p-4 backdrop-blur"><p className="text-xs font-bold uppercase text-slate-300">Equity used</p><p className="mt-1 text-2xl font-black">{formatMoney(movePlanner.equity)}</p></div>
            <div className="rounded-3xl border border-white/15 bg-white/10 p-4 backdrop-blur"><p className="text-xs font-bold uppercase text-slate-300">Stamp duty</p><p className="mt-1 text-2xl font-black">{formatMoney(movePlanner.stampDuty)}</p></div>
            <div className="rounded-3xl border border-white/15 bg-white/10 p-4 backdrop-blur"><p className="text-xs font-bold uppercase text-slate-300">Current income</p><p className="mt-1 text-2xl font-black">{formatMoney(monthPlan.income)}</p></div>
            <div className="rounded-3xl border border-white/15 bg-white/10 p-4 backdrop-blur"><p className="text-xs font-bold uppercase text-slate-300">Outgoings after move</p><p className="mt-1 text-2xl font-black">{formatMoney(futureOutgoings)}</p></div>
          </div>
        </div>
      </section>

      {selectedHome && selectedSummary ? (
        <HomeMapHero
          home={selectedHome}
          owners={selectedHomeOwners}
          peopleById={personById}
          deals={selectedHomeDeals}
          valuations={selectedHomeValuations}
          summary={selectedSummary}
          onEdit={() => setModal({ type: "edit_home", home: selectedHome })}
          onAddMortgage={() => setModal({ type: "add_mortgage", homeId: selectedHome.id })}
          onAddValuation={() => setModal({ type: "add_valuation", homeId: selectedHome.id })}
        />
      ) : (
        <SectionCard title="Tracked home" description="Start with house number and postcode, then add mortgage and valuation assumptions.">
          <button onClick={() => setModal({ type: "add_home" })} className="rounded-full bg-slate-950 px-4 py-2 text-sm font-bold text-white">+ Add your first home</button>
        </SectionCard>
      )}

      <section className="grid gap-4 md:grid-cols-4">
        <StatCard title="Homes tracked" value={homes.length.toString()} />
        <StatCard title="Property value estimate" value={formatMoney(totalPropertyValue)} helper="Mid value across tracked homes" />
        <StatCard title="Mortgage balance" value={formatMoney(totalMortgageBalance)} />
        <StatCard title="Current LTV" value={`${currentLtv.toFixed(1)}%`} helper={ltvBand(currentLtv)} />
      </section>

      <SectionCard title="Affordability score" description={`Uses ${monthPlan.label} tracked income/outgoings, then swaps your current selected-home mortgage for the future payment.`}>
        <div className="grid gap-4 lg:grid-cols-[0.6fr_1.4fr]">
          <div className="rounded-3xl border border-slate-200 bg-white p-5">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Result</p>
            <div className="mt-3 flex items-center gap-3">
              <span className={`rounded-full px-3 py-1.5 text-sm font-bold ${score.className}`}>{score.label}</span>
              <p className="text-sm text-slate-600">{score.notes}</p>
            </div>
            <p className="mt-5 text-3xl font-bold text-slate-950">{formatMoney(futureSurplus)}</p>
            <p className="mt-1 text-sm text-slate-500">Expected monthly buffer after the future mortgage.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Tracked income</p><p className="mt-1 text-xl font-bold">{formatMoney(monthPlan.income)}</p></div>
            <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Current outgoings</p><p className="mt-1 text-xl font-bold">{formatMoney(monthPlan.outgoings)}</p></div>
            <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Future outgoings</p><p className="mt-1 text-xl font-bold">{formatMoney(futureOutgoings)}</p></div>
            <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Mortgage / income</p><p className="mt-1 text-xl font-bold">{(paymentToIncomeRatio * 100).toFixed(1)}%</p></div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Move planner" description="Use your current house valuation range, outstanding mortgage and target price to understand the likely new mortgage, LTV band and payment.">
        {selectedHome ? (
          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-12">
              <label className="block lg:col-span-2">
                <span className="text-sm font-medium text-slate-700">Current home</span>
                <select value={selectedHome.id} onChange={(event) => setSelectedHomeId(event.target.value)} className={inputClass}>
                  {homes.map((home) => <option key={home.id} value={home.id}>{home.label}</option>)}
                </select>
              </label>
              <label className="block lg:col-span-2">
                <span className="text-sm font-medium text-slate-700">Use valuation</span>
                <select value={viewMode} onChange={(event) => setViewMode(event.target.value as "low" | "mid" | "high")} className={inputClass}>
                  <option value="low">Low</option>
                  <option value="mid">Mid</option>
                  <option value="high">High</option>
                </select>
              </label>
              <label className="block lg:col-span-2">
                <span className="text-sm font-medium text-slate-700">Target purchase price</span>
                <input value={targetPrice} onChange={(event) => setTargetPrice(event.target.value)} type="number" step="1000" className={inputClass} />
              </label>
              <label className="block lg:col-span-2">
                <span className="text-sm font-medium text-slate-700">Extra cash/deposit</span>
                <input value={extraCash} onChange={(event) => setExtraCash(event.target.value)} type="number" step="100" className={inputClass} />
              </label>
              <label className="block lg:col-span-2">
                <span className="flex items-center justify-between gap-2 text-sm font-medium text-slate-700">
                  Assumed rate %
                  <button type="button" onClick={() => setRateResearchOpen(true)} className="rounded-full bg-slate-950 px-3 py-1 text-[11px] font-bold text-white shadow-sm">AI check</button>
                </span>
                <input value={targetRate} onChange={(event) => setTargetRate(event.target.value)} type="number" step="0.001" className={inputClass} />
              </label>
              <label className="block lg:col-span-2">
                <span className="text-sm font-medium text-slate-700">Term years</span>
                <input value={termYears} onChange={(event) => setTermYears(event.target.value)} type="number" step="1" max={termGuide.maxTerm} className={inputClass} />
              </label>
              <label className="block lg:col-span-2">
                <span className="text-sm font-medium text-slate-700">Moving/legal costs</span>
                <input value={movingCosts} onChange={(event) => setMovingCosts(event.target.value)} type="number" step="100" className={inputClass} />
              </label>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              <span className="font-semibold text-slate-800">Term guide:</span> {termGuide.helper}
            </div>
            <div className="grid gap-3 md:grid-cols-4">
              <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sale value used</p><p className="mt-1 text-xl font-bold">{formatMoney(movePlanner.saleValue)}</p></div>
              <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Equity after mortgage</p><p className="mt-1 text-xl font-bold">{formatMoney(movePlanner.equity)}</p></div>
              <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Stamp duty estimate</p><p className="mt-1 text-xl font-bold">{formatMoney(movePlanner.stampDuty)}</p></div>
              <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">New mortgage required</p><p className="mt-1 text-xl font-bold">{formatMoney(movePlanner.loanRequired)}</p></div>
              <div className="rounded-2xl bg-orange-50 p-4 md:col-span-2"><p className="text-xs font-semibold uppercase tracking-wide text-orange-700">Effective LTV/rate band</p><p className="mt-1 text-2xl font-bold text-slate-950">{movePlanner.ltv.toFixed(1)}% · {movePlanner.ltvBand}</p><p className="mt-1 text-sm text-slate-600">Use this LTV band when checking live lender products.</p></div>
              <div className="rounded-2xl bg-orange-50 p-4 md:col-span-2"><p className="text-xs font-semibold uppercase tracking-wide text-orange-700">Payment at assumed rate</p><p className="mt-1 text-2xl font-bold text-slate-950">{formatMoney(movePlanner.payment)} / month</p><p className="mt-1 text-sm text-slate-600">Based on {Number(targetRate || 0).toFixed(3)}% over {termYears || 30} years.</p></div>
            </div>
          </div>
        ) : <p className="text-sm text-slate-500">Add your current home first, then this planner will estimate equity and future borrowing.</p>}
      </SectionCard>

      <SectionCard title="Other tracked homes" description="Click a card to focus the map and affordability planner on that home.">
        <div className="grid gap-4 lg:grid-cols-3">
          {homes.map((home) => {
            const homeOwners = owners.filter((owner) => owner.home_id === home.id);
            const homeDeals = deals.filter((deal) => deal.home_id === home.id);
            const homeValuations = valuationsByHome.get(home.id) ?? [];
            const summary = valuationSummary(home, homeValuations);
            const homeBalance = homeDeals.reduce((sum, deal) => sum + currentMortgageBalanceForDeal(deal), 0);
            const homePayment = homeDeals.reduce((sum, deal) => sum + mortgagePaymentForDeal(deal), 0);
            const ltv = summary.mid > 0 ? (homeBalance / summary.mid) * 100 : 0;

            return (
              <button key={home.id} onClick={() => setSelectedHomeId(home.id)} className={`rounded-2xl border p-5 text-left transition hover:bg-slate-50 ${home.id === selectedHome?.id ? "border-orange-300 bg-orange-50" : "border-slate-200 bg-white"}`}>
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{statusLabel(home.ownership_status)}</p>
                <h3 className="mt-1 text-xl font-bold text-slate-950">{home.label}</h3>
                <p className="mt-1 text-sm text-slate-500">{home.full_address || home.address_line || "No address"}{home.postcode ? ` · ${home.postcode}` : ""}</p>
                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  <div className="rounded-xl bg-white/70 p-3"><p className="text-xs text-slate-500">Mid</p><p className="font-bold">{formatMoney(summary.mid)}</p></div>
                  <div className="rounded-xl bg-white/70 p-3"><p className="text-xs text-slate-500">LTV</p><p className="font-bold">{ltv.toFixed(1)}%</p></div>
                  <div className="rounded-xl bg-white/70 p-3"><p className="text-xs text-slate-500">Payment</p><p className="font-bold">{formatMoney(homePayment)}</p></div>
                </div>
                <p className="mt-3 text-xs text-slate-500">Owners: {homeOwners.length > 0 ? homeOwners.map((owner) => personById.get(owner.person_id)?.name ?? "Unknown").join(", ") : "Not assigned"}</p>
              </button>
            );
          })}
          {homes.length === 0 ? <p className="text-sm text-slate-500">No homes added yet. Use the black + button to add your current home.</p> : null}
        </div>
      </SectionCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard title="Valuation sources" description="Store each source separately. Manual low/mid/high on the home acts as an override; otherwise the app calculates a confidence-weighted average.">
          <div className="space-y-3">
            {valuations.map((valuation) => {
              const home = homeById.get(valuation.home_id);
              return (
                <div key={valuation.id} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div><p className="font-bold text-slate-950">{valuation.source_name}</p><p className="text-sm text-slate-500">{home?.label ?? "Home"} · {valuation.source_type.replaceAll("_", " ")} · {valuation.confidence ?? "medium"} confidence</p></div>
                    <div className="flex gap-3"><button onClick={() => setModal({ type: "edit_valuation", valuation })} className="text-sm font-semibold text-slate-700">Edit</button><form action={deleteHomeValuationSource}><input type="hidden" name="id" value={valuation.id} /><button className="text-sm font-medium text-red-600">Delete</button></form></div>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-3">
                    <div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Low</p><p className="font-bold">{formatMoney(valuation.valuation_low)}</p></div>
                    <div className="rounded-2xl bg-orange-50 p-3"><p className="text-xs text-orange-700">Mid</p><p className="font-bold">{formatMoney(valuation.valuation_mid ?? valuation.valuation_amount)}</p></div>
                    <div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs text-slate-500">High</p><p className="font-bold">{formatMoney(valuation.valuation_high)}</p></div>
                  </div>
                  {valuation.source_url ? <a href={valuation.source_url} target="_blank" rel="noreferrer" className="mt-3 block text-xs font-semibold text-orange-600">Open source</a> : null}
                </div>
              );
            })}
            {valuations.length === 0 ? <p className="text-sm text-slate-500">Add Zoopla/manual/agent/Land Registry comparable values here. The home card will average the source values.</p> : null}
          </div>
        </SectionCard>

        <SectionCard title="Mortgages / rates attached to homes" description="Mortgage records are editable, so you can update balances, rate-end dates and direct-debit overrides.">
          <div className="space-y-3">
            {deals.map((deal) => {
              const payment = mortgagePaymentForDeal(deal);
              const projection = projectedMortgageForDeal(deal);
              const home = deal.home_id ? homeById.get(deal.home_id) : null;
              return (
                <div key={deal.id} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
                  <div className={`h-2 bg-gradient-to-r ${lenderAccent(deal.lender)}`} />
                  <div className="grid gap-4 p-5 md:grid-cols-[1.2fr_0.8fr] md:items-center">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{deal.lender || "Mortgage lender"}</p>
                      <h3 className="mt-1 text-xl font-bold text-slate-950">{deal.product_name || deal.rate_type.replaceAll("_", " ")}</h3>
                      <p className="mt-1 text-sm text-slate-500">{home?.label ?? "Unassigned home"} · {deal.interest_rate}% · {deal.term_years} years · {deal.repayment_type?.replaceAll("_", " ") || "repayment"}</p>
                      <p className="mt-2 text-xs text-slate-500">Opened {formatMoney(deal.balance)} on {balanceAsOfLabel(deal)} · {projection.monthsProjected} payment projection(s){deal.initial_period_end ? ` · ${monthsBetweenToday(deal.initial_period_end) ?? 0} months left on deal` : ""}</p>
                    </div>
                    <div className="rounded-3xl bg-slate-950 p-5 text-white">
                      <p className="text-xs font-bold uppercase tracking-wide text-slate-300">Current estimated balance</p>
                      <p className="mt-1 text-3xl font-bold">{formatMoney(projection.projectedBalance)}</p>
                      <p className="mt-2 text-sm text-slate-300">Initial {formatMoney(deal.balance)} · payment {formatMoney(payment)}/mo</p>
                      {deal.initial_period_end ? <p className="mt-1 text-sm text-slate-300">Rate ends {deal.initial_period_end}</p> : null}
                    </div>
                  </div>
                  <div className="flex justify-end gap-3 border-t border-slate-100 px-5 py-3">
                    <button onClick={() => setModal({ type: "edit_mortgage", deal })} className="text-sm font-semibold text-slate-700">Edit</button>
                    <form action={deleteHomeMortgageDeal}><input type="hidden" name="id" value={deal.id} /><button className="text-sm font-medium text-red-600">Delete</button></form>
                  </div>
                </div>
              );
            })}
            {deals.length === 0 ? <p className="text-sm text-slate-500">No mortgage deals attached yet.</p> : null}
          </div>
        </SectionCard>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <StatCard title="Standalone scenarios" value={scenarios.length.toString()} />
        <StatCard title="Latest scenario payment" value={formatMoney(firstPayment)} />
        <StatCard title="Latest with overpayment" value={formatMoney(firstPayment + Number(firstScenario?.monthly_overpayment ?? 0))} />
      </section>

      <SectionCard title="Saved standalone scenarios">
        <div className="grid gap-4 lg:grid-cols-2">
          {scenarios.map((scenario) => {
            const payment = calculateMonthlyMortgagePayment({
              balance: Number(scenario.balance),
              annualInterestRate: Number(scenario.interest_rate),
              termYears: Number(scenario.term_years),
            });
            const totalInterest = estimateTotalInterest({
              balance: Number(scenario.balance),
              annualInterestRate: Number(scenario.interest_rate),
              termYears: Number(scenario.term_years),
            });

            return (
              <div key={scenario.id} className="rounded-2xl border border-slate-200 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-semibold text-slate-950">{scenario.name}</h3>
                    <p className="text-sm text-slate-500">{formatMoney(scenario.balance)} at {scenario.interest_rate}% over {scenario.term_years} years</p>
                  </div>
                  <form action={deleteMortgageScenario}>
                    <input type="hidden" name="id" value={scenario.id} />
                    <button className="text-sm font-medium text-red-600">Delete</button>
                  </form>
                </div>
                <dl className="mt-5 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl bg-slate-50 p-3"><dt className="text-xs text-slate-500">Monthly payment</dt><dd className="text-lg font-bold">{formatMoney(payment)}</dd></div>
                  <div className="rounded-xl bg-slate-50 p-3"><dt className="text-xs text-slate-500">With overpay</dt><dd className="text-lg font-bold">{formatMoney(payment + Number(scenario.monthly_overpayment))}</dd></div>
                  <div className="rounded-xl bg-slate-50 p-3"><dt className="text-xs text-slate-500">Total interest</dt><dd className="text-lg font-bold">{formatMoney(totalInterest)}</dd></div>
                </dl>
              </div>
            );
          })}
          {scenarios.length === 0 ? <p className="text-sm text-slate-500">No scenarios yet. Use the black + button to add one.</p> : null}
        </div>
      </SectionCard>

      {rateResearchOpen ? (
        <RateResearchModal
          targetPrice={movePlanner.target}
          loanRequired={movePlanner.loanRequired}
          ltv={movePlanner.ltv}
          termYears={Number(termYears) || termGuide.maxTerm}
          currentRate={Number(targetRate) || 0}
          maxTermYears={termGuide.maxTerm}
          onSelect={(suggestion) => { setTargetRate(String(suggestion.rate)); setTermYears(String(suggestion.termYears || termYears)); setRateResearchOpen(false); }}
          onClose={() => setRateResearchOpen(false)}
        />
      ) : null}

      {modal?.type === "add_home" ? (
        <Modal title="Add home / address" description="Enter house number and postcode first. The lookup fills address/map fields, then you can add valuation and purchase details." onClose={() => setModal(null)}>
          <HomeForm people={people} owners={owners} action={addHome} />
        </Modal>
      ) : null}
      {modal?.type === "edit_home" ? (
        <Modal title={`Edit ${modal.home.label}`} description="Update address, map fields, owner assignment and valuation assumptions." onClose={() => setModal(null)}>
          <HomeForm people={people} owners={owners} home={modal.home} action={updateHome} />
        </Modal>
      ) : null}
      {modal?.type === "add_mortgage" ? (
        <Modal title="Add mortgage / rate" description="Attach the current balance, rate and deal dates to a home." onClose={() => setModal(null)}>
          <MortgageForm homes={homes} homeId={modal.homeId} action={addHomeMortgageDeal} />
        </Modal>
      ) : null}
      {modal?.type === "edit_mortgage" ? (
        <Modal title="Edit mortgage / rate" description="Update the live balance, rate, payment override or rate-end date." onClose={() => setModal(null)}>
          <MortgageForm homes={homes} deal={modal.deal} action={updateHomeMortgageDeal} />
        </Modal>
      ) : null}
      {modal?.type === "add_valuation" ? (
        <Modal title="Add valuation source" description="Add a low/mid/high estimate from an agent, portal, sold-price comparable or your own estimate." onClose={() => setModal(null)}>
          <ValuationForm homes={homes} homeId={modal.homeId} action={addHomeValuationSource} />
        </Modal>
      ) : null}
      {modal?.type === "edit_valuation" ? (
        <Modal title="Edit valuation source" description="Update this source without losing the source trail." onClose={() => setModal(null)}>
          <ValuationForm homes={homes} valuation={modal.valuation} action={updateHomeValuationSource} />
        </Modal>
      ) : null}
      {modal?.type === "add_scenario" ? (
        <Modal title="Add standalone mortgage scenario" description="For one-off comparisons that do not need to attach to a home." onClose={() => setModal(null)}>
          <ScenarioForm />
        </Modal>
      ) : null}
    </main>
  );
}
