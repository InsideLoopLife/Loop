"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Car, Plus, ShoppingBag, Sparkles, Trash2 } from "lucide-react";
import { ModalFrame } from "@/components/ui/ModalFrame";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { quietly } from "@/components/feedback/quiet-action";
import { isLoopError } from "@/lib/actions/friendly";
import { deletePurchase, loadPurchaseContext, removePurchaseFromPlan, savePurchase, savePurchaseToPlan } from "@/app/spending/purchase-actions";
import { carCostsFor, checkPurchase, purchaseItems, type OneOffCost, type Purchase, type ReplacedLine } from "@/lib/planning/purchase-plan";
import { FUEL_LABEL, FUEL_PRICES, guessCar, TYPICAL_ANNUAL_MILES, TYPICAL_MILES_PER_KWH, TYPICAL_MPG, type FuelType } from "@/lib/vehicles/running-costs";

export type PlannedPurchaseRow = Purchase & { id: string; status: "draft" | "planned"; updated_at?: string };
export type ReplaceOption = { id: string; label: string; amount: number; category: string | null; isCar: boolean };

type Context = {
  forecast: { month: string; leftOver: number }[];
  savingsNow: number;
  buffer: number;
  bufferBasis: "essential" | "all";
  replaced: ReplacedLine | null;
  electricityPence: number;
  electricityLabel: string;
};

const gbp = (value: number, exact = false) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: exact ? 2 : 0, minimumFractionDigits: exact ? 2 : 0 }).format(value);
const monthName = (month: string) => new Date(`${month}-01T00:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
const longDate = (date: string) => new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

const blank = (): Purchase => ({
  kind: "other",
  name: "",
  start_date: null,
  monthly_cost: 0,
  term_months: null,
  upfront_cost: 0,
  one_off_costs: [],
  replaces_planned_item_id: null,
  car: {},
});

export function PlannedPurchases({
  purchases,
  replaceOptions,
  runningByItem = {},
  today,
  openNew = false,
}: {
  purchases: PlannedPurchaseRow[];
  replaceOptions: ReplaceOption[];
  runningByItem?: Record<string, number>;
  today: string;
  openNew?: boolean;
}) {
  const [editing, setEditing] = useState<Purchase | null>(null);
  useEffect(() => {
    if (!openNew) return;
    const timer = window.setTimeout(() => setEditing(blank()), 0);
    return () => window.clearTimeout(timer);
  }, [openNew]);

  return (
    <section id="planned-purchases" className="mb-6 scroll-mt-28 rounded-[18px] border border-slate-200 bg-white p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-slate-950">Planned purchases</h2>
          <p className="text-sm font-semibold text-slate-500">Thinking of buying something? See what it does to your month and savings before you commit.</p>
        </div>
        <button type="button" onClick={() => setEditing(blank())} className="inline-flex items-center gap-1.5 rounded-full bg-slate-950 px-5 py-2.5 text-sm font-black text-white hover:bg-slate-800">
          <Plus className="h-4 w-4" aria-hidden /> Plan a purchase
        </button>
      </div>

      {purchases.length ? (
        <ul className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {purchases.map((purchase) => (
            <li key={purchase.id}>
              <button type="button" onClick={() => setEditing(purchase)} className="flex w-full items-start gap-3 rounded-2xl border border-slate-200 p-4 text-left hover:border-slate-300 hover:bg-slate-50">
                {purchase.kind === "car" ? <Car className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" aria-hidden /> : <ShoppingBag className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" aria-hidden />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-black text-slate-950">{purchase.name}</span>
                  <span className="mt-0.5 block text-xs font-semibold text-slate-500">
                    {[purchase.monthly_cost > 0 ? `${gbp(purchase.monthly_cost)}/mo` : null, purchase.upfront_cost > 0 ? `${gbp(purchase.upfront_cost)} upfront` : null].filter(Boolean).join(" · ") || "No costs yet"}
                  </span>
                </span>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black ${purchase.status === "planned" ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
                  {purchase.status === "planned" && purchase.start_date ? `In plan · ${monthName(purchase.start_date.slice(0, 7))}` : "Draft"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm font-semibold text-slate-500">Nothing planned yet — a car, a holiday, a kitchen. Drafts don&apos;t touch your plan until you add them.</p>
      )}

      {editing ? createPortal(
        <ModalFrame title={editing.id ? editing.name : "Plan a purchase"} description="Work it out first. It only changes your plan when you press Add to plan." eyebrow="Spending · Planned purchases" maxWidth="max-w-5xl" onClose={() => setEditing(null)}>
          <PurchaseEditor initial={editing} replaceOptions={replaceOptions} runningByItem={runningByItem} today={today} onDone={() => setEditing(null)} />
        </ModalFrame>,
        document.body,
      ) : null}
    </section>
  );
}

function PurchaseEditor({ initial, replaceOptions, runningByItem, today, onDone }: { initial: Purchase; replaceOptions: ReplaceOption[]; runningByItem: Record<string, number>; today: string; onDone: () => void }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Purchase>(() => ({ ...blank(), ...initial, car: { ...(initial.car || {}) }, one_off_costs: [...(initial.one_off_costs || [])] }));
  const [context, setContext] = useState<Context | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lookupState, setLookupState] = useState<{ busy: boolean; message: string | null }>({ busy: false, message: null });
  const [pending, startTransition] = useTransition();
  const isPlanned = (initial as PlannedPurchaseRow).status === "planned";
  const set = (patch: Partial<Purchase>) => setDraft((current) => ({ ...current, ...patch }));
  const setCar = (patch: Partial<Purchase["car"]>) => setDraft((current) => ({ ...current, car: { ...current.car, ...patch } }));

  useEffect(() => {
    let live = true;
    quietly(() => loadPurchaseContext(initial.id || null, draft.replaces_planned_item_id)).then((result) => {
      if (!live) return;
      if (isLoopError(result)) setContextError(result.__loopError);
      else { setContextError(null); setContext(result as Context); }
    });
    return () => { live = false; };
  }, [initial.id, draft.replaces_planned_item_id]);

  const carCosts = useMemo(() => carCostsFor(draft, context?.electricityPence), [draft, context?.electricityPence]);
  const check = useMemo(() => (context ? checkPurchase({ purchase: draft, carCosts, replaced: context.replaced, forecast: context.forecast, savingsNow: context.savingsNow, buffer: context.buffer }) : null), [draft, carCosts, context]);
  const itemCount = useMemo(() => (draft.start_date ? purchaseItems({ ...draft, id: "preview" }, { carCosts, categoryId: null }).length : 0), [draft, carCosts]);
  const replacedOption = replaceOptions.find((option) => option.id === draft.replaces_planned_item_id) || null;
  const sortedOptions = useMemo(() => [...replaceOptions].sort((a, b) => Number(b.isCar) - Number(a.isCar) || a.label.localeCompare(b.label)), [replaceOptions]);

  const onName = (name: string) => {
    const guess = guessCar(name);
    setDraft((current) => {
      const next = { ...current, name };
      if (!current.id && guess.isCar && current.kind !== "car") {
        next.kind = "car";
        next.car = { ...current.car, fuelType: guess.fuelType || current.car.fuelType || "petrol", taxIncluded: guess.lease || current.car.taxIncluded };
      }
      return next;
    });
  };

  const lookUp = async () => {
    setLookupState({ busy: true, message: null });
    try {
      const response = await fetch("/api/vehicles/lookup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: draft.name }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.car) { setLookupState({ busy: false, message: payload.error || "The lookup didn't work. Type the figures in instead." }); return; }
      const car = payload.car;
      const mpg = car.realWorldMpg || (car.wltpMpg ? Math.round(car.wltpMpg * 0.85) : null);
      const insurance = car.insuranceAnnualLow && car.insuranceAnnualHigh ? Math.round((car.insuranceAnnualLow + car.insuranceAnnualHigh) / 2 / 12) : null;
      setCar({
        fuelType: car.fuelType || draft.car.fuelType,
        mpg: mpg ?? draft.car.mpg,
        milesPerKwh: car.milesPerKwh ?? draft.car.milesPerKwh,
        listPrice: car.listPrice ?? draft.car.listPrice,
        insuranceMonthly: draft.car.insuranceMonthly || insurance,
        lookup: { matched: car.matched, insuranceGroup: car.insuranceGroup, insuranceAnnualLow: car.insuranceAnnualLow, insuranceAnnualHigh: car.insuranceAnnualHigh, wltpMpg: car.wltpMpg, realWorldMpg: car.realWorldMpg, sources: car.sources, lookedUpAt: car.lookedUpAt },
      });
      setLookupState({ busy: false, message: `Filled in from ${car.matched}. Check them — they're a guide, not a quote.` });
    } catch {
      setLookupState({ busy: false, message: "The lookup didn't work. Type the figures in instead." });
    }
  };

  const run = (action: () => Promise<unknown>, close = true) => {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (isLoopError(result)) { setError(result.__loopError); return; }
      router.refresh();
      if (close) onDone();
    });
  };
  const payload = () => JSON.stringify(draft);

  const field = "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-950";
  const label = "block text-xs font-black text-slate-600";
  const hint = "mt-1 block text-[11px] font-semibold text-slate-400";
  const num = (value: number | null | undefined) => (value === null || value === undefined || value === 0 ? "" : String(value));
  const toNum = (value: string) => (value === "" ? null : Number(value));
  const fuel = (draft.car.fuelType || "petrol") as FuelType;
  const lookup = draft.car.lookup;

  return (
    <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
      <div className="space-y-5">
        <div>
          <label className={label}>What is it?
            <input value={draft.name} onChange={(event) => onName(event.target.value)} placeholder="e.g. VW Tiguan Black Edition 2026 lease" maxLength={140} className={field} autoFocus={!initial.id} />
          </label>
          <div className="mt-2 flex gap-2">
            {([["car", "A car"], ["other", "Something else"]] as const).map(([value, text]) => (
              <button key={value} type="button" onClick={() => set({ kind: value, car: value === "car" ? { fuelType: "petrol", ...draft.car } : draft.car })} aria-pressed={draft.kind === value} className={`rounded-full px-3 py-1.5 text-xs font-black ring-1 ${draft.kind === value ? "bg-slate-950 text-white ring-slate-950" : "bg-white text-slate-700 ring-slate-200"}`}>{text}</button>
            ))}
          </div>
        </div>

        <fieldset className="grid gap-3 sm:grid-cols-3">
          <label className={label}>Monthly payment (£)
            <input type="number" min="0" step="0.01" inputMode="decimal" value={num(draft.monthly_cost)} onChange={(e) => set({ monthly_cost: Number(e.target.value) || 0 })} className={field} />
          </label>
          <label className={label}>How many payments
            <input type="number" min="1" max="120" step="1" value={num(draft.term_months)} onChange={(e) => set({ term_months: toNum(e.target.value) })} placeholder="Ongoing" className={field} />
          </label>
          <label className={label}>Upfront (£)
            <input type="number" min="0" step="0.01" inputMode="decimal" value={num(draft.upfront_cost)} onChange={(e) => set({ upfront_cost: Number(e.target.value) || 0 })} className={field} />
          </label>
          {draft.monthly_cost > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5 sm:col-span-3">
              <span className="text-[11px] font-bold text-slate-400">Upfront as months:</span>
              {[1, 3, 6, 9, 12].map((months) => (
                <button key={months} type="button" onClick={() => set({ upfront_cost: Math.round(draft.monthly_cost * months * 100) / 100 })} className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-700 hover:bg-slate-200">{months}× = {gbp(draft.monthly_cost * months)}</button>
              ))}
            </div>
          ) : null}
        </fieldset>

        {draft.kind === "car" ? (
          <fieldset className="space-y-3 rounded-2xl border border-slate-200 p-4">
            <legend className="px-1 text-xs font-black text-slate-600">The car</legend>
            <label className={label}>Does it replace a car you have now?
              <select value={draft.replaces_planned_item_id || ""} onChange={(e) => { const id = e.target.value || null; set({ replaces_planned_item_id: id }); if (id && runningByItem[id] && !draft.car.currentRunningMonthly) setCar({ currentRunningMonthly: runningByItem[id] }); }} className={field}>
                <option value="">No — it&apos;s an extra car</option>
                {sortedOptions.map((option) => <option key={option.id} value={option.id}>{option.label} · {gbp(option.amount, true)}/mo{option.category ? ` (${option.category})` : ""}</option>)}
              </select>
              <span className={hint}>That payment stops the day before the new one starts.</span>
            </label>
            {draft.replaces_planned_item_id ? (
              <label className={label}>What that car costs to run now — fuel, insurance, tax (£/mo, optional)
                <input type="number" min="0" step="1" value={num(draft.car.currentRunningMonthly)} onChange={(e) => setCar({ currentRunningMonthly: toNum(e.target.value) })} className={field} />
                <span className={hint}>{runningByItem[draft.replaces_planned_item_id] ? "Filled in from that car's details in Your cars." : "Fill this in to compare like for like. Left blank, only the payments are compared."}</span>
              </label>
            ) : null}

            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={lookUp} disabled={lookupState.busy || draft.name.trim().length < 3} className="inline-flex items-center gap-1.5 rounded-full bg-indigo-600 px-4 py-2 text-xs font-black text-white hover:bg-indigo-700 disabled:opacity-50">
                <Sparkles className="h-3.5 w-3.5" aria-hidden /> {lookupState.busy ? "Looking it up…" : "Look up this car"}
              </button>
              <span className="text-[11px] font-semibold text-slate-500">Fuel type, mpg, list price and a typical insurance range.</span>
            </div>
            {lookupState.message ? <p className="text-xs font-bold text-slate-600">{lookupState.message}</p> : null}
            {lookup?.matched ? (
              <p className="rounded-xl bg-indigo-50 px-3 py-2 text-[11px] font-semibold text-indigo-900">
                {lookup.matched}
                {lookup.insuranceGroup ? ` · insurance group ${lookup.insuranceGroup}` : ""}
                {lookup.insuranceAnnualLow && lookup.insuranceAnnualHigh ? ` · typical insurance ${gbp(lookup.insuranceAnnualLow)}–${gbp(lookup.insuranceAnnualHigh)} a year` : ""}
                {lookup.wltpMpg ? ` · ${lookup.wltpMpg} mpg official` : ""}
                {lookup.sources?.length ? (
                  <span className="mt-1 block">{lookup.sources.map((source, i) => <a key={source} href={source} target="_blank" rel="noreferrer" className="mr-2 underline">Source {i + 1}</a>)}</span>
                ) : null}
              </p>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-3">
              <label className={label}>Fuel
                <select value={fuel} onChange={(e) => setCar({ fuelType: e.target.value as FuelType })} className={field}>
                  {(Object.keys(FUEL_LABEL) as FuelType[]).map((key) => <option key={key} value={key}>{FUEL_LABEL[key]}</option>)}
                </select>
              </label>
              <label className={label}>Miles a year
                <input type="number" min="0" step="500" value={num(draft.car.annualMiles)} placeholder={String(TYPICAL_ANNUAL_MILES)} onChange={(e) => setCar({ annualMiles: toNum(e.target.value) })} className={field} />
              </label>
              {fuel === "electric" ? (
                <label className={label}>Miles per kWh
                  <input type="number" min="1" max="7" step="0.1" value={num(draft.car.milesPerKwh)} placeholder={String(TYPICAL_MILES_PER_KWH)} onChange={(e) => setCar({ milesPerKwh: toNum(e.target.value) })} className={field} />
                </label>
              ) : (
                <label className={label}>Real-world mpg
                  <input type="number" min="5" max="400" step="1" value={num(draft.car.mpg)} placeholder={String(TYPICAL_MPG[fuel])} onChange={(e) => setCar({ mpg: toNum(e.target.value) })} className={field} />
                </label>
              )}
              {fuel === "plug_in_hybrid" ? (
                <label className={`${label} sm:col-span-3`}>Share of miles on electric (%)
                  <input type="number" min="0" max="100" step="5" value={draft.car.electricShare === null || draft.car.electricShare === undefined ? "" : String(Math.round(draft.car.electricShare * 100))} placeholder="50" onChange={(e) => setCar({ electricShare: e.target.value === "" ? null : Number(e.target.value) / 100 })} className={field} />
                  <span className={hint}>Mostly short trips with charging at home: higher. Lots of motorway: lower.</span>
                </label>
              ) : null}
              <label className={label}>Insurance (£/mo)
                <input type="number" min="0" step="1" value={num(draft.car.insuranceMonthly)} onChange={(e) => setCar({ insuranceMonthly: toNum(e.target.value) })} className={field} />
                <span className={hint}>{draft.car.insuranceMonthly ? "Replace with a real quote when you have one." : "Add a quote, or look the car up for a typical figure."}</span>
              </label>
              <label className={label}>List price (£)
                <input type="number" min="0" step="100" value={num(draft.car.listPrice)} onChange={(e) => setCar({ listPrice: toNum(e.target.value) })} className={field} />
                <span className={hint}>Sets road tax.</span>
              </label>
              <label className="flex items-center gap-2 self-center pt-4 text-xs font-black text-slate-600">
                <input type="checkbox" checked={Boolean(draft.car.taxIncluded)} onChange={(e) => setCar({ taxIncluded: e.target.checked })} className="h-4 w-4 rounded" />
                Road tax included (most leases)
              </label>
            </div>
          </fieldset>
        ) : null}

        <fieldset className="space-y-2">
          <legend className={label}>Other one-off costs</legend>
          {draft.one_off_costs.map((cost, index) => (
            <div key={index} className="grid grid-cols-[1fr_7rem_9rem_auto] items-center gap-2">
              <input value={cost.label} placeholder="e.g. Delivery, charger fitting" onChange={(e) => set({ one_off_costs: draft.one_off_costs.map((c, i) => (i === index ? { ...c, label: e.target.value } : c)) })} className={field} />
              <input type="number" min="0" step="0.01" value={num(cost.amount)} placeholder="£" onChange={(e) => set({ one_off_costs: draft.one_off_costs.map((c, i) => (i === index ? { ...c, amount: Number(e.target.value) || 0 } : c)) })} className={field} />
              <input type="date" value={cost.date || ""} onChange={(e) => set({ one_off_costs: draft.one_off_costs.map((c, i) => (i === index ? { ...c, date: e.target.value || null } : c)) })} aria-label="Date (blank = start date)" className={field} />
              <button type="button" onClick={() => set({ one_off_costs: draft.one_off_costs.filter((_, i) => i !== index) })} aria-label="Remove this cost" className="grid h-9 w-9 place-items-center rounded-full text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          <button type="button" onClick={() => set({ one_off_costs: [...draft.one_off_costs, { label: "", amount: 0, date: null } as OneOffCost] })} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-200">+ Add a one-off cost</button>
          <span className={hint}>Leave the date blank to pay it on the start date.</span>
        </fieldset>

        <label className={label}>When does it start?
          <input type="date" value={draft.start_date || ""} onChange={(e) => set({ start_date: e.target.value || null })} className={`${field} max-w-xs`} />
          <span className={hint}>{draft.start_date && draft.start_date < today ? "A past date adds it to past months and the calendar too." : "Leave blank while it's just an idea."}</span>
        </label>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        <ImpactPanel draft={draft} carCosts={carCosts} check={check} context={context} contextError={contextError} replacedLabel={replacedOption?.label || context?.replaced?.label || null} />

        {error ? <p className="rounded-xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{error}</p> : null}
        <div className="flex flex-wrap items-center gap-2">
          {isPlanned ? (
            <ConfirmButton
              question="Save these changes to your plan?"
              detail="The lines this purchase added to your plan and calendar are updated to match."
              confirmLabel="Yes, update"
              onConfirm={() => run(() => savePurchase(payload()))}
              disabled={pending || !draft.name.trim()}
              className="rounded-full bg-slate-950 px-5 py-2.5 text-sm font-black text-white hover:bg-slate-800 disabled:opacity-50"
            >
              Save changes
            </ConfirmButton>
          ) : (
            <>
              <button type="button" onClick={() => run(() => savePurchase(payload()))} disabled={pending || !draft.name.trim()} className="rounded-full bg-white px-5 py-2.5 text-sm font-black text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50 disabled:opacity-50">
                Save as draft
              </button>
              <ConfirmButton
                question={`Add ${draft.name || "this"} to your plan?`}
                detail={
                  <span>
                    Adds {itemCount} line{itemCount === 1 ? "" : "s"} to Spending and the calendar from {draft.start_date ? longDate(draft.start_date) : "the start date"}
                    {replacedOption && draft.start_date ? `, and ends ${replacedOption.label} the day before` : ""}. You can take it out again.
                  </span>
                }
                confirmLabel="Yes, add it"
                onConfirm={() => run(() => savePurchaseToPlan(payload()))}
                disabled={pending || !draft.name.trim() || !draft.start_date}
                className="rounded-full bg-emerald-700 px-5 py-2.5 text-sm font-black text-white hover:bg-emerald-800 disabled:opacity-50"
              >
                Add to plan
              </ConfirmButton>
            </>
          )}
          {!draft.start_date && !isPlanned ? <span className="text-[11px] font-bold text-slate-400">Pick a start date to add it to your plan.</span> : null}
        </div>
        {initial.id ? (
          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
            {isPlanned ? (
              <ConfirmButton question="Take it out of your plan?" detail={`Its lines come out of Spending and the calendar${replacedOption ? `, and ${replacedOption.label} gets its old end date back` : ""}. It stays here as a draft.`} confirmLabel="Yes, take it out" onConfirm={() => run(() => removePurchaseFromPlan(initial.id as string))} disabled={pending} className="rounded-full px-3 py-1.5 text-xs font-black text-slate-600 hover:bg-slate-100">
                Take out of plan
              </ConfirmButton>
            ) : null}
            <ConfirmButton question="Delete this purchase?" detail={isPlanned ? "It also comes out of your plan and calendar." : "It's only a draft, so your plan doesn't change."} confirmLabel="Yes, delete" danger onConfirm={() => run(() => deletePurchase(initial.id as string))} disabled={pending} className="rounded-full px-3 py-1.5 text-xs font-black text-rose-600 hover:bg-rose-50">
              Delete
            </ConfirmButton>
          </div>
        ) : null}
      </aside>
    </div>
  );
}

function ImpactPanel({
  draft,
  carCosts,
  check,
  context,
  contextError,
  replacedLabel,
}: {
  draft: Purchase;
  carCosts: ReturnType<typeof carCostsFor>;
  check: ReturnType<typeof checkPurchase> | null;
  context: Context | null;
  contextError: string | null;
  replacedLabel: string | null;
}) {
  const replacedAmount = context?.replaced?.amount || 0;
  const currentRunning = draft.replaces_planned_item_id ? Number(draft.car.currentRunningMonthly || 0) : 0;
  const lines: [string, number, string?][] = [];
  if (draft.monthly_cost > 0) lines.push(["Monthly payment", draft.monthly_cost]);
  if (carCosts) {
    if (carCosts.energyMonthly > 0) lines.push([carCosts.chargingMonthly > 0 && carCosts.fuelMonthly > 0 ? "Fuel & charging" : carCosts.chargingMonthly > 0 ? "Charging" : "Fuel", carCosts.energyMonthly, carCosts.petrolEquivalentMonthly ? `vs ${gbp(carCosts.petrolEquivalentMonthly)} in a typical petrol car` : undefined]);
    lines.push(["Insurance", carCosts.insuranceMonthly, carCosts.insuranceMonthly ? undefined : "not added yet"]);
    lines.push(["Road tax", carCosts.taxMonthly, carCosts.taxNote]);
  }
  const change = check?.monthlyChange ?? Math.round((draft.monthly_cost + (carCosts?.totalMonthly || 0) - replacedAmount - currentRunning) * 100) / 100;

  return (
    <div className="space-y-3 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
      <div>
        <p className="text-xs font-black uppercase tracking-[0.14em] text-slate-400">Each month</p>
        <p className={`text-3xl font-black tracking-tight ${change > 0 ? "text-slate-950" : "text-emerald-700"}`}>{change > 0 ? "+" : change < 0 ? "−" : ""}{gbp(Math.abs(change))}<span className="text-base font-bold text-slate-500">/mo</span></p>
        <p className="text-xs font-semibold text-slate-500">{replacedLabel ? `compared with now, with ${replacedLabel} gone` : "on top of what you spend now"}</p>
      </div>
      {lines.length || replacedLabel ? (
        <dl className="space-y-1 border-t border-slate-200 pt-2 text-xs font-semibold text-slate-600">
          {lines.map(([name, value, note]) => (
            <div key={name} className="flex justify-between gap-3"><dt>{name}{note ? <span className="block text-[10px] text-slate-400">{note}</span> : null}</dt><dd className="font-black text-slate-900">{gbp(value, true)}</dd></div>
          ))}
          {replacedLabel ? <div className="flex justify-between gap-3"><dt>{replacedLabel} stops</dt><dd className="font-black text-emerald-700">−{gbp(replacedAmount, true)}</dd></div> : null}
          {currentRunning > 0 ? <div className="flex justify-between gap-3"><dt>Its running costs stop</dt><dd className="font-black text-emerald-700">−{gbp(currentRunning, true)}</dd></div> : null}
        </dl>
      ) : null}
      {check && check.atStart > 0 ? (
        <p className="border-t border-slate-200 pt-2 text-xs font-semibold text-slate-600">
          Up front: <strong className="text-slate-950">{gbp(check.atStart)}</strong>{draft.start_date ? ` on ${longDate(draft.start_date)}` : ""}
        </p>
      ) : null}

      {contextError ? <p className="text-xs font-bold text-rose-700">{contextError}</p> : !context || !check ? (
        <p className="text-xs font-bold text-slate-500">Checking it against your plan…</p>
      ) : (
        <Verdict check={check} context={context} />
      )}

      {carCosts?.assumptions.length ? (
        <p className="text-[10px] font-semibold leading-relaxed text-slate-400">
          {carCosts.assumptions.join(". ")}.{carCosts.chargingMonthly > 0 && context ? ` Electricity: ${context.electricityLabel}.` : ""} Pump prices: {FUEL_PRICES.source}, {FUEL_PRICES.asOf}.
        </p>
      ) : null}
    </div>
  );
}

function Verdict({ check, context }: { check: NonNullable<ReturnType<typeof checkPurchase>>; context: Context }) {
  const net = `your ${context.bufferBasis === "essential" ? "3-month safety net" : "3-month buffer"} (${gbp(context.buffer)})`;
  if (check.verdict === "no_date") {
    return (
      <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
        <p className="text-sm font-black text-slate-900">Pick a start date to check it</p>
        {check.earliestComfortable ? <p className="mt-1 text-xs font-semibold text-slate-600">Earliest month it fits without touching {net}: <strong>{monthName(check.earliestComfortable)}</strong>.</p> : <p className="mt-1 text-xs font-semibold text-slate-600">It doesn&apos;t fit comfortably in the next {check.months} months.</p>}
      </div>
    );
  }
  const tone = check.verdict === "yes" ? "bg-emerald-50 ring-emerald-200 text-emerald-900" : check.verdict === "tight" ? "bg-amber-50 ring-amber-200 text-amber-900" : "bg-rose-50 ring-rose-200 text-rose-900";
  const title = check.verdict === "yes" ? "Yes, you can afford it" : check.verdict === "tight" ? "Affordable, but tight" : "Not yet";
  return (
    <div className={`rounded-xl p-3 ring-1 ${tone}`}>
      <p className="text-base font-black">{title}</p>
      <p className="mt-1 text-xs font-semibold">
        {check.verdict === "yes"
          ? `Savings stay above ${net} all the way through. Lowest point: ${gbp(check.lowest)}${check.lowestMonth ? ` in ${monthName(check.lowestMonth)}` : ""}.`
          : check.verdict === "tight"
            ? `Savings dip below ${net} in ${monthName(check.bufferBreachMonth as string)} — lowest ${gbp(check.lowest)}.`
            : `Money would run out in ${monthName(check.firstShortMonth as string)}.`}
      </p>
      {check.verdict !== "yes" ? (
        <p className="mt-1 text-xs font-semibold">
          {check.earliestComfortable ? <>Earliest comfortable start: <strong>{monthName(check.earliestComfortable)}</strong>.</> : `It doesn't fit comfortably in the next ${check.months} months.`}
        </p>
      ) : null}
      <p className="mt-2 text-[10px] font-semibold opacity-70">Based on savings of {gbp(context.savingsNow)} and what&apos;s left over each month in your plan, if it&apos;s kept.</p>
    </div>
  );
}
