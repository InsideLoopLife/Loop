"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, BadgeCheck, Check, History, Loader2, Repeat, Star } from "lucide-react";
import type { ProductLookupCandidate } from "@/lib/nutrition/product-data";
import type { PortionOption, PortionUnit } from "@/lib/nutrition/portions";
import type { NutritionMeal, NutritionPerson, RecentFoodLog } from "@/app/nutrition/page";
import { repeatFoodLogs } from "@/app/nutrition/actions";

function n(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function fmtAmount(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}

/* ------------------------------------------------------------------ */
/* Portion picker: everyday measures + exact grams/ml                  */
/* ------------------------------------------------------------------ */

export type AmountBasis = { baseAmount: number; unit: PortionUnit; portions: PortionOption[]; servingKnown: boolean; kcalPerBase: number };

export function basisFromCandidate(candidate: Partial<ProductLookupCandidate> | null | undefined): AmountBasis | null {
  if (!candidate || candidate.base_amount == null || !(n(candidate.base_amount) > 0)) return null;
  const unit = (candidate.unit === "ml" ? "ml" : "g") as PortionUnit;
  return {
    baseAmount: n(candidate.base_amount),
    unit,
    portions: Array.isArray(candidate.portions) && candidate.portions.length ? candidate.portions : [{ label: `100${unit}`, amount: 100, unit }],
    servingKnown: Boolean(candidate.serving_known),
    kcalPerBase: n(candidate.estimate?.calories),
  };
}

export function PortionPicker({ basis, amount, onChange, label = "How much?" }: { basis: AmountBasis; amount: number | null; onChange: (value: number | null) => void; label?: string }) {
  const kcal = amount != null ? Math.round((basis.kcalPerBase * amount) / basis.baseAmount) : null;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-black text-slate-950">{label}</span>
        {kcal != null ? <span className="text-xs font-black text-emerald-700">{kcal} kcal</span> : null}
      </div>
      {amount == null ? (
        <p className="mt-2 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {basis.servingKnown ? "Pick a portion or type the amount." : `This doesn\u2019t list a serving size, so pick a portion or type the ${basis.unit === "ml" ? "millilitres" : "grams"} you had.`}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {basis.portions.map((portion) => {
          const active = amount != null && Math.abs(amount - portion.amount) < 0.05;
          return (
            <button key={`${portion.label}-${portion.amount}`} type="button" onClick={() => onChange(portion.amount)} className={`rounded-full px-3 py-2 text-xs font-black transition ${active ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>
              {portion.label}
              {portion.kind === "everyday" ? <span className={`ml-1 font-semibold ${active ? "text-white/70" : "text-slate-400"}`}>{fmtAmount(portion.amount)}{portion.unit}</span> : null}
            </button>
          );
        })}
      </div>
      <label className="mt-3 flex items-center gap-2">
        <span className="sr-only">Amount in {basis.unit}</span>
        <input type="number" inputMode="decimal" min="0" step={basis.unit === "ml" ? 10 : 5} value={amount ?? ""} placeholder={`Amount in ${basis.unit}`} onChange={(event) => { const value = event.target.value; onChange(value === "" ? null : Math.max(0, Number(value))); }} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold outline-none ring-emerald-500 focus:ring-2" />
        <span className="w-8 text-sm font-black text-slate-500">{basis.unit}</span>
      </label>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Per-person portions for family meals                                */
/* ------------------------------------------------------------------ */

export type PortionTarget = { id: string; name: string; child: boolean; avatarUrl?: string | null };

export function PersonPortions({ targets, values, onChange, basis, kcalPerServing }: { targets: PortionTarget[]; values: Record<string, number>; onChange: (id: string, value: number) => void; basis: AmountBasis | null; kcalPerServing: number }) {
  const total = targets.reduce((sum, target) => sum + n(values[target.id]), 0);
  const kcalFor = (value: number) => Math.round(basis ? (basis.kcalPerBase * value) / basis.baseAmount : kcalPerServing * value);
  const steps = basis ? null : [0.25, 0.5, 0.75, 1, 1.5, 2];
  return (
    <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-black text-slate-950">Everyone&apos;s portion</p>
        <p className="text-xs font-bold text-slate-500">Total {basis ? `${fmtAmount(total)}${basis.unit}` : `${fmtAmount(total)} serving${total === 1 ? "" : "s"}`} · {kcalFor(total)} kcal</p>
      </div>
      <p className="mt-1 text-xs font-semibold text-slate-500">Children start at a smaller portion. Change anyone&apos;s amount if they had more or less.</p>
      <div className="mt-3 space-y-2">
        {targets.map((target) => {
          const value = n(values[target.id]);
          return (
            <div key={target.id} className="flex flex-col gap-2 rounded-xl bg-white p-2 ring-1 ring-emerald-100 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                {target.avatarUrl ? <img src={target.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover" /> : <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-200 text-xs font-black text-slate-700">{target.name.slice(0, 2).toUpperCase()}</span>}
                <span className="truncate text-sm font-black text-slate-900">{target.name}</span>
                {target.child ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-emerald-700">Child</span> : null}
              </div>
              <div className="flex items-center gap-2">
                {steps ? (
                  <div className="flex flex-wrap gap-1">
                    {steps.map((step) => <button key={step} type="button" onClick={() => onChange(target.id, step)} className={`rounded-full px-2.5 py-1.5 text-xs font-black ${Math.abs(value - step) < 0.01 ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-700"}`}>{step === 0.25 ? "¼" : step === 0.5 ? "½" : step === 0.75 ? "¾" : step === 1.5 ? "1½" : step}</button>)}
                  </div>
                ) : (
                  <label className="flex items-center gap-1">
                    <span className="sr-only">{target.name} amount</span>
                    <input type="number" inputMode="decimal" min="0" step={basis?.unit === "ml" ? 10 : 5} value={value || ""} onChange={(event) => onChange(target.id, Math.max(0, Number(event.target.value || 0)))} className="w-24 rounded-xl border border-slate-200 px-2 py-1.5 text-sm font-semibold outline-none ring-emerald-500 focus:ring-2" />
                    <span className="text-xs font-black text-slate-500">{basis?.unit}</span>
                  </label>
                )}
                <span className="w-16 text-right text-xs font-black text-emerald-700">{kcalFor(value)} kcal</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* "Usuals": what this person logs most often                          */
/* ------------------------------------------------------------------ */

export function usualsFor(recentLogs: RecentFoodLog[], meals: NutritionMeal[], personId: string | null, limit = 6) {
  const counts = new Map<string, { meal: NutritionMeal; count: number; lastMultiplier: number; lastDate: string }>();
  for (const log of recentLogs) {
    if ((log.person_id || null) !== personId || !log.meal_id) continue;
    const meal = meals.find((item) => item.id === log.meal_id);
    if (!meal) continue;
    const current = counts.get(meal.id);
    if (current) current.count += 1;
    else counts.set(meal.id, { meal, count: 1, lastMultiplier: n(log.serving_multiplier) || 1, lastDate: log.eaten_on });
  }
  return Array.from(counts.values())
    .filter((item) => item.count >= 2)
    .sort((a, b) => b.count - a.count || b.lastDate.localeCompare(a.lastDate))
    .slice(0, limit);
}

export function Usuals({ title, items, onPick }: { title: string; items: ReturnType<typeof usualsFor>; onPick: (meal: NutritionMeal, multiplier: number) => void }) {
  if (!items.length) return null;
  return (
    <div className="mt-4 rounded-[1.5rem] bg-white p-3 ring-1 ring-emerald-100">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-black uppercase tracking-wide text-emerald-700"><Star className="h-3.5 w-3.5 fill-current" /> {title}</p>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <button key={item.meal.id} type="button" onClick={() => onPick(item.meal, item.lastMultiplier)} className="inline-flex max-w-full items-center gap-2 rounded-full bg-slate-50 py-1.5 pl-1.5 pr-3 text-left text-xs font-black text-slate-800 ring-1 ring-slate-200 transition hover:bg-emerald-50 hover:ring-emerald-200">
            {item.meal.image_url ? <img src={item.meal.image_url} alt="" className="h-6 w-6 rounded-full object-cover" /> : <span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-100 text-[10px]">★</span>}
            <span className="truncate">{item.meal.label}</span>
            <span className="font-semibold text-slate-400">×{item.count}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Same as yesterday                                                   */
/* ------------------------------------------------------------------ */

const SLOT_LABELS: Record<string, string> = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snacks", drink: "Drinks", meal: "Meals" };

function previousDay(date: string) {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() - 1);
  return parsed.toISOString().slice(0, 10);
}

export function SameAsYesterday({ recentLogs, selectedDate, people, personFilter, onDone }: { recentLogs: RecentFoodLog[]; selectedDate: string; people: NutritionPerson[]; personFilter: string | null; onDone: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [busySlot, setBusySlot] = useState<string | null>(null);
  const yesterday = previousDay(selectedDate);
  const personName = personFilter === "__household__" ? "Household" : personFilter ? people.find((person) => person.id === personFilter)?.name : null;
  const relevant = useMemo(() => recentLogs.filter((log) => log.eaten_on === yesterday && (!personFilter || (personFilter === "__household__" ? !log.person_id : log.person_id === personFilter))), [recentLogs, yesterday, personFilter]);
  const slots = useMemo(() => {
    const map = new Map<string, { count: number; kcal: number; labels: string[] }>();
    for (const log of relevant) {
      const key = log.meal_slot || "meal";
      const current = map.get(key) || { count: 0, kcal: 0, labels: [] };
      current.count += 1;
      current.kcal += n(log.calories);
      if (current.labels.length < 3 && !current.labels.includes(log.label)) current.labels.push(log.label);
      map.set(key, current);
    }
    return Array.from(map.entries()).sort((a, b) => Object.keys(SLOT_LABELS).indexOf(a[0]) - Object.keys(SLOT_LABELS).indexOf(b[0]));
  }, [relevant]);
  if (!relevant.length) return null;

  function repeat(slot: string) {
    setBusySlot(slot);
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await repeatFoodLogs({ fromDate: yesterday, toDate: selectedDate, mealSlot: slot, personId: personFilter });
        setMessage(`Added ${result.copied} item${result.copied === 1 ? "" : "s"} from yesterday.`);
        router.refresh();
        window.setTimeout(onDone, 900);
      } catch (caught) {
        setMessage(caught instanceof Error ? caught.message : "Couldn't copy yesterday's food. Try again.");
      } finally {
        setBusySlot(null);
      }
    });
  }

  return (
    <div className="mb-4 rounded-[1.5rem] border border-slate-200 bg-white p-3">
      <p className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wide text-slate-500"><Repeat className="h-3.5 w-3.5" /> Same as yesterday{personName ? ` · ${personName}` : ""}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {slots.map(([slot, info]) => (
          <button key={slot} type="button" disabled={isPending} onClick={() => repeat(slot)} title={info.labels.join(", ")} className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-2 text-xs font-black text-slate-800 transition hover:bg-slate-200 disabled:opacity-60">
            {busySlot === slot ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <History className="h-3.5 w-3.5" />}
            {SLOT_LABELS[slot] || slot} <span className="font-semibold text-slate-500">{info.count} · {Math.round(info.kcal)} kcal</span>
          </button>
        ))}
        {slots.length > 1 ? (
          <button type="button" disabled={isPending} onClick={() => repeat("all")} className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-3 py-2 text-xs font-black text-white disabled:opacity-60">
            {busySlot === "all" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Repeat className="h-3.5 w-3.5" />} Whole day
          </button>
        ) : null}
      </div>
      {message ? <p className="mt-2 flex items-center gap-1.5 text-xs font-black text-emerald-800"><Check className="h-3.5 w-3.5" /> {message}</p> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Grouped search results                                              */
/* ------------------------------------------------------------------ */

export type ResultGroup = { key: string; label: string; note?: string; candidates: ProductLookupCandidate[] };

function sourceBadge(candidate: ProductLookupCandidate) {
  if (candidate.source === "uk_reference") return { text: "UK reference data", tone: "bg-emerald-100 text-emerald-800" };
  if (candidate.result_group === "yours") return { text: "Yours", tone: "bg-amber-100 text-amber-800" };
  if (candidate.source === "ai_research" || candidate.source === "ai_freehand" || candidate.source === "ai_photo") return { text: "AI estimate", tone: "bg-violet-100 text-violet-800" };
  if (candidate.source === "global_cache") return { text: "Used by others", tone: "bg-sky-100 text-sky-800" };
  return { text: "Pack label", tone: "bg-slate-100 text-slate-700" };
}

function perLine(candidate: ProductLookupCandidate) {
  const kcal = Math.round(n(candidate.estimate?.calories));
  if (candidate.base_amount == null) return `${kcal} kcal per serving`;
  const unit = candidate.unit || "g";
  return candidate.serving_known ? `${kcal} kcal per ${fmtAmount(n(candidate.base_amount))}${unit} serving` : `${kcal} kcal per 100${unit}`;
}

export function GroupedResults({ groups, onPick, renderThumb, usedBefore }: { groups: ResultGroup[]; onPick: (candidate: ProductLookupCandidate) => void; renderThumb: (candidate: ProductLookupCandidate) => React.ReactNode; usedBefore: (candidate: ProductLookupCandidate) => boolean }) {
  return (
    <div className="mt-4 space-y-4">
      {groups.map((group) => (
        <section key={group.key}>
          <div className="mb-2 flex flex-wrap items-baseline gap-x-2">
            <h3 className="text-xs font-black uppercase tracking-wide text-emerald-800">{group.label}</h3>
            {group.note ? <p className="text-xs font-semibold text-slate-500">{group.note}</p> : null}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {group.candidates.map((candidate, idx) => {
              const badge = sourceBadge(candidate);
              const flagged = candidate.quality_flags?.includes("energy_mismatch");
              return (
                <button key={`${group.key}-${candidate.reference_code || candidate.gtin || candidate.barcode || candidate.label}-${idx}`} type="button" onClick={() => onPick(candidate)} className="relative flex gap-3 rounded-[1.25rem] bg-white p-3 text-left shadow-sm ring-1 ring-emerald-100 transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500">
                  {renderThumb(candidate)}
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 pr-6 text-sm font-black text-slate-950">{candidate.label}</p>
                    {candidate.brand_name && candidate.source !== "uk_reference" ? <p className="truncate text-xs font-bold text-slate-500">{candidate.brand_name}</p> : null}
                    <p className="mt-0.5 text-xs font-bold text-slate-600">{perLine(candidate)}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black ${badge.tone}`}>{candidate.source === "uk_reference" ? <BadgeCheck className="h-3 w-3" /> : null}{badge.text}</span>
                      {flagged ? <span title={candidate.quality_note || undefined} className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-black text-orange-800"><AlertTriangle className="h-3 w-3" /> Calories don&apos;t add up</span> : null}
                      {candidate.suggested_amount ? <span className="rounded-full bg-slate-950 px-2 py-0.5 text-[10px] font-black text-white">{fmtAmount(n(candidate.suggested_amount))}{candidate.unit || "g"}</span> : null}
                    </div>
                  </div>
                  {usedBefore(candidate) ? <span className="absolute right-2.5 top-2.5 text-amber-500" title="You've had this before"><Star className="h-4 w-4 fill-current" /></span> : null}
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
