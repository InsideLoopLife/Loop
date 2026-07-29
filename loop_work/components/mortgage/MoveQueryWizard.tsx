"use client";

import { useState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import type { Home } from "@/components/mortgage/MortgagePlannerClient";
import { addPropertyMoveQuery } from "@/app/mortgage/actions";

const inputClass = "mt-1 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-950 placeholder:text-slate-400 outline-none ring-orange-500 focus:border-orange-400 focus:ring-2";

function ControlledField({ label, name, value, onChange, type = "text", placeholder, step, required }: { label: string; name: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string; step?: string; required?: boolean }) {
  return (
    <label className="block">
      <span className="text-sm font-black text-slate-700">{label}</span>
      <input name={name} type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} step={step} required={required} className={inputClass} />
    </label>
  );
}
function SelectField({ label, name, defaultValue, value, onChange, children }: { label: string; name: string; defaultValue?: string; value?: string; onChange?: (value: string) => void; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-black text-slate-700">{label}</span>
      <select name={name} defaultValue={onChange ? undefined : defaultValue ?? ""} value={onChange ? value : undefined} onChange={onChange ? (event) => onChange(event.target.value) : undefined} className={inputClass}>
        {children}
      </select>
    </label>
  );
}
function TextField({ label, name, placeholder }: { label: string; name: string; placeholder?: string }) {
  return (
    <label className="block">
      <span className="text-sm font-black text-slate-700">{label}</span>
      <input name={name} placeholder={placeholder} className={inputClass} />
    </label>
  );
}

type StepId = "search" | "price-location" | "finance" | "running-costs" | "compare-notes";
const STEPS: { id: StepId; label: string }[] = [
  { id: "search", label: "Search a listing" },
  { id: "price-location", label: "Price & location" },
  { id: "finance", label: "Finance assumptions" },
  { id: "running-costs", label: "Running costs" },
  { id: "compare-notes", label: "Compare & notes" },
];

export function MoveQueryWizard({ homes }: { homes: Home[] }) {
  const [title, setTitle] = useState("");
  const [propertyUrl, setPropertyUrl] = useState("");
  const [askingPrice, setAskingPrice] = useState("");
  const [postcode, setPostcode] = useState("");
  const [addressHint, setAddressHint] = useState("");
  const [bedrooms, setBedrooms] = useState("");
  const [councilTaxBand, setCouncilTaxBand] = useState("");
  const [epcRating, setEpcRating] = useState("");
  const [targetDeposit, setTargetDeposit] = useState("");
  const [expectedRate, setExpectedRate] = useState("4.75");
  const [expectedTermYears, setExpectedTermYears] = useState("30");
  const [movingCosts, setMovingCosts] = useState("4000");
  const [councilTaxAnnual, setCouncilTaxAnnual] = useState("");
  const [heatingMonthly, setHeatingMonthly] = useState("");
  const [purchaseContext, setPurchaseContext] = useState("primary_home");
  const [councilTaxSourceUrl, setCouncilTaxSourceUrl] = useState("");
  const [councilTaxAuthority, setCouncilTaxAuthority] = useState("");
  const [mapEmbedUrl, setMapEmbedUrl] = useState("");
  const [mapLatitude, setMapLatitude] = useState("");
  const [mapLongitude, setMapLongitude] = useState("");
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupMessage, setLookupMessage] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);

  const currentStepId = STEPS[stepIndex].id;
  const isLastStep = stepIndex === STEPS.length - 1;

  async function runListingLookup() {
    if (!propertyUrl.trim()) {
      setLookupMessage("Paste a Rightmove, Zoopla or OnTheMarket URL first.");
      return;
    }
    setLookupBusy(true);
    setLookupMessage(null);
    try {
      const response = await fetch("/api/property/move-query/enrich", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: propertyUrl, asking_price: askingPrice, target_deposit: targetDeposit, expected_rate: expectedRate, expected_term_years: expectedTermYears, purchase_context: purchaseContext }),
      });
      const data = await response.json();
      if (!response.ok || data.error) throw new Error(data.error || "Listing lookup failed");
      const parsed = data.parsed || {};
      const assumptions = data.assumptions || {};
      if (parsed.cleanTitle || parsed.title) setTitle(parsed.cleanTitle || parsed.title);
      if (parsed.askingPrice) setAskingPrice(String(Math.round(Number(parsed.askingPrice))));
      if (parsed.postcode) setPostcode(parsed.postcode);
      if (parsed.addressHint) setAddressHint(parsed.addressHint);
      if (parsed.bedrooms) setBedrooms(String(parsed.bedrooms));
      if (parsed.councilTaxBand) setCouncilTaxBand(parsed.councilTaxBand);
      if (parsed.councilTaxSourceUrl) setCouncilTaxSourceUrl(parsed.councilTaxSourceUrl);
      if (parsed.councilTaxAuthority) setCouncilTaxAuthority(parsed.councilTaxAuthority);
      if (parsed.mapEmbedUrl) setMapEmbedUrl(parsed.mapEmbedUrl);
      if (parsed.mapLatitude) setMapLatitude(String(parsed.mapLatitude));
      if (parsed.mapLongitude) setMapLongitude(String(parsed.mapLongitude));
      if (parsed.epcRating) setEpcRating(parsed.epcRating);
      if (assumptions.movingCostEstimate) setMovingCosts(String(Math.round(Number(assumptions.movingCostEstimate))));
      if (assumptions.heatingMonthly) setHeatingMonthly(String(Math.round(Number(assumptions.heatingMonthly))));
      if (assumptions.councilTaxAnnual) setCouncilTaxAnnual(String(Math.round(Number(assumptions.councilTaxAnnual))));
      const confidence = Number(parsed.sourceConfidence || 0);
      setLookupMessage(
        parsed.sourceStatus === "url_ingested"
          ? `Listing found${confidence ? ` (${confidence}% source confidence)` : ""}. Check the filled fields, then save.`
          : "URL checked, but only partial data was found. Add the missing fields before saving.",
      );
    } catch (error: any) {
      setLookupMessage(error?.message || "Could not read that property URL. You can still paste the URL and add the figures manually.");
    } finally {
      setLookupBusy(false);
    }
  }

  return (
    <form action={addPropertyMoveQuery} className="space-y-5">
      <input type="hidden" name="council_tax_source_url" value={councilTaxSourceUrl} />
      <input type="hidden" name="council_tax_authority" value={councilTaxAuthority} />
      <input type="hidden" name="map_embed_url" value={mapEmbedUrl} />
      <input type="hidden" name="map_latitude" value={mapLatitude} />
      <input type="hidden" name="map_longitude" value={mapLongitude} />

      <div className="rounded-3xl bg-slate-50 p-3 ring-1 ring-slate-100">
        <div className="mb-2 flex items-center gap-1.5">
          {STEPS.map((step, i) => (
            <div key={step.id} className={`h-1 flex-1 rounded-full ${i <= stepIndex ? "bg-blue-400" : "bg-slate-200"}`} />
          ))}
        </div>
        <p className="text-xs font-black uppercase tracking-wide text-slate-400">
          {STEPS[stepIndex].label} · Step {stepIndex + 1} of {STEPS.length}
        </p>
      </div>

      <div style={{ display: currentStepId === "search" ? "block" : "none" }} className="space-y-4">
        <div className="rounded-3xl border border-blue-200 bg-blue-50 p-4">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-700">I'm looking at houses</p>
          <h3 className="mt-2 text-xl font-black text-slate-950">Save a property search or rough target price</h3>
          <p className="mt-1 text-sm font-bold text-slate-600">Paste a listing URL where you have one. LOOP stores the source, then the enrichment layer can add council tax, EPC/energy assumptions, stamp duty, mortgage estimate and affordability scoring.</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <label className="block">
            <span className="text-sm font-black text-slate-700">Property URL search</span>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input name="property_url" value={propertyUrl} onChange={(event) => setPropertyUrl(event.target.value)} placeholder="Paste Rightmove, Zoopla or OnTheMarket URL" className={inputClass} />
              <button type="button" onClick={runListingLookup} disabled={lookupBusy} className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white disabled:opacity-60">
                {lookupBusy ? "Searching..." : "Search & fill"}
              </button>
            </div>
          </label>
          {lookupMessage ? <p className="mt-2 text-xs font-bold text-slate-500">{lookupMessage}</p> : null}
        </div>
        <SelectField label="Buying scenario" name="purchase_context" value={purchaseContext} onChange={setPurchaseContext}>
          <option value="primary_home">Main home / replacing current home</option>
          <option value="second_home">Second property</option>
          <option value="buy_to_let">Buy-to-let / investment property</option>
        </SelectField>
        <ControlledField label="Search name" name="title" value={title} onChange={setTitle} placeholder="Marsh Brook Close, Rixton" required />
      </div>

      <div style={{ display: currentStepId === "price-location" ? "block" : "none" }} className="grid gap-4 md:grid-cols-2">
        <ControlledField label="Rough / asking price" name="asking_price" value={askingPrice} onChange={setAskingPrice} type="number" step="0.01" placeholder="550000" />
        <ControlledField label="Postcode / area" name="postcode" value={postcode} onChange={setPostcode} placeholder="WA5, York, Harrogate" />
        <ControlledField label="Address hint" name="address_hint" value={addressHint} onChange={setAddressHint} placeholder="Street, estate, village" />
        <ControlledField label="Bedrooms" name="bedrooms" value={bedrooms} onChange={setBedrooms} type="number" step="1" />
      </div>

      <div style={{ display: currentStepId === "finance" ? "block" : "none" }} className="grid gap-4 md:grid-cols-2">
        <ControlledField label="Deposit / equity to use" name="target_deposit" value={targetDeposit} onChange={setTargetDeposit} type="number" step="0.01" placeholder="Equity + cash after costs" />
        <ControlledField label="Expected rate %" name="expected_rate" value={expectedRate} onChange={setExpectedRate} type="number" step="0.001" />
        <ControlledField label="Term years" name="expected_term_years" value={expectedTermYears} onChange={setExpectedTermYears} type="number" step="1" />
        <ControlledField label="Moving costs" name="moving_cost_estimate" value={movingCosts} onChange={setMovingCosts} type="number" step="0.01" placeholder="Default is 1.2% of price, capped £3k-£12k" />
      </div>

      <div style={{ display: currentStepId === "running-costs" ? "block" : "none" }} className="grid gap-4 md:grid-cols-2">
        <ControlledField label="Council tax band" name="council_tax_band" value={councilTaxBand} onChange={setCouncilTaxBand} placeholder="Optional until source lookup" />
        <ControlledField label="Council tax £/year" name="council_tax_estimate_annual" value={councilTaxAnnual} onChange={setCouncilTaxAnnual} type="number" step="0.01" />
        <ControlledField label="EPC rating" name="epc_rating" value={epcRating} onChange={setEpcRating} placeholder="A-G" />
        <ControlledField label="Energy / heating £/mo" name="expected_heating_cost_monthly" value={heatingMonthly} onChange={setHeatingMonthly} type="number" step="0.01" />
        <p className="md:col-span-2 rounded-2xl bg-slate-50 px-4 py-3 text-xs font-bold text-slate-600">
          Mortgage estimate uses asking price minus deposit/equity, the selected rate and term. Council tax uses the listing band first; if the local council annual amount isn't available yet, LOOP shows the band and marks the annual amount as an estimate until confirmed.
        </p>
      </div>

      <div style={{ display: currentStepId === "compare-notes" ? "block" : "none" }} className="grid gap-4 md:grid-cols-2">
        <SelectField label="Compare against current home" name="home_id" defaultValue={homes[0]?.id ?? ""}>
          <option value="">No current home comparison</option>
          {homes.map((home) => (
            <option key={home.id} value={home.id}>
              {home.label}
            </option>
          ))}
        </SelectField>
        <TextField label="Notes" name="notes" placeholder="School, commute, renovation risk, offer notes" />
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 pt-4">
        <button type="button" onClick={() => setStepIndex((i) => Math.max(0, i - 1))} disabled={stepIndex === 0} className="text-sm font-black text-slate-500 hover:text-slate-900 disabled:opacity-30">
          ← Back
        </button>
        {isLastStep ? (
          <SubmitButton>Save moving search</SubmitButton>
        ) : (
          <button type="button" onClick={() => setStepIndex((i) => Math.min(STEPS.length - 1, i + 1))} className="rounded-full bg-blue-500 px-5 py-2.5 text-sm font-black text-white hover:bg-blue-600">
            Next →
          </button>
        )}
      </div>
    </form>
  );
}
