"use client";

import { useState } from "react";
import { SubmitButton } from "@/components/SubmitButton";
import type { Home, HomeOwner, Person } from "@/components/mortgage/MortgagePlannerClient";

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

const inputClass = "mt-1 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-950 placeholder:text-slate-400 outline-none ring-orange-500 focus:border-orange-400 focus:ring-2";

function currentDate() {
  return new Date().toISOString().slice(0, 10);
}
function numberValue(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "";
  return String(value);
}

function ControlledField({ label, name, value, onChange, type = "text", placeholder, step, required }: { label: string; name: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string; step?: string; required?: boolean }) {
  return (
    <label className="block">
      <span className="text-sm font-black text-slate-700">{label}</span>
      <input name={name} type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder || (type === "number" ? "0" : type === "date" ? undefined : `Enter ${label.toLowerCase()}`)} step={step} required={required} className={inputClass} />
    </label>
  );
}
function TextField({ label, name, defaultValue, type = "text", placeholder }: { label: string; name: string; defaultValue?: string | number | null; type?: string; placeholder?: string }) {
  return (
    <label className="block">
      <span className="text-sm font-black text-slate-700">{label}</span>
      <input name={name} type={type} defaultValue={defaultValue ?? ""} placeholder={placeholder} className={inputClass} />
    </label>
  );
}
function SelectField({ label, name, defaultValue, children }: { label: string; name: string; defaultValue?: string | number | null; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-black text-slate-700">{label}</span>
      <select name={name} defaultValue={defaultValue ?? ""} className={inputClass}>
        {children}
      </select>
    </label>
  );
}

type StepId = "address" | "identity" | "map" | "purchase" | "valuation" | "extra" | "owners";
const STEPS: { id: StepId; label: string }[] = [
  { id: "address", label: "Find address" },
  { id: "identity", label: "Name & status" },
  { id: "map", label: "Map location" },
  { id: "purchase", label: "Purchase" },
  { id: "valuation", label: "Valuation" },
  { id: "extra", label: "Extra details" },
  { id: "owners", label: "Household" },
];

// NOTE: the original form derived a fallback Google Maps search URL from
// address parts when a home had no saved map_url. This wizard keeps it
// simple and just uses the saved map_url when editing — a small,
// deliberate simplification, not a logic regression for new homes (which
// never have one yet anyway).
export function HomeWizard({ people, owners, home, action }: { people: Person[]; owners: HomeOwner[]; home?: Home; action: (formData: FormData) => void | Promise<void> }) {
  const ownersForHome = owners.filter((owner) => owner.home_id === home?.id);
  const assignedOwners = new Set(ownersForHome.map((owner) => owner.person_id));
  const ownerPercentByPerson = new Map(ownersForHome.map((owner) => [owner.person_id, owner.ownership_percent]));

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
  const [mapUrl, setMapUrl] = useState(home?.map_url ?? "");
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
  const [stepIndex, setStepIndex] = useState(0);

  const currentStepId = STEPS[stepIndex].id;
  const isLastStep = stepIndex === STEPS.length - 1;

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
    <form
      action={action}
      onSubmit={() => {
        if (!home) window.localStorage.setItem("loop:addMortgageAfterHome", "1");
      }}
      className="space-y-5"
    >
      {home ? <input type="hidden" name="id" value={home.id} /> : null}
      <input type="hidden" name="lookup_source" value={lookupSource} />
      <input type="hidden" name="last_lookup_at" value={lastLookupAt} />
      <input type="hidden" name="property_value" value={midEstimate || purchasePrice || "0"} />
      <input type="hidden" name="map_url" value={mapUrl} />

      <div className="rounded-3xl bg-slate-50 p-3 ring-1 ring-slate-100">
        <div className="mb-2 flex items-center gap-1.5">
          {STEPS.map((step, i) => (
            <div key={step.id} className={`h-1 flex-1 rounded-full ${i <= stepIndex ? "bg-orange-400" : "bg-slate-200"}`} />
          ))}
        </div>
        <p className="text-xs font-black uppercase tracking-wide text-slate-400">
          {STEPS[stepIndex].label} · Step {stepIndex + 1} of {STEPS.length}
        </p>
      </div>

      <div style={{ display: currentStepId === "address" ? "block" : "none" }} className="rounded-3xl border border-orange-200 bg-orange-50/50 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <ControlledField label="House number/name" name="house_number" value={houseNumber} onChange={setHouseNumber} placeholder="8" />
          <ControlledField label="Postcode" name="postcode" value={postcode} onChange={setPostcode} placeholder="WA5 8AT" required />
          <button type="button" onClick={runLookup} disabled={lookupBusy || !postcode} className="rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {lookupBusy ? "Looking up..." : "Find address"}
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500">Fast mode: enter house number and postcode to fill the fields ahead automatically.</p>
        {lookupMessage ? <div className="mt-3 rounded-2xl bg-white px-3 py-2 text-sm text-slate-600">{lookupMessage}</div> : null}
      </div>

      <div style={{ display: currentStepId === "identity" ? "block" : "none" }} className="grid gap-4 md:grid-cols-2">
        <ControlledField label="Home label" name="label" value={label} onChange={setLabel} placeholder="Current home, next house" required />
        <SelectField label="Status" name="ownership_status" defaultValue={home?.ownership_status ?? "current_home"}>
          <option value="current_home">Current home</option>
          <option value="watchlist">Watchlist</option>
          <option value="sold">Sold / historic</option>
        </SelectField>
        <ControlledField label="Address line" name="address_line" value={addressLine} onChange={setAddressLine} placeholder="Street or house name" />
        <ControlledField label="Full address" name="full_address" value={fullAddress} onChange={setFullAddress} placeholder="Full address from lookup" />
        <ControlledField label="Town / city" name="city" value={city} onChange={setCity} />
        <ControlledField label="Region" name="region" value={region} onChange={setRegion} placeholder="Cheshire, Greater Manchester" />
        <ControlledField label="Country" name="country" value={country} onChange={setCountry} />
      </div>

      <div style={{ display: currentStepId === "map" ? "block" : "none" }} className="grid gap-4 md:grid-cols-2">
        <ControlledField label="Latitude" name="latitude" type="number" step="0.0000001" value={latitude} onChange={setLatitude} />
        <ControlledField label="Longitude" name="longitude" type="number" step="0.0000001" value={longitude} onChange={setLongitude} />
        <label className="block md:col-span-2">
          <span className="text-sm font-black text-slate-700">Map URL</span>
          <input value={mapUrl} onChange={(event) => setMapUrl(event.target.value)} placeholder="Generated by lookup or paste Google Maps link" className={inputClass} />
        </label>
      </div>

      <div style={{ display: currentStepId === "purchase" ? "block" : "none" }} className="grid gap-4 md:grid-cols-2">
        <ControlledField label="Purchase price" name="purchase_price" type="number" step="0.01" value={purchasePrice} onChange={setPurchasePrice} />
        <ControlledField label="Purchase date" name="purchase_date" type="date" value={purchaseDate} onChange={setPurchaseDate} />
        <ControlledField label="Purchase source URL" name="purchase_source_url" value={purchaseSourceUrl} onChange={setPurchaseSourceUrl} placeholder="Land Registry/search/listing URL" />
      </div>

      <div style={{ display: currentStepId === "valuation" ? "block" : "none" }} className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">
          <button type="button" onClick={seedValuationFromPurchase} className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700">
            Seed low/mid/high from purchase price
          </button>
        </div>
        <ControlledField label="Low estimate" name="estimated_value_low" type="number" step="0.01" value={lowEstimate} onChange={setLowEstimate} placeholder="Low valuation" />
        <ControlledField label="Mid estimate" name="estimated_value_mid" type="number" step="0.01" value={midEstimate} onChange={setMidEstimate} placeholder="Expected valuation" />
        <ControlledField label="High estimate" name="estimated_value_high" type="number" step="0.01" value={highEstimate} onChange={setHighEstimate} placeholder="High valuation" />
        <TextField label="Valuation checked" name="estimated_value_date" type="date" defaultValue={home?.estimated_value_date ?? currentDate()} />
      </div>

      <div style={{ display: currentStepId === "extra" ? "block" : "none" }} className="grid gap-4 md:grid-cols-2">
        <TextField label="Property type" name="property_type" defaultValue={home?.property_type} placeholder="Detached, semi, terrace" />
        <TextField label="UPRN / provider ID" name="uprn" defaultValue={home?.uprn} placeholder="Optional address ID" />
        <TextField label="Notes" name="notes" defaultValue={home?.notes} placeholder="Valuation source, Rightmove link, assumptions" />
      </div>

      <div style={{ display: currentStepId === "owners" ? "block" : "none" }}>
        <p className="text-sm font-medium text-slate-700">Assign to household</p>
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          {people.map((person) => {
            const defaultPercent = ownerPercentByPerson.get(person.id);
            return (
              <label key={person.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                <span className="flex items-center gap-2">
                  <input type="checkbox" name="owner_ids" value={person.id} defaultChecked={assignedOwners.has(person.id)} />
                  <span>
                    {person.name} <span className="text-xs capitalize text-slate-400">({person.relationship})</span>
                  </span>
                </span>
                <input name={`owner_percent_${person.id}`} type="number" min="0" max="100" step="0.01" defaultValue={numberValue(defaultPercent)} placeholder="Auto split" className="mt-2 w-full rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700" />
              </label>
            );
          })}
          {people.length === 0 ? <p className="text-sm text-slate-500">Add people in Household first if you want ownership attached.</p> : null}
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 pt-4">
        <button type="button" onClick={() => setStepIndex((i) => Math.max(0, i - 1))} disabled={stepIndex === 0} className="text-sm font-black text-slate-500 hover:text-slate-900 disabled:opacity-30">
          ← Back
        </button>
        {isLastStep ? (
          <SubmitButton>{home ? "Save home" : "Add home"}</SubmitButton>
        ) : (
          <button type="button" onClick={() => setStepIndex((i) => Math.min(STEPS.length - 1, i + 1))} className="rounded-full bg-orange-500 px-5 py-2.5 text-sm font-black text-white hover:bg-orange-600">
            Next →
          </button>
        )}
      </div>
    </form>
  );
}
