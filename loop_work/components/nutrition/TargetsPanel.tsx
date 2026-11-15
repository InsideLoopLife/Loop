"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Settings2 } from "lucide-react";
import type { NutritionPerson } from "@/app/nutrition/page";
import type { PersonTargets } from "@/lib/nutrition/targets";
import type { NutritionTotals } from "@/lib/nutrition/scoring";
import { saveNutritionProfile } from "@/app/nutrition/actions";

function n(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

const MICROS: Array<{ key: keyof NutritionTotals; target: keyof PersonTargets; label: string; unit: string }> = [
  { key: "calcium_mg", target: "calcium_mg", label: "Calcium", unit: "mg" },
  { key: "iron_mg", target: "iron_mg", label: "Iron", unit: "mg" },
  { key: "vitamin_c_mg", target: "vitamin_c_mg", label: "Vitamin C", unit: "mg" },
  { key: "vitamin_d_ug", target: "vitamin_d_ug", label: "Vitamin D", unit: "µg" },
  { key: "folate_ug", target: "folate_ug", label: "Folate", unit: "µg" },
  { key: "vitamin_b12_ug", target: "vitamin_b12_ug", label: "Vitamin B12", unit: "µg" },
  { key: "potassium_mg", target: "potassium_mg", label: "Potassium", unit: "mg" },
  { key: "magnesium_mg", target: "magnesium_mg", label: "Magnesium", unit: "mg" },
  { key: "zinc_mg", target: "zinc_mg", label: "Zinc", unit: "mg" },
  { key: "thiamin_mg", target: "thiamin_mg", label: "Thiamin (B1)", unit: "mg" },
  { key: "niacin_mg", target: "niacin_mg", label: "Niacin (B3)", unit: "mg" },
];

function fmt(value: number, unit: string) {
  if (unit === "µg" || value < 10) return value.toFixed(1).replace(/\.0$/, "");
  return Math.round(value).toString();
}

export function MicronutrientCard({ totals, targets }: { totals: Partial<NutritionTotals>; targets: PersonTargets }) {
  return (
    <div className="rounded-[1.75rem] border border-white/70 bg-white p-4 shadow-lg sm:rounded-[2rem] sm:p-5 md:col-span-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs font-black uppercase text-slate-500">Vitamins & minerals</p>
        <p className="text-xs font-semibold text-slate-500">UK daily amounts for {targets.bandLabel.toLowerCase()}</p>
      </div>
      <div className="mt-3 grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
        {MICROS.map((micro) => {
          const value = n(totals[micro.key]);
          const target = n(targets[micro.target]);
          const pct = target > 0 ? Math.round((value / target) * 100) : 0;
          return (
            <div key={micro.key}>
              <div className="flex items-baseline justify-between text-xs font-black text-slate-700">
                <span>{micro.label}</span>
                <span className={pct >= 100 ? "text-emerald-700" : pct >= 50 ? "text-slate-700" : "text-slate-400"}>{fmt(value, micro.unit)} / {fmt(target, micro.unit)}{micro.unit} · {pct}%</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${pct >= 100 ? "bg-emerald-500" : pct >= 50 ? "bg-emerald-300" : "bg-slate-300"}`} style={{ width: `${Math.max(2, Math.min(100, pct))}%` }} /></div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs font-semibold text-slate-500">Where a product label doesn&apos;t list vitamins and minerals, Loop uses the closest UK reference food, so treat these as a guide.</p>
    </div>
  );
}

export function TargetsChip({ person, targets, onEdit }: { person: NutritionPerson | null; targets: PersonTargets; onEdit?: () => void }) {
  const ageText = targets.ageYears != null ? ` · age ${targets.ageYears}` : "";
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-600">
      <span className="rounded-full bg-white px-3 py-1.5 ring-1 ring-slate-200">Targets: {targets.band === "adult" ? "Adult" : targets.bandLabel}{targets.band === "adult" ? ageText : ""}</span>
      {person && onEdit ? <button type="button" onClick={onEdit} className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 font-black text-emerald-800 ring-1 ring-emerald-200 hover:bg-emerald-50"><Settings2 className="h-3.5 w-3.5" /> {person.name}&apos;s health details</button> : null}
      {targets.notes.slice(0, 1).map((note) => <span key={note} className="text-slate-500">{note}</span>)}
    </div>
  );
}

export function NutritionProfileEditor({ person, onDone }: { person: NutritionPerson; onDone: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [birthDate, setBirthDate] = useState(person.birth_date || "");
  const [sex, setSex] = useState<"" | "male" | "female">((person.nutrition_reference_sex as "male" | "female") || "");
  const [weight, setWeight] = useState(person.weight_kg ? String(person.weight_kg) : "");
  const [lowCaffeine, setLowCaffeine] = useState(person.caffeine_limit_mg === 200);
  const [message, setMessage] = useState<string | null>(null);

  function save() {
    setMessage(null);
    startTransition(async () => {
      try {
        await saveNutritionProfile({
          personId: person.id,
          birthDate: birthDate || null,
          referenceSex: sex || null,
          weightKg: weight ? Number(weight) : null,
          caffeineLimitMg: lowCaffeine ? 200 : null,
        });
        setMessage("Saved.");
        router.refresh();
        window.setTimeout(onDone, 600);
      } catch (caught) {
        setMessage(caught instanceof Error ? caught.message : "Couldn't save. Try again.");
      }
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold text-slate-600">These make {person.name}&apos;s daily targets match UK guidance for their age. All optional.</p>
      <label className="block">
        <span className="text-sm font-black text-slate-900">Date of birth</span>
        <input type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3 text-base font-semibold outline-none ring-emerald-500 focus:ring-2 sm:text-sm" />
        <span className="mt-1 block text-xs font-semibold text-slate-500">Children get their own limits for sugar, salt and caffeine.</span>
      </label>
      <div>
        <span className="text-sm font-black text-slate-900">Reference values</span>
        <div className="mt-1 grid grid-cols-3 gap-2">
          {([["", "Not set"], ["male", "Men's / boys'"], ["female", "Women's / girls'"]] as const).map(([value, label]) => (
            <button key={value || "none"} type="button" onClick={() => setSex(value)} className={`rounded-2xl px-3 py-2.5 text-xs font-black ${sex === value ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-700"}`}>{label}</button>
          ))}
        </div>
        <span className="mt-1 block text-xs font-semibold text-slate-500">UK guidance differs for iron, protein and energy.</span>
      </div>
      <label className="block">
        <span className="text-sm font-black text-slate-900">Weight (kg)</span>
        <input type="number" inputMode="decimal" min="3" max="350" step="0.1" value={weight} onChange={(event) => setWeight(event.target.value)} className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-3 text-base font-semibold outline-none ring-emerald-500 focus:ring-2 sm:text-sm" placeholder="Optional" />
        <span className="mt-1 block text-xs font-semibold text-slate-500">Used for children&apos;s caffeine guide (3mg per kg) and adult protein (0.75g per kg).</span>
      </label>
      <label className="flex items-start gap-3 rounded-2xl bg-slate-50 p-3">
        <input type="checkbox" checked={lowCaffeine} onChange={(event) => setLowCaffeine(event.target.checked)} className="mt-0.5 h-4 w-4 accent-emerald-600" />
        <span>
          <span className="block text-sm font-black text-slate-900">Use a 200mg caffeine limit</span>
          <span className="block text-xs font-semibold text-slate-500">UK advice during pregnancy and breastfeeding, or if caffeine affects you.</span>
        </span>
      </label>
      <div className="flex items-center gap-3">
        <button type="button" disabled={isPending} onClick={save} className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white disabled:opacity-60">{isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save</button>
        {message ? <span className="text-sm font-black text-emerald-800">{message}</span> : null}
      </div>
    </div>
  );
}
