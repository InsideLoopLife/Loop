"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, ChartNoAxesColumnIncreasing, CloudSun, Coins, Droplets, Home, Lightbulb, PiggyBank, PlugZap, Sparkles, UsersRound, WalletCards, X } from "lucide-react";
import { SafeAvatar } from "@/components/SafeAvatar";
import { formatMoney } from "@/lib/format/money";
import type { HouseholdOverviewModel, HouseholdOverviewPerson } from "@/lib/household/household-overview-model";
import { addHouseholdPet, addHouseholdVehicle, adoptHouseholdFoodAssumption, createManagedChildProfile, saveHouseholdCarbonProfile } from "@/app/household/actions";

type HouseholdShape = {
  name?: string | null;
  image_url?: string | null;
};

type HouseholdPet = { id: string; name: string; species?: string | null; breed?: string | null; birth_date?: string | null; insurer?: string | null; vet_name?: string | null };
type HouseholdVehicle = { id: string; name: string; registration?: string | null; owner_person_id?: string | null; make_model?: string | null; fuel_type?: string | null; annual_miles?: number | null; mpg?: number | null; insurer?: string | null };
type CarbonProfile = { food_assumption_adopted?: boolean | null; annual_offset_kg?: number | null; offset_provider?: string | null; offset_notes?: string | null };

function petIcon(species?: string | null) {
  const value = String(species || "other").toLowerCase();
  if (value === "dog") return "🐕";
  if (value === "cat") return "🐈";
  if (value === "fish") return "🐟";
  if (value === "rabbit") return "🐇";
  if (value === "bird") return "🐦";
  if (value === "horse") return "🐴";
  if (value === "reptile") return "🦎";
  return "🐾";
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return <div className="fixed inset-0 z-[200] grid place-items-center bg-slate-950/55 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-[2.25rem] bg-white p-6 shadow-2xl"><div className="flex items-center justify-between gap-4"><h2 className="text-2xl font-black text-slate-950">{title}</h2><button type="button" onClick={onClose} className="grid h-10 w-10 place-items-center rounded-full bg-slate-100"><X className="h-5 w-5" /></button></div>{children}</section></div>;
}

const fieldClass = "mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold";

function VehicleForm({ people, onBack }: { people: HouseholdOverviewPerson[]; onBack: () => void }) {
  const [registration, setRegistration] = useState("");
  const [makeModel, setMakeModel] = useState("");
  const [fuelType, setFuelType] = useState("petrol");
  const [lookupMessage, setLookupMessage] = useState("");
  const [checking, setChecking] = useState(false);
  const checkRegistration = async () => {
    setChecking(true); setLookupMessage("");
    try {
      const response = await fetch(`/api/household/vehicle-lookup?registration=${encodeURIComponent(registration)}`);
      const payload = await response.json();
      if (payload.vehicle) {
        setMakeModel([payload.vehicle.make, payload.vehicle.model].filter(Boolean).join(" "));
        if (payload.vehicle.fuel_type) setFuelType(payload.vehicle.fuel_type.includes("electric") ? "electric" : payload.vehicle.fuel_type.includes("diesel") ? "diesel" : payload.vehicle.fuel_type.includes("hybrid") ? "hybrid" : "petrol");
      }
      setLookupMessage(payload.message || payload.error || "Check the returned details manually.");
    } catch { setLookupMessage("Lookup unavailable. Enter and check the vehicle manually."); }
    finally { setChecking(false); }
  };
  return <form action={addHouseholdVehicle} className="mt-5 grid gap-4 sm:grid-cols-2"><div className="sm:col-span-2 rounded-2xl bg-sky-50 p-4"><p className="font-black text-sky-950">Start with the registration</p><div className="mt-2 flex gap-2"><input name="registration" value={registration} onChange={(event) => setRegistration(event.target.value.toUpperCase())} placeholder="AB12 CDE" required className={`${fieldClass} mt-0 uppercase`} /><button type="button" onClick={checkRegistration} disabled={!registration || checking} className="rounded-2xl bg-sky-700 px-4 py-2 text-sm font-black text-white disabled:opacity-40">{checking ? "Checking…" : "Look up"}</button></div>{lookupMessage ? <p className="mt-2 text-xs font-bold text-sky-800">{lookupMessage}</p> : null}</div><label className="font-black">Vehicle name<input name="name" placeholder="Dan's car" required className={fieldClass} /></label><label className="font-black">Usually driven by<select name="owner_person_id" className={fieldClass}><option value="">Household / shared</option>{people.filter((person) => String(person.relationship).toLowerCase() !== "child").map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label><label className="font-black">Make / model<input name="make_model" value={makeModel} onChange={(event) => setMakeModel(event.target.value)} placeholder="Confirm manually" className={fieldClass} /></label><label className="font-black">Fuel type<select name="fuel_type" value={fuelType} onChange={(event) => setFuelType(event.target.value)} className={fieldClass}><option value="petrol">Petrol</option><option value="diesel">Diesel</option><option value="hybrid">Hybrid</option><option value="phev">Plug-in hybrid</option><option value="electric">Electric</option></select></label><label className="font-black">Annual mileage<input name="annual_miles" type="number" min="0" className={fieldClass} /></label><label className="font-black">Real-world MPG <span className="font-semibold text-slate-400">manual check</span><input name="mpg" type="number" min="0" step="0.1" className={fieldClass} /></label><label className="font-black">Monthly finance / lease<input name="monthly_finance" type="number" min="0" step="0.01" className={fieldClass} /></label><details className="sm:col-span-2 rounded-2xl border border-slate-200 p-4"><summary className="cursor-pointer font-black">Insurance watch details</summary><div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="font-black">Insurer<input name="insurer" className={fieldClass} /></label><label className="font-black">Renewal date<input name="insurance_renewal_date" type="date" className={fieldClass} /></label></div></details><div className="flex justify-between sm:col-span-2"><button type="button" onClick={onBack} className="rounded-2xl bg-slate-100 px-5 py-3 font-black">Back</button><button className="rounded-2xl bg-slate-950 px-5 py-3 font-black text-white">Confirm vehicle</button></div></form>;
}

function formatKg(value: number) {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}t CO₂e`;
  return `${Math.round(value).toLocaleString()}kg CO₂e`;
}

function metricTone(score: number) {
  if (score >= 75) return "from-emerald-300/35 to-emerald-500/10 text-emerald-900";
  if (score >= 50) return "from-amber-300/35 to-orange-500/10 text-orange-900";
  return "from-red-300/30 to-orange-500/10 text-red-900";
}

function StatTile({ label, value, helper, icon: Icon }: { label: string; value: string; helper: string; icon: any }) {
  return (
    <article className="rounded-[1.7rem] border border-white/80 bg-white/90 p-5 shadow-[0_24px_80px_-55px_rgba(15,23,42,.8)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">{label}</p>
          <p className="mt-2 text-3xl font-black tracking-tight text-slate-950">{value}</p>
          <p className="mt-1 text-sm font-semibold text-slate-500">{helper}</p>
        </div>
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-700">
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </article>
  );
}

function BarRow({ label, amount, percent, tone = "emerald", helper }: { label: string; amount: number; percent: number; tone?: "emerald" | "orange" | "blue" | "slate"; helper?: string }) {
  const colours = {
    emerald: "bg-emerald-400",
    orange: "bg-orange-400",
    blue: "bg-sky-400",
    slate: "bg-slate-400",
  };
  return (
    <div className="grid gap-2 rounded-2xl border border-slate-100 bg-white/65 p-3 sm:grid-cols-[minmax(0,1fr)_110px_90px] sm:items-center">
      <div className="min-w-0">
        <p className="truncate text-sm font-black text-slate-900">{label}</p>
        {helper ? <p className="truncate text-xs font-bold text-slate-500">{helper}</p> : null}
      </div>
      <p className="text-sm font-black text-slate-950 sm:text-right">{formatMoney(amount)}</p>
      <div className="flex items-center gap-2">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${colours[tone]}`} style={{ width: `${Math.max(3, Math.min(100, percent))}%` }} /></div>
        <span className="w-9 text-right text-xs font-black text-slate-500">{percent}%</span>
      </div>
    </div>
  );
}

function FamilyToken({ person, index }: { person: HouseholdOverviewPerson; index: number }) {
  const isChild = String(person.relationship || "").toLowerCase() === "child";
  const childIcons = ["🦊", "🦖", "🐢", "🚀", "⭐", "🧸"];
  return (
    <Link href={`/household/${person.id}`} className="group relative flex flex-col items-center gap-2 rounded-3xl p-2 transition hover:bg-white hover:shadow-sm" title={`Open ${person.name}'s profile`}>
      <SafeAvatar
        src={person.avatar_url || null}
        name={person.name || "Profile"}
        className={`h-16 w-16 rounded-3xl shadow-sm ring-4 ${isChild ? "ring-sky-100" : "ring-orange-100"}`}
        fallbackClassName={`${isChild ? "bg-sky-50 text-sky-800" : "bg-orange-50 text-orange-800"} text-2xl`}
      />
      {!person.avatar_url && isChild ? <span className="absolute top-4 text-xl">{childIcons[index % childIcons.length]}</span> : null}
      <p className="max-w-[120px] truncate text-center text-xs font-black text-slate-700">{person.name}</p>
      <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${isChild ? "bg-sky-100 text-sky-700" : "bg-orange-100 text-orange-700"}`}>{person.relationship || "member"}</span>
    </Link>
  );
}

function PetToken({ pet }: { pet: HouseholdPet }) {
  const age = pet.birth_date ? Math.max(0, Math.floor((Date.now() - new Date(`${pet.birth_date}T12:00:00`).getTime()) / 31_556_952_000)) : null;
  return (
    <Link href="/spending/categories" className="flex flex-col items-center gap-2 transition hover:-translate-y-0.5">
      <span className="grid h-16 w-16 place-items-center rounded-3xl bg-emerald-50 text-3xl shadow-sm ring-4 ring-emerald-100" title={`${pet.species || "Pet"}${age !== null ? ` · age ${age}` : ""} — view bills`}>{petIcon(pet.species)}</span>
      <p className="max-w-[120px] truncate text-center text-xs font-black text-slate-700">{pet.name}</p>
      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black uppercase text-emerald-700">{pet.species || "pet"}{age !== null ? ` · ${age}y` : ""}</span>
    </Link>
  );
}

function PotsPreview({ model }: { model: HouseholdOverviewModel }) {
  const pots = model.kidsPots.length ? model.kidsPots : model.allPots.slice(0, 3);
  return (
    <div className="rounded-[2rem] border border-white/80 bg-white/80 p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">Pots</p>
          <h3 className="mt-1 text-xl font-black text-slate-950">{model.kidsPots.length ? "Kids pots" : "Household pots"}</h3>
          <p className="mt-1 text-sm font-semibold text-slate-500">{pots.length ? "Goal pots that need household attention." : "Create pots for holidays, school, car, emergency funds and more."}</p>
        </div>
        <PiggyBank className="h-6 w-6 text-emerald-600" />
      </div>
      <div className="mt-4 space-y-3">
        {pots.map((pot) => (
          <div key={pot.id} className="rounded-2xl bg-slate-50 p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-black text-slate-900">{pot.icon || "🎯"} {pot.label}</p>
              <p className="text-sm font-black text-slate-950">{pot.percent}%</p>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white"><div className="h-full rounded-full bg-emerald-400" style={{ width: `${Math.min(100, Math.max(2, pot.percent))}%` }} /></div>
            <p className="mt-1 text-xs font-bold text-slate-500">{formatMoney(pot.amount)}{pot.target > 0 ? ` of ${formatMoney(pot.target)}` : " allocated"}</p>
          </div>
        ))}
        {!pots.length ? <Link href="/accounts?tab=pots" className="inline-flex rounded-full bg-slate-950 px-4 py-2 text-xs font-black text-white">Create first pot</Link> : null}
      </div>
    </div>
  );
}

function guidanceTone(status: string) {
  if (status === "above") return "border-orange-200 bg-orange-50 text-orange-900";
  if (status === "below") return "border-sky-200 bg-sky-50 text-sky-900";
  if (status === "inside") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function GuidanceRowCard({ row, onAdopt }: { row: HouseholdOverviewModel["variableSpendGuidance"][number]; onAdopt?: () => void }) {
  const max = Math.max(row.actual, row.benchmarkHigh, 1);
  const actualLeft = Math.min(100, Math.max(0, (row.actual / max) * 100));
  const bandLeft = Math.min(100, Math.max(0, (row.benchmarkLow / max) * 100));
  const bandWidth = Math.min(100 - bandLeft, Math.max(4, ((row.benchmarkHigh - row.benchmarkLow) / max) * 100));
  const statusLabel = row.assumptionAdopted ? "Assumption adopted" : row.status === "above" ? "Above band" : row.status === "below" ? "Below band" : row.status === "inside" ? "Inside band" : "Adopt assumptions";

  return (
    <div className="rounded-[1.4rem] border border-slate-100 bg-white/75 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-slate-950">{row.label}</p>
          <p className="mt-1 text-xs font-bold text-slate-500">{row.helper}</p>
        </div>
        {row.status === "no_data" && onAdopt ? <button type="button" onClick={onAdopt} className={`rounded-full border px-3 py-1 text-[11px] font-black ${guidanceTone(row.status)}`}>{statusLabel} →</button> : <span className={`rounded-full border px-3 py-1 text-[11px] font-black ${guidanceTone(row.status)}`}>{statusLabel}</span>}
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-[120px_1fr_155px] md:items-center">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-slate-400">{row.actual > 0 ? "Actual" : row.assumptionAdopted ? "Assumed" : "Actual"}</p>
          <p className="text-xl font-black text-slate-950">{row.actual > 0 ? formatMoney(row.actual) : row.assumptionAdopted ? formatMoney(row.benchmarkTypical) : "Not logged"}</p>
        </div>
        <div>
          <div className="relative h-4 rounded-full bg-slate-100">
            <div className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-emerald-200" style={{ left: `${bandLeft}%`, width: `${bandWidth}%` }} />
            {row.actual > 0 ? <div className="absolute top-1/2 h-6 w-1.5 -translate-y-1/2 rounded-full bg-slate-950 shadow" style={{ left: `${actualLeft}%` }} /> : null}
          </div>
          <div className="mt-1 flex justify-between text-[11px] font-black text-slate-400">
            <span>{formatMoney(row.benchmarkLow)}</span>
            <span>typical {formatMoney(row.benchmarkTypical)}</span>
            <span>{formatMoney(row.benchmarkHigh)}</span>
          </div>
        </div>
        <div className="rounded-2xl bg-slate-50 p-3">
          <p className="text-xs font-black uppercase tracking-wide text-slate-400">Logic</p>
          <p className="mt-1 text-xs font-bold leading-5 text-slate-600">{row.assumptions.slice(0, 2).join(" · ")}</p>
        </div>
      </div>
    </div>
  );
}

function HouseholdPlanningGuidance({ model, onSelect }: { model: HouseholdOverviewModel; onSelect: (row: HouseholdOverviewModel["variableSpendGuidance"][number]) => void }) {
  return (
    <details className="group rounded-[2.25rem] border border-white/80 bg-white/90 p-6 shadow-[0_30px_110px_-80px_rgba(15,23,42,.9)]">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">Planning guidance</p>
            <h2 className="mt-1 text-2xl font-black text-slate-950">What should a household like this spend?</h2>
            <p className="mt-2 text-sm font-semibold text-slate-500">Compact planning ranges · select a line for its evidence and assumptions.</p>
          </div>
        </div>
        <span className="rounded-full bg-slate-100 px-4 py-2 text-xs font-black text-slate-700 group-open:hidden">Show ranges ↓</span><span className="hidden rounded-full bg-slate-100 px-4 py-2 text-xs font-black text-slate-700 group-open:inline">Hide ↑</span>
      </summary>
      <div className="mt-5 grid gap-2 lg:grid-cols-2">
        {model.variableSpendGuidance.map((row) => {
          const position = row.actual > 0 ? Math.min(100, Math.max(0, (row.actual / Math.max(row.benchmarkHigh, row.actual)) * 100)) : 0;
          return <div key={row.key} className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50/70 p-3"><button type="button" onClick={() => onSelect(row)} className="min-w-0 flex-1 text-left"><div className="flex items-center justify-between gap-3"><p className="truncate text-sm font-black text-slate-950">{row.label}</p><p className="text-sm font-black text-slate-700">{row.actual > 0 ? formatMoney(row.actual) : row.assumptionAdopted ? `${formatMoney(row.benchmarkTypical)} assumed` : "Not logged"}</p></div><div className="relative mt-2 h-2 rounded-full bg-slate-200"><div className="absolute inset-y-0 rounded-full bg-emerald-200" style={{ left: `${Math.min(90, (row.benchmarkLow / Math.max(row.benchmarkHigh, 1)) * 100)}%`, right: "10%" }} />{row.actual > 0 ? <span className="absolute -top-1 h-4 w-1 rounded-full bg-slate-950" style={{ left: `${position}%` }} /> : null}</div></button>{row.key === "food" && row.status === "no_data" && !row.assumptionAdopted ? <form action={adoptHouseholdFoodAssumption}><button className="rounded-full bg-white px-3 py-2 text-[11px] font-black text-slate-700 shadow-sm">Adopt</button></form> : <button type="button" onClick={() => onSelect(row)} className={`rounded-full border px-3 py-1 text-[10px] font-black ${guidanceTone(row.status)}`}>Details</button>}</div>;
        })}
      </div>
      <p className="mt-4 text-xs font-semibold text-slate-500">{model.guidanceSummary.body}</p>
    </details>
  );
}

export function HouseholdOverviewDashboard({ household, people, pets = [], vehicles = [], carbonProfile, model, canManage }: { household: HouseholdShape; people: HouseholdOverviewPerson[]; pets?: HouseholdPet[]; vehicles?: HouseholdVehicle[]; carbonProfile?: CarbonProfile | null; model: HouseholdOverviewModel; canManage: boolean }) {
  const [modal, setModal] = useState<null | "add" | "child" | "pet" | "carbon" | "vehicle">(null);
  const [selectedGuidance, setSelectedGuidance] = useState<HouseholdOverviewModel["variableSpendGuidance"][number] | null>(null);
  const adults = people.filter((person) => String(person.relationship || "").toLowerCase() !== "child");
  const children = people.filter((person) => String(person.relationship || "").toLowerCase() === "child");
  const optimisationCopy = model.optimisationScore >= 75 ? "Strong family setup" : model.optimisationScore >= 50 ? "Good base, review gaps" : "Needs more household data";
  const adultCount = adults.length;
  const hasCarFinanceEvidence = model.outgoingBreakdown.some((row) => row.key === "car_finance" && row.amount > 0);
  const expectedVehicleCount = Math.max(vehicles.length, adultCount);

  return (
    <div className="space-y-7">
      <section className="relative overflow-hidden rounded-[3rem] bg-slate-950 p-7 text-white shadow-[0_30px_120px_-70px_rgba(15,23,42,.95)] md:p-9">
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-emerald-500/25 blur-3xl" />
        <div className="absolute bottom-0 left-1/3 h-48 w-48 rounded-full bg-orange-500/20 blur-3xl" />
        <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-center">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <SafeAvatar src={household.image_url || null} name={household.name || "Household"} className="h-24 w-24 rounded-[2rem] ring-4 ring-white/15" fallbackClassName="bg-white/10 text-4xl text-white" />
            <div>
              <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-200">Household overview</p>
              <h1 className="mt-3 text-5xl font-black tracking-tight md:text-6xl">Welcome {household.name || "household"}</h1>
              <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-white/70">A simple family cockpit: who is in the household, what comes in, what goes out, how much it costs per head, where savings are going and where LOOP can optimise next.</p>
            </div>
          </div>
          <div className={`rounded-[2rem] border border-white/15 bg-gradient-to-br p-5 ${metricTone(model.optimisationScore)}`}>
            <p className="text-xs font-black uppercase tracking-[0.22em] opacity-70">Family optimisation</p>
            <div className="mt-3 flex items-end justify-between gap-4">
              <p className="text-6xl font-black text-white drop-shadow">{model.optimisationScore}</p>
              <p className="pb-2 text-sm font-black text-white/80">/100</p>
            </div>
            <p className="mt-2 text-sm font-bold text-white/80">{optimisationCopy}</p>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-white">
              <div className="rounded-2xl bg-white/10 p-3"><p className="text-2xl font-black">{model.peopleCount}</p><p className="text-[10px] font-black uppercase text-white/55">People</p></div>
              <div className="rounded-2xl bg-white/10 p-3"><p className="text-2xl font-black">{model.savingsRate}%</p><p className="text-[10px] font-black uppercase text-white/55">Saving</p></div>
              <div className="rounded-2xl bg-white/10 p-3"><p className="text-2xl font-black">{model.costToIncomeRatio}%</p><p className="text-[10px] font-black uppercase text-white/55">Costs</p></div>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Income" value={formatMoney(model.monthlyIncome)} helper={`${model.monthKey} visible household inflow`} icon={Coins} />
        <StatTile label="Outgoings" value={formatMoney(model.monthlyOutgoings)} helper={`${model.costToIncomeRatio}% of visible income`} icon={WalletCards} />
        <StatTile label="Average cost/head" value={formatMoney(model.averageCostPerHead)} helper={`${model.peopleCount || 1} household profile(s)`} icon={UsersRound} />
        <article className="rounded-[1.7rem] border border-white/80 bg-white/90 p-5 shadow-[0_24px_80px_-55px_rgba(15,23,42,.8)]"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">Carbon footprint</p><p className="mt-2 text-3xl font-black tracking-tight text-slate-950">{formatKg(model.annualCarbonKg)}</p><p className="mt-1 text-sm font-semibold text-slate-500">{model.carbonConfidence} confidence · {carbonProfile?.annual_offset_kg ? `${formatKg(Number(carbonProfile.annual_offset_kg))} offset recorded` : "no offset recorded"}</p></div><button type="button" onClick={() => setModal("carbon")} className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-600 text-white" title="Improve carbon data"><ArrowRight className="h-5 w-5" /></button></div></article>
      </section>

      <HouseholdPlanningGuidance model={model} onSelect={setSelectedGuidance} />

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,.9fr)]">
        <div className="rounded-[2.25rem] border border-white/80 bg-white/90 p-6 shadow-[0_30px_110px_-80px_rgba(15,23,42,.9)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Family map</p>
              <h2 className="mt-1 text-3xl font-black text-slate-950">Family timeline</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">People, children and pets in one household view.</p>
            </div>
            {canManage ? <button type="button" onClick={() => setModal("add")} className="rounded-full bg-slate-950 px-4 py-2 text-sm font-black text-white">+ Add</button> : null}
          </div>
          <div className="mt-6 rounded-[2rem] border border-slate-100 bg-slate-50/60 p-5">
            <div className="flex flex-wrap justify-center gap-5">
              {adults.map((person, index) => <FamilyToken key={person.id} person={person} index={index} />)}
            </div>
            {children.length ? <div className="mx-auto my-5 h-8 w-px bg-slate-300" /> : null}
            {children.length ? <div className="flex flex-wrap justify-center gap-5">{children.map((person, index) => <FamilyToken key={person.id} person={person} index={index} />)}</div> : null}
            {pets.length ? <div className="mx-auto my-5 h-8 w-px bg-emerald-300" /> : null}
            {pets.length ? <div className="flex flex-wrap justify-center gap-5">{pets.map((pet) => <PetToken key={pet.id} pet={pet} />)}</div> : null}
            {!people.length ? <p className="text-center text-sm font-bold text-slate-500">Add household people to build the family map.</p> : null}
          </div>
        </div>

        <div className="grid gap-6">
          <PotsPreview model={model} />
          <div className="rounded-[2rem] border border-white/80 bg-white/80 p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-700">Next best actions</p>
            <h3 className="mt-1 text-xl font-black text-slate-950">Where LOOP would focus</h3>
            <div className="mt-4 space-y-3">
              {model.nextActions.map((action) => (
                <div key={action.key} className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                  <p className="font-black text-amber-950">{action.title}</p>
                  <p className="mt-1 text-sm font-semibold leading-5 text-amber-900">{action.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <div className="rounded-[2rem] border border-white/80 bg-white/90 p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3"><h3 className="text-xl font-black text-slate-950">Income</h3><ChartNoAxesColumnIncreasing className="h-5 w-5 text-emerald-600" /></div>
          <div className="mt-4 space-y-2">{model.incomeBreakdown.slice(0, 6).map((row) => <BarRow key={row.key} label={row.label} amount={row.amount} percent={row.percent} tone="emerald" helper={row.helper} />)}</div>
          {!model.incomeBreakdown.length ? <p className="mt-4 text-sm font-bold text-slate-500">No visible household income yet.</p> : null}
        </div>
        <div className="rounded-[2rem] border border-white/80 bg-white/90 p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3"><h3 className="text-xl font-black text-slate-950">Outgoings</h3><Home className="h-5 w-5 text-orange-600" /></div>
          <div className="mt-4 space-y-2">{model.outgoingBreakdown.slice(0, 7).map((row) => <BarRow key={row.key} label={row.label} amount={row.amount} percent={row.percent} tone="orange" helper={row.helper} />)}</div>
          {!model.outgoingBreakdown.length ? <p className="mt-4 text-sm font-bold text-slate-500">No visible household outgoings yet.</p> : null}
        </div>
        <div className="rounded-[2rem] border border-white/80 bg-white/90 p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3"><h3 className="text-xl font-black text-slate-950">Savings & footprint</h3><Sparkles className="h-5 w-5 text-sky-600" /></div>
          <div className="mt-4 space-y-2">
            {model.savingsBreakdown.slice(0, 4).map((row) => <BarRow key={row.key} label={row.label} amount={row.amount} percent={row.percent} tone="emerald" helper={row.helper} />)}
            {model.carbonBreakdown.slice(0, 3).map((row) => <BarRow key={`carbon-${row.key}`} label={`${row.label} footprint`} amount={row.amount} percent={row.percent} tone="slate" helper={row.helper} />)}
          </div>
          {!model.savingsBreakdown.length && !model.carbonBreakdown.length ? <p className="mt-4 text-sm font-bold text-slate-500">Add savings and spending records to unlock this.</p> : null}
        </div>
      </section>

      {modal === "add" ? <Modal title="Add to the family timeline" onClose={() => setModal(null)}><div className="mt-5 grid gap-3 sm:grid-cols-3"><Link href="#invite" onClick={() => setModal(null)} className="rounded-3xl border border-slate-200 p-5 text-center"><span className="text-3xl">🧑</span><span className="mt-2 block font-black">Adult account</span></Link><button type="button" onClick={() => setModal("child")} className="rounded-3xl border border-sky-200 bg-sky-50 p-5"><span className="text-3xl">🧸</span><span className="mt-2 block font-black">Child</span></button><button type="button" onClick={() => setModal("pet")} className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5"><span className="text-3xl">🐾</span><span className="mt-2 block font-black">Pet</span></button></div></Modal> : null}
      {modal === "child" ? <Modal title="Add a child" onClose={() => setModal(null)}><form action={createManagedChildProfile} className="mt-5 grid gap-4"><label className="font-black">Name<input name="name" required className={fieldClass} /></label><label className="font-black">Birth date<input name="birth_date" type="date" required className={fieldClass} /></label><button className="rounded-2xl bg-slate-950 px-5 py-3 font-black text-white">Add to timeline</button></form></Modal> : null}
      {modal === "pet" ? <Modal title="Add a pet" onClose={() => setModal(null)}><form action={addHouseholdPet} className="mt-5 grid gap-4 sm:grid-cols-2"><label className="font-black">Name<input name="name" required className={fieldClass} /></label><label className="font-black">Pet type<select name="species" className={fieldClass}><option value="dog">🐕 Dog</option><option value="cat">🐈 Cat</option><option value="fish">🐟 Fish</option><option value="rabbit">🐇 Rabbit</option><option value="bird">🐦 Bird</option><option value="horse">🐴 Horse</option><option value="reptile">🦎 Reptile</option><option value="other">🐾 Other</option></select></label><label className="font-black">Breed <span className="font-semibold text-slate-400">optional</span><input name="breed" className={fieldClass} /></label><label className="font-black">Date of birth <span className="font-semibold text-slate-400">optional</span><input name="birth_date" type="date" className={fieldClass} /></label><details className="sm:col-span-2 rounded-2xl border border-slate-200 p-4"><summary className="cursor-pointer font-black">Insurance and care details</summary><div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="font-black">Insurer<input name="insurer" className={fieldClass} /></label><label className="font-black">Vet / practice<input name="vet_name" className={fieldClass} /></label></div></details><button className="rounded-2xl bg-slate-950 px-5 py-3 font-black text-white sm:col-span-2">Add to timeline</button></form></Modal> : null}
      {modal === "carbon" ? <Modal title="Improve the household footprint" onClose={() => setModal(null)}><div className="mt-4 rounded-2xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-950">Use measured activity where possible. LOOP will use registrations, confirmed mileage, fuel and home energy before falling back to spending assumptions.</div>{expectedVehicleCount > vehicles.length ? <div className="mt-4 rounded-2xl border border-orange-200 bg-orange-50 p-4"><p className="font-black text-orange-950">Household activity suggests {expectedVehicleCount} cars</p><p className="mt-1 text-xs font-semibold text-orange-800">This is a prompt from adult profiles plus visible car-finance evidence—not a confirmed ownership claim. Add each registration to verify it.</p><div className="mt-3 flex flex-wrap gap-2">{Array.from({ length: expectedVehicleCount }).map((_, index) => <span key={index} className={`rounded-full px-3 py-2 text-xs font-black ${vehicles[index] ? "bg-emerald-100 text-emerald-800" : "bg-white text-orange-800"}`}>{vehicles[index] ? vehicles[index].registration || vehicles[index].name : `Car ${index + 1} · registration needed`}</span>)}</div></div> : null}<div className="mt-4 grid gap-3 sm:grid-cols-2"><a href="https://footprint.wwf.org.uk/" target="_blank" rel="noreferrer" className="rounded-2xl border border-emerald-200 p-4 font-black text-emerald-800">Open WWF footprint questionnaire ↗</a><button type="button" onClick={() => setModal("vehicle")} className="rounded-2xl border border-sky-200 p-4 text-left font-black text-sky-800">+ Add a household vehicle</button></div>{vehicles.length ? <div className="mt-4 space-y-2">{vehicles.map((vehicle) => <div key={vehicle.id} className="rounded-2xl bg-slate-50 p-4"><p className="font-black">{vehicle.name}{vehicle.registration ? ` · ${vehicle.registration}` : ""} · {vehicle.make_model || vehicle.fuel_type}</p><p className="text-xs font-semibold text-slate-500">{vehicle.annual_miles ? `${Number(vehicle.annual_miles).toLocaleString()} miles/year` : "Mileage needed"}{vehicle.mpg ? ` · ${vehicle.mpg} mpg` : ""}</p></div>)}</div> : null}<form action={saveHouseholdCarbonProfile} className="mt-5 grid gap-4"><input type="hidden" name="food_assumption_adopted" value={carbonProfile?.food_assumption_adopted ? "on" : ""} /><div className="grid gap-4 sm:grid-cols-2"><label className="font-black">Annual offset (kg CO₂e)<input name="annual_offset_kg" type="number" min="0" defaultValue={Number(carbonProfile?.annual_offset_kg || 0)} className={fieldClass} /></label><label className="font-black">Offset provider<input name="offset_provider" defaultValue={carbonProfile?.offset_provider || ""} className={fieldClass} /></label></div><label className="font-black">What does the offset cover?<input name="offset_notes" defaultValue={carbonProfile?.offset_notes || ""} className={fieldClass} /></label><button className="rounded-2xl bg-emerald-700 px-5 py-3 font-black text-white">Save footprint context</button></form></Modal> : null}
      {modal === "vehicle" ? <Modal title="Add a household vehicle" onClose={() => setModal("carbon")}><VehicleForm people={people} onBack={() => setModal("carbon")} /></Modal> : null}
      {selectedGuidance ? <Modal title={selectedGuidance.label} onClose={() => setSelectedGuidance(null)}><div className="mt-5"><GuidanceRowCard row={selectedGuidance} /></div><div className="mt-4 rounded-2xl bg-amber-50 p-4"><p className="text-xs font-black uppercase tracking-wide text-amber-700">Evidence and assumptions</p><ul className="mt-2 space-y-2 text-sm font-semibold text-amber-950">{selectedGuidance.assumptions.map((assumption) => <li key={assumption}>• {assumption}</li>)}</ul></div></Modal> : null}
    </div>
  );
}
