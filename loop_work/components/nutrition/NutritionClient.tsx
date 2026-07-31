"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Barcode, CalendarDays, CheckCircle2, Clock, Coffee, Droplets, Edit3, HeartPulse, Image as ImageIcon, Import, Info, Link2, Loader2, MoonStar, Plus, Salad, Scale, ShieldAlert, Sparkles, Star, Sun, Trash2, Utensils } from "lucide-react";
import { FormInput } from "@/components/FormInput";
import { SubmitButton } from "@/components/SubmitButton";
import { addNutritionMeal, bulkAddNutritionMeals, deleteFoodEntry, deleteNutritionMeal, generateMealMethod, logFoodEntry, queueNutritionProductCorrection, setNutritionMealCardKind, updateFoodEntry, updateNutritionMeal, updateNutritionSettings } from "@/app/nutrition/actions";
import { addNutritionTotals, mealImageEmoji, NUTRITION_TOTAL_KEYS, nutritionBalanceRecommendations, scoreGutHealth, scoreMeal, scoreNutritionDay, scoreProcessedFood, type NutritionTotals, type RecipeEstimate } from "@/lib/nutrition/scoring";
import type { FoodLog, NutritionMeal, NutritionPerson, NutritionSettings, Supermarket } from "@/app/nutrition/page";
import type { ProductLookupCandidate } from "@/lib/nutrition/product-data";
import { cleanProductOrMealLabel, displayProductCandidateLabel, extractTimeHHMM, extractVolumeMl, inferFoodEntityType, isProductLikeKind, nutritionUpdateStatus, productUpdateStatusLabel } from "@/lib/nutrition/intelligence";

type Props = { people: NutritionPerson[]; meals: NutritionMeal[]; logs: FoodLog[]; supermarkets: Supermarket[]; selectedDate: string; settings: NutritionSettings; initialOpen?: "recipe" | "log" | "edit-recipe" | null; initialMealId?: string | null; initialTab?: "overview" | "recipes" | "food-log" | "meal-cards" };
type Modal = { type: "recipe" } | { type: "edit-recipe"; meal: NutritionMeal } | { type: "log"; meal?: NutritionMeal } | { type: "edit-log"; log: FoodLog } | { type: "menu-import" } | null;
type NutritionPanel = "log" | "cards" | "settings";

const inputClass = "mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none ring-emerald-500 transition focus:ring-2";
const nutritionKeys: Array<keyof NutritionTotals> = NUTRITION_TOTAL_KEYS;

function number(value: unknown) {
  return Number(value || 0);
}

function dateLabel(date: string) {
  const parsed = new Date(`${date}T00:00:00`);
  return parsed.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

function personName(people: NutritionPerson[], personId: string | null) {
  if (!personId) return "Household";
  return people.find((person) => person.id === personId)?.name ?? "Person";
}

function isChild(person?: NutritionPerson) {
  return /child|son|daughter|baby/i.test(person?.relationship || "");
}

function isSelfPerson(person?: NutritionPerson) {
  return /self|me|myself|account owner/i.test(person?.relationship || "");
}

function logBelongsToView(log: FoodLog, viewId: string) {
  if (viewId === "__all__") return true;
  if (viewId === HOUSEHOLD_SENTINEL) return !log.person_id;
  return log.person_id === viewId;
}

function sortLogsByConsumption(a: FoodLog, b: FoodLog) {
  const left = timeLabel(a.eaten_at) || "99:99";
  const right = timeLabel(b.eaten_at) || "99:99";
  if (left !== right) return left.localeCompare(right);
  return String(a.label || "").localeCompare(String(b.label || ""));
}

function mealSlotLabel(value: string | null | undefined) {
  const key = String(value || "meal").toLowerCase();
  return MEAL_SLOT_OPTIONS.find((slot) => slot.value === key)?.label || "Other";
}

function mealSlotIcon(value: string | null | undefined) {
  const key = String(value || "meal").toLowerCase();
  return MEAL_SLOT_OPTIONS.find((slot) => slot.value === key)?.icon || Utensils;
}

function factRowsFromRecord(record: Record<string, unknown> | null | undefined): string[] {
  const rows: string[] = [];
  const add = (value: unknown) => {
    if (value == null) return;
    if (typeof value === "string" || typeof value === "number") rows.push(String(value));
    else if (Array.isArray(value)) value.forEach(add);
    else if (typeof value === "object") {
      const obj = value as Record<string, unknown>;
      if (obj.label || obj.name || obj.nutrient) rows.push(`${obj.amount || obj.quantity || obj.value || ""} ${obj.unit || ""} ${obj.label || obj.name || obj.nutrient || ""}`.trim());
      else Object.entries(obj).forEach(([key, val]) => rows.push(`${String(val)} ${key}`));
    }
  };
  add(record?.ingredients_json);
  String(record?.ingredients || "").split(/\r?\n|\s•\s/).forEach((line) => rows.push(line));
  const json = record?.nutrition_json && typeof record.nutrition_json === "object" ? record.nutrition_json as Record<string, unknown> : {};
  add(json.label_facts); add(json.nutrition_facts); add(json.supplement_facts_rows); add(json.facts);
  return rows.map((row) => row.replace(/^[-•]\s*/, "").trim()).filter(Boolean);
}

function nutritionValueFromRecord(record: Record<string, unknown> | null | undefined, key: keyof NutritionTotals) {
  const direct = number(record?.[key]);
  if (direct) return direct;
  const json = record?.nutrition_json && typeof record.nutrition_json === "object" ? record.nutrition_json as any : {};
  const per = json.per_serving && typeof json.per_serving === "object" ? json.per_serving : {};
  const supplement = json.supplement_facts && typeof json.supplement_facts === "object" ? json.supplement_facts : {};
  const aliases: Record<string, string[]> = {
    calories: ["calories", "kcal"], protein_g: ["protein_g", "protein"], carbs_g: ["carbs_g", "carbohydrate", "total_carbohydrate"], fat_g: ["fat_g", "fat"], fibre_g: ["fibre_g", "fiber", "fibre"], sugar_g: ["sugar_g", "total_sugars", "sugars"], added_sugar_g: ["added_sugar_g", "added_sugars"], salt_g: ["salt_g", "salt"], sodium_mg: ["sodium_mg", "sodium"], caffeine_mg: ["caffeine_mg", "caffeine", "caffeine_anhydrous"], vitamin_c_mg: ["vitamin_c_mg", "vitamin_c"], niacin_mg: ["niacin_mg", "niacin"], vitamin_b12_ug: ["vitamin_b12_ug", "vitamin_b12"], potassium_mg: ["potassium_mg", "potassium"], calcium_mg: ["calcium_mg", "calcium"], iron_mg: ["iron_mg", "iron"], magnesium_mg: ["magnesium_mg", "magnesium"], zinc_mg: ["zinc_mg", "zinc"], folate_ug: ["folate_ug", "folate"], thiamin_mg: ["thiamin_mg", "thiamin"]
  };
  for (const alias of aliases[String(key)] || [String(key)]) {
    const v = number(per[alias] || supplement[alias]);
    if (v) return v;
  }
  const fallbackMap: Record<string, RegExp> = {
    calories: /calories|kcal/i, carbs_g: /carbohydrate|carbs/i, sugar_g: /total sugars?|sugars?/i, added_sugar_g: /added sugars?/i, sodium_mg: /sodium/i, caffeine_mg: /caffeine/i, vitamin_c_mg: /vitamin c/i, niacin_mg: /niacin/i, vitamin_b12_ug: /vitamin b12/i, thiamin_mg: /thiamin/i, potassium_mg: /potassium/i, calcium_mg: /calcium/i, iron_mg: /\biron\b/i, magnesium_mg: /magnesium/i, zinc_mg: /\bzinc\b/i, folate_ug: /folate/i
  };
  const pattern = fallbackMap[String(key)];
  if (pattern) {
    for (const row of factRowsFromRecord(record)) {
      if (!pattern.test(row)) continue;
      const match = row.match(/(\d+(?:\.\d+)?)/);
      if (match) return Number(match[1]);
    }
  }
  return 0;
}

function nutritionFromRecord(record: Record<string, unknown> | null | undefined) {
  const totals = nutritionKeys.reduce<NutritionTotals>((acc, key) => {
    acc[key] = nutritionValueFromRecord(record, key);
    return acc;
  }, nutritionKeys.reduce<NutritionTotals>((acc, key) => {
    acc[key] = 0;
    return acc;
  }, {} as NutritionTotals));
  if (!totals.salt_g && totals.sodium_mg) totals.salt_g = Math.round((totals.sodium_mg * 2.54 / 1000) * 100) / 100;
  return totals;
}

function asArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function estimateMetaFromMeal(meal?: NutritionMeal) {
  return {
    ingredient_ratio_json: Array.isArray(meal?.ingredient_ratio_json) ? meal?.ingredient_ratio_json : [],
    allergen_flags: asArray(meal?.allergen_flags),
    dietary_flags: asArray(meal?.dietary_flags),
    manufacturing_notes: asArray(meal?.manufacturing_notes),
    confidence_reason: meal?.confidence_reason || "",
    processing_level: meal?.processing_level || "unknown",
  };
}

function ringColor(score: number) {
  if (score >= 80) return "#10b981";
  if (score >= 65) return "#84cc16";
  if (score >= 45) return "#f59e0b";
  return "#fb7185";
}


const HOUSEHOLD_SENTINEL = "__household__";
const MEAL_SLOT_OPTIONS = [
  { value: "breakfast", label: "Breakfast", icon: Sun },
  { value: "lunch", label: "Lunch", icon: Salad },
  { value: "dinner", label: "Dinner", icon: MoonStar },
  { value: "snack", label: "Snack", icon: Plus },
  { value: "drink", label: "Drink", icon: Coffee },
  { value: "meal", label: "Meal", icon: Utensils },
] as const;

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() || "").join("") || "P";
}

function ingredientLine(item: { name: string; quantity?: string; notes?: string }) {
  return [item.quantity, item.name].filter(Boolean).join(" ").trim() || item.name;
}

function ingredientDetailPrompt(item: { name?: string; quantity?: string; notes?: string }) {
  const text = `${item.name || ""} ${item.quantity || ""} ${item.notes || ""}`.toLowerCase();
  if (/espresso|coffee/.test(text)) return "Coffee detail: choose single/double shot strength. A double espresso is usually still around 30–60ml, so strength matters more than volume.";
  if (/milk/.test(text)) return "Milk detail: pick the exact milk where possible, e.g. Graham’s Gold Top, whole milk, semi-skimmed, oat, almond or lactose-free.";
  if (/mince|beef mince|pork mince|turkey mince/.test(text)) return "Mince detail: add the fat %, e.g. 5%, 10%, 12% or 20%, because it materially changes calories and saturated fat.";
  if (/syrup|sauce|caramel|flavouring/.test(text)) return "Flavouring detail: barcode/URL is best. Sugar-free vs full-sugar changes calories, gut score and sweetener flags.";
  if (/oil|butter|cream|cheese/.test(text)) return "Fat detail: amount and product type matter here, so tighten the quantity if you can.";
  return "";
}

function fallbackFoodImageUrl(label: string) {
  return `/api/food-image-placeholder?label=${encodeURIComponent(label || "Food")}`;
}

const DAILY_TARGETS = {
  calories: 2200,
  protein_g: 75,
  fibre_g: 30,
  salt_g: 6,
  saturated_fat_g: 20,
  caffeine_mg: 400,
  added_sugar_g: 30,
  calcium_mg: 700,
  iron_mg: 8,
  potassium_mg: 3500,
  vitamin_c_mg: 80,
  vitamin_d_ug: 10,
  folate_ug: 200,
  magnesium_mg: 300,
  zinc_mg: 9.5,
};

function barTone(value: number, target: number, inverted = false) {
  const ratio = target > 0 ? value / target : 0;
  if (inverted) {
    if (ratio <= 0.75) return "bg-emerald-500";
    if (ratio <= 1) return "bg-amber-400";
    return "bg-red-500";
  }
  if (ratio < 0.35) return "bg-red-400";
  if (ratio < 0.7) return "bg-amber-400";
  if (ratio <= 1.15) return "bg-emerald-500";
  if (ratio <= 1.3) return "bg-orange-400";
  return "bg-red-500";
}

function TargetBar({ label, value, target, unit = "", inverted = false, note }: { label: string; value: number; target: number; unit?: string; inverted?: boolean; note?: string }) {
  const ratio = target > 0 ? value / target : 0;
  const width = Math.max(3, Math.min(100, ratio * 100));
  return (
    <div className="rounded-[2rem] border border-white/70 bg-white p-5 shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase text-slate-500">{label}</p>
          <p className="mt-2 text-3xl font-black text-slate-950">{number(value).toFixed(unit === "kcal" || unit === "ml" ? 0 : unit === "mg" || unit === "µg" ? 0 : 1)}{unit ? ` ${unit}` : ""}</p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">target {number(target).toFixed(unit === "kcal" || unit === "ml" ? 0 : unit === "mg" || unit === "µg" ? 0 : 1)}{unit}</span>
      </div>
      <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${barTone(value, target, inverted)}`} style={{ width: `${width}%` }} />
      </div>
      <p className="mt-2 text-sm font-semibold text-slate-500">{note || `${Math.round(ratio * 100)}% of today’s guide. Targets can become personal when profile stats and Apple Health data are connected.`}</p>
    </div>
  );
}

function ScoreChip({ score, label, lowIsGood = false }: { score: number; label: string; lowIsGood?: boolean }) {
  const good = lowIsGood ? score <= 40 : score >= 70;
  const ok = lowIsGood ? score <= 70 : score >= 45;
  const classes = good ? "bg-emerald-50 text-emerald-800" : ok ? "bg-amber-50 text-amber-800" : "bg-red-50 text-red-700";
  return <span className={`rounded-full px-3 py-1 text-xs font-black ${classes}`}>{label}: {score}/100</span>;
}

function FatQualityCard({ totals }: { totals: NutritionTotals }) {
  const unsat = number(totals.monounsaturated_fat_g) + number(totals.polyunsaturated_fat_g) + number(totals.omega_3_g);
  return (
    <div className="rounded-[2rem] border border-white/70 bg-white p-5 shadow-lg">
      <p className="text-xs font-black uppercase text-slate-500">Fat quality</p>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs font-black">
        <div className="rounded-2xl bg-red-50 p-3 text-red-700"><span className="block text-[0.65rem] uppercase text-red-400">sat</span>{number(totals.saturated_fat_g).toFixed(1)}g</div>
        <div className="rounded-2xl bg-emerald-50 p-3 text-emerald-800"><span className="block text-[0.65rem] uppercase text-emerald-500">unsat</span>{unsat.toFixed(1)}g</div>
        <div className="rounded-2xl bg-slate-50 p-3 text-slate-700"><span className="block text-[0.65rem] uppercase text-slate-400">trans</span>{number(totals.trans_fat_g).toFixed(2)}g</div>
      </div>
      <p className="mt-3 text-sm font-semibold text-slate-500">Useful fats support hormones and absorption. High saturated/trans fat is where the app will nudge lighter choices.</p>
    </div>
  );
}

function ProcessedLoadCard({ processed }: { processed: { score: number; label: string; reason?: string } }) {
  return (
    <div className="rounded-[2rem] border border-white/70 bg-white p-5 shadow-lg">
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-xs font-black uppercase text-slate-500">Processed load</p><p className="mt-2 text-3xl font-black text-slate-950">{processed.score}/100</p></div>
        <ScoreChip score={processed.score} label={processed.label} lowIsGood />
      </div>
      <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${barTone(processed.score, 70, true)}`} style={{ width: `${Math.max(6, Math.min(100, processed.score))}%` }} /></div>
      <p className="mt-2 text-sm font-semibold text-slate-500">Lower is usually better, but not every processed food is “bad”. The app weighs pastry, fried foods, processed meat, additives, salt and fibre context.</p>
    </div>
  );
}

function foodLogImage(log: FoodLog) {
  return log.image_url || "";
}

function isGeneratedFallbackUrl(url: string | null | undefined) {
  return Boolean(url && /source\.unsplash\.com|loremflickr\.com|placehold\.co/i.test(url));
}

function hasDisplayableImage(url: string | null | undefined) {
  return Boolean(url && /^(https?:)?\/\//i.test(String(url || "").trim()));
}

function normaliseImageUrl(url: string | null | undefined) {
  const value = String(url || "").trim();
  if (!value) return "";
  if (value.startsWith("//")) return `https:${value}`;
  return value;
}

function proxiedImageSrc(url: string | null | undefined) {
  const normalised = normaliseImageUrl(url);
  if (!normalised) return "";
  if (normalised.startsWith("/api/food-image-placeholder") || normalised.startsWith("/api/image-proxy")) return normalised;
  if (!hasDisplayableImage(normalised)) return "";
  return `/api/image-proxy?url=${encodeURIComponent(normalised)}`;
}

function imageSrc(url: string | null | undefined, mode: "direct" | "proxy" | "placeholder" = "direct", label = "Food") {
  const normalised = normaliseImageUrl(url);
  if (mode === "placeholder") return fallbackFoodImageUrl(label);
  if (!normalised) return fallbackFoodImageUrl(label);
  if (normalised.startsWith("/api/food-image-placeholder") || normalised.startsWith("/api/image-proxy")) return normalised;
  if (!hasDisplayableImage(normalised)) return fallbackFoodImageUrl(label);
  return mode === "proxy" ? proxiedImageSrc(normalised) : normalised;
}

function FoodThumb({ label, imageUrl, size = "md" }: { label: string; imageUrl?: string | null; size?: "sm" | "md" | "lg" }) {
  const [mode, setMode] = useState<"direct" | "proxy" | "placeholder">("direct");
  const sizeClass = size === "sm" ? "h-12 w-12 rounded-2xl text-xl" : size === "lg" ? "h-24 w-24 rounded-[1.5rem] text-3xl" : "h-14 w-14 rounded-2xl text-2xl";
  const src = imageSrc(imageUrl, mode, label);
  return <img src={src} alt="" onError={() => setMode((current) => current === "direct" ? "proxy" : "placeholder")} className={`${sizeClass} shrink-0 bg-slate-50 object-cover shadow-sm`} />;
}

function candidateSavedBefore(candidate: ProductLookupCandidate, meals: NutritionMeal[]) {
  const label = String(candidate.label || "").trim().toLowerCase();
  const gtin = String(candidate.gtin || candidate.barcode || "").trim();
  return meals.some((meal) => {
    const mealLabel = String(meal.label || "").trim().toLowerCase();
    return (gtin && (meal.gtin === gtin || meal.barcode === gtin)) || (label && mealLabel.includes(label));
  });
}

function weekDateKey(baseDate: string, offset: number) {
  const date = new Date(`${baseDate}T00:00:00`);
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1 + offset);
  return date.toISOString().slice(0, 10);
}

function shortDay(date: string) {
  const parsed = new Date(`${date}T00:00:00`);
  return parsed.toLocaleDateString("en-GB", { weekday: "short", day: "numeric" });
}

function MealImage({ meal, size = "large" }: { meal: Pick<NutritionMeal, "label" | "image_url">; size?: "small" | "large" }) {
  const [mode, setMode] = useState<"direct" | "proxy" | "placeholder">("direct");
  const classes = size === "small" ? "h-12 w-12 rounded-2xl text-xl" : "aspect-square w-full rounded-[1.5rem] text-4xl";
  const src = imageSrc(meal.image_url, mode, meal.label);
  return <img src={src} alt="" onError={() => setMode((current) => current === "direct" ? "proxy" : "placeholder")} className={`${classes} shrink-0 bg-slate-50 object-cover shadow-sm`} />;
}

function HiddenNutritionInputs({ values }: { values: Partial<NutritionTotals> }) {
  return <>{nutritionKeys.map((key) => <input key={key} type="hidden" name={key} value={number(values[key])} />)}</>;
}

function ModalShell({ title, description, children, onClose }: { title: string; description?: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-sm sm:items-center sm:p-6">
      <div className="max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-t-[2rem] border border-white/70 bg-white p-6 shadow-2xl sm:rounded-[2rem]">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-600">LoopHealth</p>
            <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950">{title}</h2>
            {description ? <p className="mt-1 text-sm font-semibold text-slate-500">{description}</p> : null}
          </div>
          <button onClick={onClose} className="rounded-full bg-slate-100 px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-200">Close</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Gauge({ score, label }: { score: number; label: string }) {
  const clamped = Math.max(0, Math.min(100, Math.round(score || 0)));
  const angle = (180 - clamped * 1.8) * (Math.PI / 180);
  const markerX = 150 + 115 * Math.cos(angle);
  const markerY = 148 - 115 * Math.sin(angle);
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-2">
      <svg viewBox="0 0 300 210" className="mx-auto h-[250px] w-full max-w-[520px] overflow-visible" role="img" aria-label={`${label} diet balance score ${clamped} out of 100`}>
        <defs>
          <linearGradient id="loopHealthGauge" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#fb923c" />
            <stop offset="42%" stopColor="#a3e635" />
            <stop offset="72%" stopColor="#34d399" />
            <stop offset="100%" stopColor="#f59e0b" />
          </linearGradient>
        </defs>
        <path d="M 35 148 A 115 115 0 0 1 265 148" fill="none" stroke="#e8eadf" strokeWidth="18" strokeLinecap="round" />
        <path d="M 35 148 A 115 115 0 0 1 265 148" fill="none" stroke="url(#loopHealthGauge)" strokeWidth="18" strokeLinecap="round" />
        <circle cx={markerX} cy={markerY} r="9" fill="white" stroke={ringColor(clamped)} strokeWidth="6" />
        <text x="150" y="106" textAnchor="middle" className="fill-slate-950 text-[15px] font-black">{label}</text>
        <text x="150" y="156" textAnchor="middle" className="fill-slate-950 text-[58px] font-black tracking-tight">{clamped}</text>
        <text x="150" y="184" textAnchor="middle" className="fill-slate-500 text-[9px] font-black uppercase tracking-[0.28em]">Diet balance</text>
        <text x="150" y="202" textAnchor="middle" className="fill-slate-500 text-[8px] font-black uppercase tracking-[0.22em]">{clamped} / 100 daily score</text>
      </svg>
    </div>
  );
}

function MiniMetric({ label, value, note }: { label: string; value: string; note?: string }) {
  return <div className="rounded-2xl bg-white p-3 shadow-sm"><p className="text-[0.65rem] font-black uppercase tracking-wide text-slate-400">{label}</p><p className="mt-1 text-sm font-black text-slate-950">{value}</p>{note ? <p className="mt-1 text-[0.65rem] font-bold text-slate-500">{note}</p> : null}</div>;
}

function PillList({ items, empty = "None flagged" }: { items: string[]; empty?: string }) {
  const shown = items.slice(0, 8);
  return <div className="flex flex-wrap gap-2">{shown.length ? shown.map((item) => <span key={item} className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-700 ring-1 ring-slate-100">{item}</span>) : <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-400 ring-1 ring-slate-100">{empty}</span>}</div>;
}

function DeepNutritionPanel({ values, estimate, meal }: { values: Partial<NutritionTotals>; estimate?: RecipeEstimate | null; meal?: NutritionMeal }) {
  const meta = estimate ? {
    ingredient_ratio_json: estimate.ingredient_ratio_json || [],
    allergen_flags: estimate.allergen_flags || [],
    dietary_flags: estimate.dietary_flags || [],
    manufacturing_notes: estimate.manufacturing_notes || [],
    confidence_reason: estimate.confidence_reason || "",
    processing_level: estimate.processing_level || "unknown",
  } : estimateMetaFromMeal(meal);
  const ratios = Array.isArray(meta.ingredient_ratio_json) ? meta.ingredient_ratio_json.slice(0, 6) : [];
  const confidence = estimate?.confidence ?? meal?.nutrition_confidence ?? 0;
  return (
    <div className="space-y-4 rounded-[2rem] border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-xs font-black uppercase tracking-[0.2em] text-slate-500">Fully considered breakdown</p><p className="text-sm font-semibold text-slate-600">Deep macros, processed-food risks, ingredient ratio and confidence.</p></div>
        <div className="rounded-2xl bg-white px-4 py-3 text-right shadow-sm"><p className="text-[0.65rem] font-black uppercase text-slate-400">Confidence</p><p className="text-xl font-black text-slate-950">{number(confidence).toFixed(0)}%</p></div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-[1.5rem] bg-white/70 p-3">
          <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Carbohydrate hierarchy</p>
          <div className="grid grid-cols-2 gap-2">
            <MiniMetric label="Total carbs" value={`${number(values.carbs_g).toFixed(1)}g`} />
            <MiniMetric label="Fibre" value={`${number(values.fibre_g).toFixed(1)}g`} />
            <MiniMetric label="Soluble" value={`${number(values.soluble_fibre_g).toFixed(1)}g`} note="blood sugar friendly" />
            <MiniMetric label="Insoluble" value={`${number(values.insoluble_fibre_g).toFixed(1)}g`} note="bulk / gut transit" />
            <MiniMetric label="Total sugars" value={`${number(values.sugar_g).toFixed(1)}g`} />
            <MiniMetric label="Added sugar" value={`${number(values.added_sugar_g).toFixed(1)}g`} />
          </div>
        </div>
        <div className="rounded-[1.5rem] bg-white/70 p-3">
          <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Lipid profile</p>
          <div className="grid grid-cols-2 gap-2">
            <MiniMetric label="Total fat" value={`${number(values.fat_g).toFixed(1)}g`} />
            <MiniMetric label="Saturated" value={`${number(values.saturated_fat_g).toFixed(1)}g`} />
            <MiniMetric label="Trans" value={`${number(values.trans_fat_g).toFixed(2)}g`} note="label dependent" />
            <MiniMetric label="Mono" value={`${number(values.monounsaturated_fat_g).toFixed(1)}g`} />
            <MiniMetric label="Poly" value={`${number(values.polyunsaturated_fat_g).toFixed(1)}g`} />
            <MiniMetric label="Omega 3" value={`${number(values.omega_3_g).toFixed(2)}g`} />
          </div>
        </div>
        <div className="rounded-[1.5rem] bg-white/70 p-3">
          <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Hidden / processed markers</p>
          <div className="grid grid-cols-2 gap-2">
            <MiniMetric label="Sodium" value={`${number(values.sodium_mg).toFixed(0)}mg`} />
            <MiniMetric label="Potassium" value={`${number(values.potassium_mg).toFixed(0)}mg`} />
            <MiniMetric label="Calcium" value={`${number(values.calcium_mg).toFixed(0)}mg`} />
            <MiniMetric label="Iron" value={`${number(values.iron_mg).toFixed(1)}mg`} />
            <MiniMetric label="Niacin" value={`${number(values.niacin_mg).toFixed(1)}mg`} />
            <MiniMetric label="Thiamin" value={`${number(values.thiamin_mg).toFixed(2)}mg`} />
          </div>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_0.9fr]">
        <div className="rounded-[1.5rem] bg-white p-4 shadow-sm">
          <p className="text-xs font-black uppercase tracking-wide text-slate-500">Estimated mass ratio</p>
          <div className="mt-3 space-y-2">{ratios.length ? ratios.map((item: any, idx: number) => <div key={`${item.name}-${idx}`} className="grid grid-cols-[1fr_auto] items-center gap-3"><div><p className="text-sm font-black text-slate-950">{item.name}</p><p className="text-xs font-semibold text-slate-500">{item.role || "ingredient"} · confidence {number(item.confidence).toFixed(0)}%</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-black text-slate-700">{number(item.percentage).toFixed(1)}%</span></div>) : <p className="text-sm font-semibold text-slate-500">Run an estimate to see the inferred ingredient split.</p>}</div>
        </div>
        <div className="space-y-3">
          <div className="rounded-[1.5rem] bg-white p-4 shadow-sm"><p className="text-xs font-black uppercase tracking-wide text-slate-500">Behavioural flags</p><div className="mt-2"><PillList items={meta.dietary_flags} /></div></div>
          <div className="rounded-[1.5rem] bg-white p-4 shadow-sm"><p className="text-xs font-black uppercase tracking-wide text-slate-500">Allergen triggers</p><div className="mt-2"><PillList items={meta.allergen_flags} /></div></div>
          <div className="grid grid-cols-2 gap-3"><MiniMetric label="Energy density" value={`${number(values.energy_density_kcal_per_g).toFixed(2)} kcal/g`} /><MiniMetric label="Glycemic impact" value={`${number(values.glycemic_impact_score).toFixed(0)}/100`} /></div>
        </div>
      </div>

      {meta.confidence_reason ? <div className="flex gap-2 rounded-2xl bg-white p-3 text-xs font-bold text-slate-600"><Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />{meta.confidence_reason}</div> : null}
      {meta.manufacturing_notes.length ? <div className="flex gap-2 rounded-2xl bg-orange-50 p-3 text-xs font-bold text-orange-900"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-orange-700" />{meta.manufacturing_notes[0]}</div> : null}
    </div>
  );
}


function timeLabel(value: string | null | undefined) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.slice(0, 5);
}

function googleImageSearchUrl(label: string) {
  return `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(label || "food")}`;
}

function defaultNowTime() {
  const date = new Date();
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function minutesFromTime(value: string) {
  const [rawHours, rawMinutes] = String(value || "00:00").split(":").map(Number);
  const hours = Number.isFinite(rawHours) ? rawHours : 0;
  const minutes = Number.isFinite(rawMinutes) ? rawMinutes : 0;
  return Math.max(0, Math.min(1435, hours * 60 + minutes));
}

function timeFromMinutes(value: number) {
  const rounded = Math.max(0, Math.min(1435, Math.round(Number(value || 0) / 5) * 5));
  return `${String(Math.floor(rounded / 60)).padStart(2, "0")}:${String(rounded % 60).padStart(2, "0")}`;
}

function TimeSliderInput({ name, value, onChange, label, note }: { name: string; value: string; onChange: (value: string) => void; label: string; note?: string }) {
  const minutes = minutesFromTime(value);
  return (
    <label className="block">
      <span className="flex items-center gap-2 text-sm font-bold text-slate-700"><Clock className="h-4 w-4" /> {label}</span>
      <input type="hidden" name={name} value={value} />
      <div className="mt-1 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <span className="rounded-2xl bg-slate-950 px-4 py-2 font-mono text-xl font-black tabular-nums text-white">{value || "--:--"}</span>
          <button type="button" onClick={() => onChange(defaultNowTime())} className="rounded-full bg-slate-100 px-3 py-2 text-xs font-black text-slate-700">Now</button>
        </div>
        <input type="range" min={0} max={1435} step={5} value={minutes} onChange={(event) => onChange(timeFromMinutes(Number(event.target.value)))} className="mt-3 w-full accent-emerald-600" />
        <div className="mt-2 flex justify-between text-[0.65rem] font-black text-slate-400"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>23:55</span></div>
        {note ? <span className="mt-2 block text-xs font-semibold text-slate-500">{note}</span> : null}
      </div>
    </label>
  );
}

type ActiveFoodSource = {
  label: string;
  image_url?: string | null;
  nutrition: Partial<NutritionTotals>;
  adult: number;
  child: number;
  ingredientsText?: string | null;
  ingredientsJson?: Array<{ name?: string; quantity?: string; notes?: string }>;
  ratios?: Array<{ name?: string; percentage?: number; estimated_weight_g?: number; role?: string; confidence?: number }>;
  servingLabel?: string | null;
  confidenceReason?: string | null;
};

function ActiveIngredientBreakdown({ source, portion, allocationMode, targetCount }: { source: ActiveFoodSource; portion: number; allocationMode: "per_person" | "split"; targetCount: number }) {
  const ratios = Array.isArray(source.ratios) ? source.ratios.filter((item) => item?.name).slice(0, 8) : [];
  const ingredients = Array.isArray(source.ingredientsJson) ? source.ingredientsJson.filter((item) => item?.name).slice(0, 8) : [];
  const totalCalories = Math.max(0, number(source.nutrition.calories) * Math.max(0, number(portion)));
  const splitCount = Math.max(1, targetCount);
  const effectivePortion = allocationMode === "split" ? number(portion) / splitCount : number(portion);
  const effectiveCalories = Math.max(0, number(source.nutrition.calories) * effectivePortion);
  const ratioSum = ratios.reduce((sum, item) => sum + Math.max(0, number(item.percentage)), 0);
  const ingredientRows = ratios.length ? ratios.map((item) => {
    const pct = ratioSum > 0 ? number(item.percentage) : 0;
    const kcal = pct > 0 ? effectiveCalories * (pct / 100) : null;
    return { name: String(item.name || "Ingredient"), detail: pct > 0 ? `${pct.toFixed(0)}% estimate${kcal !== null ? ` · ${Math.round(kcal)} kcal` : ""}` : item.role || "estimated ingredient" };
  }) : ingredients.map((item) => ({ name: ingredientLine({ name: String(item.name || "Ingredient"), quantity: item.quantity, notes: item.notes }), detail: "ingredient captured" }));
  const servingModeText = allocationMode === "split"
    ? `${number(portion).toFixed(2)} serving(s) split across ${splitCount} selected target${splitCount === 1 ? "" : "s"} = ${effectivePortion.toFixed(2)} each.`
    : `${number(portion).toFixed(2)} serving(s) logged for each selected person/target.`;

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-3">
        <MiniMetric label="Serving logic" value={allocationMode === "split" ? "Shared serving" : "Per person"} note={servingModeText} />
        <MiniMetric label="Score" value={`${Math.round(scoreMeal(source.nutrition || {}))}/100`} note="Estimate before save" />
        <MiniMetric label="Energy" value={allocationMode === "split" ? `${Math.round(effectiveCalories)} kcal each` : `${Math.round(totalCalories)} kcal each`} note={source.servingLabel || "Base serving estimate"} />
      </div>
      <div className="rounded-[1.5rem] bg-white p-3 ring-1 ring-slate-100">
        <p className="text-xs font-black uppercase tracking-wide text-slate-500">Ingredients being logged</p>
        {ingredientRows.length ? (
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            {ingredientRows.map((item, index) => <div key={`${item.name}-${index}`} className="rounded-2xl bg-slate-50 px-3 py-2"><p className="text-sm font-black text-slate-950">{item.name}</p><p className="text-xs font-semibold text-slate-500">{item.detail}</p></div>)}
          </div>
        ) : source.ingredientsText ? (
          <p className="mt-2 rounded-2xl bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-600">{String(source.ingredientsText).slice(0, 240)}{String(source.ingredientsText).length > 240 ? "…" : ""}</p>
        ) : (
          <p className="mt-2 rounded-2xl bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-500">No structured ingredient list yet. Add a label, URL or freehand detail to improve precision.</p>
        )}
        {source.confidenceReason ? <p className="mt-2 text-xs font-semibold text-slate-400">{source.confidenceReason}</p> : null}
      </div>
    </div>
  );
}

function FoodLogMetaLine({ log, people, includeTime = false }: { log: FoodLog; people: NutritionPerson[]; includeTime?: boolean }) {
  const totals = nutritionFromRecord(log);
  const parts = [personName(people, log.person_id)];
  if (includeTime) {
    const loggedTime = timeLabel(log.eaten_at);
    if (loggedTime) parts.push(loggedTime);
  }
  parts.push(`score ${Math.round(scoreMeal(totals))}/100`);
  if (number(log.drink_volume_ml) > 0) parts.push(`${number(log.drink_volume_ml).toFixed(0)}ml`);
  if (number(log.calories) >= 20) parts.push(`${number(log.calories).toFixed(0)} kcal`);
  if (number(log.protein_g) >= 2) parts.push(`protein ${number(log.protein_g).toFixed(0)}g`);
  if (number(log.fibre_g) >= 0.5) parts.push(`fibre ${number(log.fibre_g).toFixed(1)}g`);
  return <p className="text-sm font-bold text-slate-500">{parts.join(" · ")}</p>;
}

function FoodTimelineRow({ log, people, onEdit }: { log: FoodLog; people: NutritionPerson[]; onEdit: () => void }) {
  const Icon = mealSlotIcon(log.meal_slot);
  const loggedTime = timeLabel(log.eaten_at) || "—";
  return (
    <div className="grid grid-cols-[72px_1fr] gap-3 sm:grid-cols-[92px_1fr]">
      <div className="relative flex justify-end pr-4">
        <span className="sticky top-4 z-10 rounded-2xl bg-slate-950 px-3 py-2 font-mono text-sm font-black tabular-nums text-white shadow-sm">{loggedTime}</span>
        <span className="absolute right-1 top-0 h-full w-px bg-slate-200" />
      </div>
      <div className="flex w-full items-center justify-between gap-3 rounded-3xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
        <div className="flex min-w-0 items-center gap-3">
          <FoodThumb label={log.label} imageUrl={foodLogImage(log)} />
          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[0.65rem] font-black uppercase tracking-wide text-slate-600"><Icon className="h-3.5 w-3.5" /> {mealSlotLabel(log.meal_slot)}</span>
            </div>
            <p className="truncate text-lg font-black text-slate-950">{log.label}</p>
            <FoodLogMetaLine log={log} people={people} />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onEdit} className="rounded-full bg-slate-100 p-2 text-slate-700" title="Edit log"><Edit3 className="h-4 w-4" /></button>
          <form action={deleteFoodEntry}>
            <input type="hidden" name="id" value={log.id} />
            <button className="rounded-full bg-red-50 p-2 text-red-600"><Trash2 className="h-4 w-4" /></button>
          </form>
        </div>
      </div>
    </div>
  );
}

function EditableImageUrlField({ name, label, value, onChange, foodLabel, sourceUrl, compact = false }: { name?: string; label: string; value: string; onChange: (value: string) => void; foodLabel: string; sourceUrl?: string | null; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"direct" | "proxy" | "placeholder">("direct");
  const [status, setStatus] = useState<string | null>(null);
  const [searchUrl, setSearchUrl] = useState(googleImageSearchUrl(foodLabel));
  const [isPending, startTransition] = useTransition();
  const cleanValue = value.trim();
  const src = cleanValue ? imageSrc(cleanValue, mode, foodLabel) : "";

  async function findImageOnline() {
    const target = foodLabel || cleanValue || "food";
    setStatus("Searching for a real food/product image...");
    setSearchUrl(googleImageSearchUrl(target));
    startTransition(async () => {
      try {
        const response = await fetch("/api/nutrition/image-suggest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label: target, sourceUrl }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Could not find an image");
        if (data.search_url) setSearchUrl(String(data.search_url));
        if (data.image_url) {
          onChange(String(data.image_url));
          setMode("direct");
          setStatus(data.note || "Image suggestion added. Save to keep it on your food card/log.");
        } else {
          setStatus(data.note || "No direct image found. Open image search, copy the best image address, then paste it here.");
          setOpen(true);
        }
      } catch (caught) {
        setStatus(caught instanceof Error ? caught.message : "Could not find an image");
        setOpen(true);
      }
    });
  }

  return (
    <div className={compact ? "rounded-[1.5rem] border border-slate-200 bg-white p-3" : "block"}>
      {name && !open ? <input type="hidden" name={name} value={cleanValue} /> : null}
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-bold text-slate-700">{label}</span>
        <button type="button" onClick={() => setOpen((current) => !current)} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-700">{open ? "Hide URL" : "Change image"}</button>
      </div>
      <button type="button" onClick={() => setOpen(true)} className={`mt-2 w-full overflow-hidden rounded-[1.5rem] border border-slate-200 bg-slate-50 text-left ${compact ? "p-2" : "p-3"}`}>
        {src ? <img src={src} alt="" onError={() => setMode((current) => current === "direct" ? "proxy" : "placeholder")} className={`${compact ? "aspect-square" : "aspect-square"} w-full rounded-[1rem] object-cover`} /> : <div className={`${compact ? "aspect-square" : "aspect-square"} grid place-items-center rounded-[1rem] bg-white text-center text-xs font-black text-slate-400`}><ImageIcon className="mb-2 h-5 w-5" /> No image selected yet</div>}
      </button>
      {open ? <div className="mt-3 space-y-2">
        <input name={name} value={cleanValue} onChange={(event) => { onChange(event.target.value); setMode("direct"); }} placeholder="Paste a direct image URL, or use Find image online" className={inputClass} />
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={isPending} onClick={findImageOnline} className="rounded-full bg-emerald-700 px-3 py-2 text-xs font-black text-white disabled:opacity-60">{isPending ? "Finding..." : "Find image online"}</button>
          <a href={searchUrl} target="_blank" rel="noreferrer" className="rounded-full bg-slate-100 px-3 py-2 text-xs font-black text-slate-700">Open image search</a>
          <button type="button" onClick={() => onChange("")} className="rounded-full bg-red-50 px-3 py-2 text-xs font-black text-red-700">Clear</button>
        </div>
        {status ? <p className="rounded-2xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">{status}</p> : null}
      </div> : null}
    </div>
  );
}

function RecipeForm({ people, supermarkets, meal, onClose }: { people: NutritionPerson[]; supermarkets: Supermarket[]; meal?: NutritionMeal; onClose: () => void }) {
  const [mode, setMode] = useState<"custom" | "import">("custom");
  const [label, setLabel] = useState(meal?.label || "");
  const [cardKind, setCardKind] = useState<"recipe" | "ingredient" | "menu" | "product" | "drink_product">((meal?.card_kind === "ingredient" || meal?.card_kind === "menu" || meal?.card_kind === "product") ? meal.card_kind : "recipe");
  const [ingredients, setIngredients] = useState(meal?.ingredients || "");
  const [servings, setServings] = useState(number(meal?.servings || 1) || 1);
  const [recipeInstructions, setRecipeInstructions] = useState<string[]>(() => Array.isArray(meal?.nutrition_json?.instructions) ? meal.nutrition_json.instructions.map(String).filter(Boolean) : []);
  const [sourceVideoUrl, setSourceVideoUrl] = useState<string>(() => String(meal?.nutrition_json?.video_url || meal?.nutrition_json?.source_video_url || (Array.isArray(meal?.nutrition_json?.videos) ? meal.nutrition_json.videos[0] : "") || ""));
  const [imageUrl, setImageUrl] = useState(meal?.image_url || meal?.product_image_url || "");
  const [sourceUrl, setSourceUrl] = useState(meal?.source_url || meal?.product_source_url || "");
  const [importImageUrl, setImportImageUrl] = useState("");
  const [manualIngredient, setManualIngredient] = useState("");
  const [assistantNote, setAssistantNote] = useState<string | null>(null);
  const [suggestedIngredients, setSuggestedIngredients] = useState<Array<{ name: string; quantity?: string; notes?: string; status: "pending" | "accepted" | "rejected" }>>([]);
  const [estimate, setEstimate] = useState<RecipeEstimate | null>(() => meal ? {
    ...nutritionFromRecord(meal),
    servings: number(meal.servings || 1),
    confidence: number(meal.nutrition_confidence),
    health_score: number(meal.nutrition_score || scoreMeal(nutritionFromRecord(meal))),
    image_prompt: meal.image_prompt || "",
    ingredients_json: Array.isArray(meal.ingredients_json) ? meal.ingredients_json : [],
    ingredient_ratio_json: Array.isArray(meal.ingredient_ratio_json) ? meal.ingredient_ratio_json : [],
    allergen_flags: asArray(meal.allergen_flags),
    dietary_flags: asArray(meal.dietary_flags),
    manufacturing_notes: asArray(meal.manufacturing_notes),
    confidence_reason: meal.confidence_reason || "",
    processing_level: (meal.processing_level as RecipeEstimate["processing_level"]) || "unknown",
    micronutrient_notes: Array.isArray(meal.nutrition_json?.micronutrient_notes) ? meal.nutrition_json.micronutrient_notes : [],
    assumptions: Array.isArray(meal.nutrition_json?.assumptions) ? meal.nutrition_json.assumptions : [],
  } : null);
  const [selectedProduct, setSelectedProduct] = useState<ProductLookupCandidate | null>(() => {
    const raw = meal?.product_lookup_json;
    return raw && typeof raw === "object" && raw.label ? raw as ProductLookupCandidate : null;
  });
  const [productQuery, setProductQuery] = useState(meal?.barcode || meal?.gtin || meal?.label || "");
  const [productCandidates, setProductCandidates] = useState<ProductLookupCandidate[]>([]);
  const [ingredientUrl, setIngredientUrl] = useState("");
  const [ingredientUrlNote, setIngredientUrlNote] = useState<string | null>(null);
  const [isIngredientUrlPending, startIngredientUrlTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isLookupPending, startLookupTransition] = useTransition();
  const [isImportPending, startImportTransition] = useTransition();

  useEffect(() => {
    if (label.trim() && (!imageUrl.trim() || imageUrl.trim().startsWith("?"))) {
      setImageUrl(fallbackFoodImageUrl(label));
    }
  }, [label, imageUrl]);

  useEffect(() => {
    const active = suggestedIngredients.filter((item) => item.status !== "rejected");
    setIngredients(active.map(ingredientLine).join("\n"));
  }, [suggestedIngredients]);

  async function lookupProduct(deepResearch = false) {
    const query = productQuery.trim();
    if (!query) {
      setLookupError("Enter a barcode, product name or retailer URL first.");
      return;
    }
    setLookupError(null);
    startLookupTransition(async () => {
      try {
        const response = await fetch("/api/nutrition/product-lookup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, deepResearch }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not lookup product");
        setProductCandidates(Array.isArray(data.candidates) ? data.candidates : []);
        if (!data.candidates?.length) setLookupError(data.note || "No product match found yet. Add the label manually and save it to your database.");
      } catch (caught) {
        setLookupError(caught instanceof Error ? caught.message : "Could not lookup product");
      }
    });
  }

  function applyProduct(candidate: ProductLookupCandidate) {
    const { raw: _raw, ...safeCandidate } = candidate;
    setSelectedProduct(safeCandidate as ProductLookupCandidate);
    setCardKind("product");
    setEstimate(candidate.estimate);
    setLabel(displayProductCandidateLabel(candidate));
    setIngredients(candidate.ingredients_text || candidate.estimate.ingredients_json.map((item) => item.quantity ? `${item.quantity} ${item.name}` : item.name).join("\n"));
    setImageUrl(candidate.image_url || fallbackFoodImageUrl(candidate.label));
    setSourceUrl(candidate.source_url || "");
    setProductCandidates([]);
    setLookupError(null);
  }

  async function importRecipe(usingMode: "custom" | "import") {
    setAssistantNote(null);
    setError(null);
    if (usingMode === "custom" && !label.trim()) {
      setError("Start with the recipe name so LoopHealth can suggest likely ingredients.");
      return;
    }
    if (usingMode === "import" && !sourceUrl.trim() && !importImageUrl.trim()) {
      setError("Add a recipe URL or image URL first.");
      return;
    }
    startImportTransition(async () => {
      try {
        const response = await fetch("/api/nutrition/recipe-import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: usingMode, title: label, sourceUrl, imageUrl: importImageUrl }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not import recipe");
        const recipe = data.recipe || {};
        if (recipe.label) setLabel(recipe.label);
        setCardKind("recipe");
        if (recipe.source_url) setSourceUrl(recipe.source_url);
        if (recipe.image_url) setImageUrl(recipe.image_url);
        else if (recipe.label) setImageUrl(fallbackFoodImageUrl(recipe.label));
        if (recipe.servings || recipe.estimate?.servings) setServings(Number(recipe.servings || recipe.estimate?.servings || 1));
        if (Array.isArray(recipe.instructions)) setRecipeInstructions(recipe.instructions.map(String).filter(Boolean));
        if (recipe.video_url || (Array.isArray(recipe.videos) && recipe.videos[0])) setSourceVideoUrl(String(recipe.video_url || recipe.videos[0]));
        if (recipe.estimate || data.estimate) setEstimate(recipe.estimate || data.estimate);
        const nextIngredients = Array.isArray(recipe.ingredients)
          ? recipe.ingredients
              .filter((item: any) => String(item?.name || item || "").trim() && !/^(main ingredient|ingredient|food item|recipe)$/i.test(String(item?.name || item || "").trim()))
              .map((item: any) => ({ name: String(item.name || item), quantity: String(item.quantity || ""), notes: String(item.notes || ""), status: "pending" as const }))
          : [];
        setSuggestedIngredients(nextIngredients);
        const sourceNote = typeof data.pageTextChars === "number"
          ? `Source read: ${data.sourceRead ? "yes" : "partial"}${data.evidenceIngredients ? ` · ${data.evidenceIngredients} structured ingredient(s)` : ""}${data.pageTextChars ? ` · ${data.pageTextChars} page characters` : ""}.`
          : "";
        setAssistantNote([Array.isArray(recipe.notes) && recipe.notes.length ? recipe.notes.join(" ") : "", data.note || "", sourceNote].filter(Boolean).join(" "));
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not import recipe");
      }
    });
  }

  function updateSuggestionStatus(index: number, status: "accepted" | "rejected") {
    setSuggestedIngredients((current) => current.map((item, idx) => idx === index ? { ...item, status } : item));
  }

  function updateSuggestionField(index: number, key: "name" | "quantity" | "notes", value: string) {
    setSuggestedIngredients((current) => current.map((item, idx) => idx === index ? { ...item, [key]: value, status: item.status === "rejected" ? "pending" : item.status } : item));
  }

  function bulkApply(status: "accepted" | "rejected") {
    setSuggestedIngredients((current) => current.map((item) => item.status === "pending" ? { ...item, status } : item));
  }

  function addManualIngredient() {
    const value = manualIngredient.trim();
    if (!value) return;
    setSuggestedIngredients((current) => [...current, { name: value, quantity: "", notes: "manual addition", status: "accepted" }]);
    setManualIngredient("");
  }

  async function importIngredientFromUrl() {
    const url = ingredientUrl.trim();
    if (!url) {
      setIngredientUrlNote("Paste an ingredient/product URL first.");
      return;
    }
    setIngredientUrlNote("Reading ingredient page and estimating nutrition...");
    startIngredientUrlTransition(async () => {
      try {
        const response = await fetch("/api/nutrition/menu-import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, sourceName: label || "Ingredient URL", importKind: "ingredient" }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not import ingredient URL");
        const item = Array.isArray(data.items) ? data.items[0] : null;
        if (!item) throw new Error("No ingredient/product was found on that URL.");
        const estimate = item.estimate || {};
        const quantity = String(item.quantity || estimate.serving_label || "");
        const name = String(item.label || label || "Ingredient");
        const notes = [item.source_name, item.description].filter(Boolean).join(" · ").slice(0, 180);
        setSuggestedIngredients((current) => [...current, { name, quantity, notes: notes || "imported from URL", status: "accepted" }]);
        setSelectedProduct({
          source: "ingredient_url_import",
          source_label: item.source_name || "Ingredient URL",
          source_url: item.source_url || url,
          label: name,
          brand_name: item.source_name || "Ingredient URL",
          image_url: item.image_url || fallbackFoodImageUrl(name),
          ingredients_text: item.description || "",
          serving_label: quantity || "1 serving",
          data_confidence: number(estimate.confidence || 55),
          confidence_reason: estimate.confidence_reason || "Imported from ingredient/product URL.",
          estimate,
        } as ProductLookupCandidate);
        if (!imageUrl || imageUrl.startsWith("/api/food-image-placeholder")) setImageUrl(item.image_url || fallbackFoodImageUrl(name));
        setSourceUrl(item.source_url || url);
        setCardKind("ingredient");
        if (estimate && Object.keys(estimate).length) setEstimate(estimate);
        setIngredientUrl("");
        setIngredientUrlNote(`Imported ${name}. Review amount and product detail before saving.`);
      } catch (caught) {
        setIngredientUrlNote(caught instanceof Error ? caught.message : "Could not import ingredient URL");
      }
    });
  }


  async function analyseLabelImage(file: File | null) {
    if (!file) return;
    setLookupError(null);
    const reader = new FileReader();
    reader.onload = async () => {
      startLookupTransition(async () => {
        try {
          const response = await fetch("/api/nutrition/label-image", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ imageDataUrl: String(reader.result || ""), productHint: label || productQuery || "Product label", sourceUrl }),
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data.error || "Could not read label image");
          const candidate = data.candidate as ProductLookupCandidate;
          setProductCandidates([candidate]);
          applyProduct(candidate);
          setCardKind(inferFoodEntityType({ label: candidate.label, source: candidate.source, cardKind: (data.raw as any)?.card_kind, ingredients: candidate.ingredients_text }) === "drink_product" ? "drink_product" as any : "product");
          setLookupError(null);
        } catch (caught) {
          setLookupError(caught instanceof Error ? caught.message : "Could not read label image");
        }
      });
    };
    reader.readAsDataURL(file);
  }

  async function analyseRecipe(form: HTMLFormElement) {
    setError(null);
    const formData = new FormData(form);
    const payload = {
      label: String(formData.get("label") || "Recipe"),
      servings: Number(formData.get("servings") || 1),
      ingredients: String(formData.get("ingredients") || ""),
      notes: `${String(formData.get("notes") || "")}\n\nInstructions:\n${recipeInstructions.join("\n")}`.trim(),
    };
    startTransition(async () => {
      try {
        const response = await fetch("/api/nutrition/recipe-estimate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not analyse recipe");
        setEstimate(data.estimate);
        if (data.note) setAssistantNote(data.note);
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Could not analyse recipe");
      }
    });
  }

  const action = meal ? updateNutritionMeal : addNutritionMeal;
  const existingNutrition: Partial<NutritionTotals> = meal ? nutritionFromRecord(meal) : {};
  const values: Partial<NutritionTotals> = estimate || existingNutrition;
  const ingredientsJson = estimate?.ingredients_json || suggestedIngredients.filter((item) => item.status !== "rejected").map((item) => ({ name: item.name, quantity: item.quantity, notes: item.notes })) || meal?.ingredients_json || [];
  const meta = estimate ? {
    ingredient_ratio_json: estimate.ingredient_ratio_json || [],
    allergen_flags: estimate.allergen_flags || [],
    dietary_flags: estimate.dietary_flags || [],
    manufacturing_notes: estimate.manufacturing_notes || [],
    confidence_reason: estimate.confidence_reason || "",
    processing_level: estimate.processing_level || "unknown",
  } : estimateMetaFromMeal(meal);
  const productMeta = selectedProduct || (meal?.product_lookup_json && typeof meal.product_lookup_json === "object" ? meal.product_lookup_json as ProductLookupCandidate : null);
  const isProductCard = cardKind === "ingredient" || cardKind === "product" || cardKind === "drink_product" || Boolean(selectedProduct || meal?.barcode || meal?.gtin || isProductLikeKind(`${meal?.product_data_source || ""} ${productMeta?.source || ""}`));
  const nutritionJson = {
    assumptions: estimate?.assumptions || meal?.nutrition_json?.assumptions || [],
    micronutrient_notes: estimate?.micronutrient_notes || meal?.nutrition_json?.micronutrient_notes || [],
    manufacturing_notes: meta.manufacturing_notes,
    dietary_flags: meta.dietary_flags,
    allergen_flags: meta.allergen_flags,
    product_data_source: productMeta?.source_label || productMeta?.source || meal?.product_data_source || null,
    instructions: recipeInstructions,
    video_url: sourceVideoUrl || null,
    videos: sourceVideoUrl ? [sourceVideoUrl] : [],
  };

  return (
    <form action={action} className="space-y-5" onSubmit={() => window.setTimeout(onClose, 350)}>
      {meal ? <input type="hidden" name="id" value={meal.id} /> : null}
      <HiddenNutritionInputs values={values} />
      <input type="hidden" name="nutrition_score" value={estimate?.health_score ?? meal?.nutrition_score ?? scoreMeal(existingNutrition)} />
      <input type="hidden" name="nutrition_confidence" value={estimate?.confidence ?? meal?.nutrition_confidence ?? 0} />
      <input type="hidden" name="image_prompt" value={estimate?.image_prompt ?? meal?.image_prompt ?? (label ? `A plated serving of ${label}` : "") } />
      <input type="hidden" name="ingredients_json" value={JSON.stringify(ingredientsJson)} />
      <input type="hidden" name="ingredient_ratio_json" value={JSON.stringify(meta.ingredient_ratio_json)} />
      <input type="hidden" name="allergen_flags" value={JSON.stringify(meta.allergen_flags)} />
      <input type="hidden" name="dietary_flags" value={JSON.stringify(meta.dietary_flags)} />
      <input type="hidden" name="manufacturing_notes" value={JSON.stringify(meta.manufacturing_notes)} />
      <input type="hidden" name="confidence_reason" value={meta.confidence_reason} />
      <input type="hidden" name="processing_level" value={meta.processing_level} />
      <input type="hidden" name="nutrition_json" value={JSON.stringify(nutritionJson)} />
      <input type="hidden" name="barcode" value={productMeta?.barcode || meal?.barcode || ""} />
      <input type="hidden" name="gtin" value={productMeta?.gtin || meal?.gtin || productMeta?.barcode || ""} />
      <input type="hidden" name="brand_name" value={productMeta?.brand_name || meal?.brand_name || ""} />
      <input type="hidden" name="product_data_source" value={productMeta?.source || meal?.product_data_source || ""} />
      <input type="hidden" name="product_data_confidence" value={productMeta?.data_confidence ?? meal?.product_data_confidence ?? 0} />
      <input type="hidden" name="product_image_url" value={productMeta?.image_url || meal?.product_image_url || imageUrl || ""} />
      <input type="hidden" name="product_source_url" value={productMeta?.source_url || meal?.product_source_url || sourceUrl || ""} />
      <input type="hidden" name="product_lookup_json" value={JSON.stringify(productMeta || {})} />
      <input type="hidden" name="card_kind" value={cardKind} />

      <div className="grid gap-3 md:grid-cols-2">
        <button type="button" onClick={() => setMode("custom")} className={`rounded-2xl px-4 py-3 text-sm font-black ${mode === "custom" ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-700"}`}>Custom recipe</button>
        <button type="button" onClick={() => setMode("import")} className={`rounded-2xl px-4 py-3 text-sm font-black ${mode === "import" ? "bg-emerald-700 text-white" : "bg-emerald-50 text-emerald-900"}`}>Import recipe</button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {mode === "custom" ? (
            <div className="rounded-[2rem] border border-emerald-100 bg-emerald-50/80 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-end">
                <label className="block flex-1"><span className="text-sm font-black text-emerald-950">What are you making?</span><input value={label} name="label" onChange={(event) => setLabel(event.target.value)} placeholder="Chicken pasta bake, lentil curry, yoghurt bowl..." className="mt-1 w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm font-semibold outline-none ring-emerald-500 transition focus:ring-2" required /></label>
                <button type="button" disabled={isImportPending} onClick={() => importRecipe("custom")} className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white disabled:opacity-60">{isImportPending ? "Thinking..." : "Suggest ingredients"}</button>
              </div>
              <p className="mt-2 text-xs font-semibold text-emerald-900/80">LoopHealth suggests likely ingredients. Use ✓ / ✕ or accept all / reject all, then estimate nutrition from the final list.</p>
            </div>
          ) : (
            <div className="rounded-[2rem] border border-emerald-100 bg-emerald-50/80 p-4">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="block"><span className="flex items-center gap-2 text-sm font-black text-emerald-950"><Link2 className="h-4 w-4" />Recipe URL</span><input value={sourceUrl} name="source_url" onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://..." className="mt-1 w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm font-semibold outline-none ring-emerald-500 transition focus:ring-2" /></label>
                <label className="block"><span className="flex items-center gap-2 text-sm font-black text-emerald-950"><ImageIcon className="h-4 w-4" />Image URL / scanner later</span><input value={importImageUrl} onChange={(event) => setImportImageUrl(event.target.value)} placeholder="Paste an image URL for now" className="mt-1 w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm font-semibold outline-none ring-emerald-500 transition focus:ring-2" /></label>
              </div>
              <div className="mt-3 flex flex-wrap gap-3"><button type="button" disabled={isImportPending} onClick={() => importRecipe("import")} className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white disabled:opacity-60">{isImportPending ? "Importing..." : "Import recipe"}</button><p className="text-xs font-semibold text-emerald-900/80">This simplifies the page: import a recipe from a URL/image, then refine the ingredient list below.</p></div>
              <input type="hidden" name="label" value={label} />
            </div>
          )}

          {suggestedIngredients.length ? <div className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><p className="text-sm font-black text-slate-950">Ingredient suggestions</p><p className="text-xs font-semibold text-slate-500">Accept or reject suggestions. Bulk actions only touch items you have not already clicked.</p></div><div className="flex gap-2"><button type="button" onClick={() => bulkApply("accepted")} className="rounded-full bg-emerald-100 px-3 py-2 text-xs font-black text-emerald-800">Accept all</button><button type="button" onClick={() => bulkApply("rejected")} className="rounded-full bg-red-50 px-3 py-2 text-xs font-black text-red-700">Reject all</button></div></div>
            <div className="space-y-2">{suggestedIngredients.map((item, idx) => <div key={`${item.name}-${idx}`} className={`rounded-2xl border p-3 ${item.status === "rejected" ? "border-red-100 bg-red-50/40 opacity-75" : "border-slate-200 bg-white"}`}><div className="grid gap-2 md:grid-cols-[140px_1fr_auto]"><input value={item.quantity || ""} onChange={(event) => updateSuggestionField(idx, "quantity", event.target.value)} placeholder="Amount" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-black text-slate-900 outline-none ring-emerald-500 focus:ring-2" /><input value={item.name || ""} onChange={(event) => updateSuggestionField(idx, "name", event.target.value)} placeholder="Ingredient" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-black text-slate-900 outline-none ring-emerald-500 focus:ring-2" /><div className="flex gap-2"><button type="button" onClick={() => updateSuggestionStatus(idx, "accepted")} className={`rounded-full px-3 py-2 text-xs font-black ${item.status === "accepted" ? "bg-emerald-600 text-white" : "bg-emerald-50 text-emerald-800"}`}>✓</button><button type="button" onClick={() => updateSuggestionStatus(idx, "rejected")} className={`rounded-full px-3 py-2 text-xs font-black ${item.status === "rejected" ? "bg-red-600 text-white" : "bg-red-50 text-red-700"}`}>✕</button></div></div><input value={item.notes || ""} onChange={(event) => updateSuggestionField(idx, "notes", event.target.value)} placeholder="Optional note, e.g. Graham's gold top milk / 5% fat / decaf" className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 outline-none ring-emerald-500 focus:ring-2" />{ingredientDetailPrompt(item) ? <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-black text-amber-900">{ingredientDetailPrompt(item)}</p> : null}</div>)}</div>
            <div className="mt-4 flex flex-col gap-3 md:flex-row"><input value={manualIngredient} onChange={(event) => setManualIngredient(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addManualIngredient(); } }} placeholder="Add another ingredient, e.g. 5% beef mince or wholewheat pasta" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none ring-emerald-500 transition focus:ring-2" /><button type="button" onClick={addManualIngredient} className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white">Add ingredient</button></div>
            <div className="mt-4 rounded-[1.5rem] border border-dashed border-emerald-200 bg-emerald-50/70 p-3"><p className="text-sm font-black text-emerald-950">Add ingredient from URL</p><p className="mt-1 text-xs font-semibold text-emerald-900/80">Use this for things that product search misses, like syrups, flavourings, specialist products or manufacturer pages.</p><div className="mt-3 flex flex-col gap-2 md:flex-row"><input value={ingredientUrl} onChange={(event) => setIngredientUrl(event.target.value)} placeholder="https://ingredient-or-product-page..." className="w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm font-semibold outline-none ring-emerald-500 transition focus:ring-2" /><button type="button" disabled={isIngredientUrlPending} onClick={importIngredientFromUrl} className="rounded-2xl bg-emerald-700 px-4 py-3 text-sm font-black text-white disabled:opacity-60">{isIngredientUrlPending ? "Importing..." : "Import ingredient"}</button></div>{ingredientUrlNote ? <p className="mt-2 rounded-2xl bg-white px-3 py-2 text-xs font-black text-emerald-900">{ingredientUrlNote}</p> : null}</div>
          </div> : null}

          {!suggestedIngredients.length ? <div className="rounded-[2rem] border border-dashed border-emerald-200 bg-emerald-50/70 p-4"><p className="text-sm font-black text-emerald-950">Add ingredient from URL</p><p className="mt-1 text-xs font-semibold text-emerald-900/80">Use this for syrups, specialist products, milk variants, espresso products or anything barcode search misses.</p><div className="mt-3 flex flex-col gap-2 md:flex-row"><input value={ingredientUrl} onChange={(event) => setIngredientUrl(event.target.value)} placeholder="https://ingredient-or-product-page..." className="w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm font-semibold outline-none ring-emerald-500 transition focus:ring-2" /><button type="button" disabled={isIngredientUrlPending} onClick={importIngredientFromUrl} className="rounded-2xl bg-emerald-700 px-4 py-3 text-sm font-black text-white disabled:opacity-60">{isIngredientUrlPending ? "Importing..." : "Import ingredient"}</button></div>{ingredientUrlNote ? <p className="mt-2 rounded-2xl bg-white px-3 py-2 text-xs font-black text-emerald-900">{ingredientUrlNote}</p> : null}</div> : null}

          <div className="rounded-[2rem] border border-emerald-100 bg-emerald-50/80 p-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
              <label className="block flex-1">
                <span className="flex items-center gap-2 text-sm font-black text-emerald-900"><Barcode className="h-4 w-4" /> Product database lookup</span>
                <input value={productQuery} onChange={(event) => setProductQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); lookupProduct(false); } }} className="mt-1 w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm font-semibold outline-none ring-emerald-500 transition focus:ring-2" placeholder="Scan barcode, paste GTIN, or search Greggs sausage roll / Tesco Greek yoghurt" />
              </label>
              <button type="button" disabled={isLookupPending} onClick={() => lookupProduct(false)} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white disabled:opacity-60">{isLookupPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Barcode className="h-4 w-4" />} Lookup</button>
              <button type="button" disabled={isLookupPending} onClick={() => lookupProduct(true)} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-black text-emerald-800 ring-1 ring-emerald-200 disabled:opacity-60"><Sparkles className="h-4 w-4" /> Retailer search</button>
            </div>
            {lookupError ? <p className="mt-3 rounded-2xl bg-white p-3 text-sm font-black text-orange-800 ring-1 ring-orange-100">{lookupError}</p> : null}
          {/* BUGFIX (production build failure): a "Saved matches" block used
              to be here, copy-pasted from LogFoodForm's equivalent feature.
              It referenced state (selectedMealId, setManualImageUrl,
              setCardSearch, setMealSlot, matchingSavedMeals) that was never
              declared in this component — it could never have worked and
              would have thrown a runtime error on click. This component's
              real, working results list is the productCandidates block
              directly below. */}
            {productCandidates.length ? <div className="mt-4 grid gap-3 md:grid-cols-2">{productCandidates.map((candidate, idx) => { const usedBefore = false; const img = candidate.image_url || fallbackFoodImageUrl(candidate.label); return <button key={`${candidate.gtin || candidate.barcode || candidate.label}-${idx}`} type="button" onClick={() => applyProduct(candidate)} className="relative rounded-[1.5rem] bg-white p-3 text-left shadow-sm ring-1 ring-emerald-100 transition hover:-translate-y-0.5 hover:shadow-lg">{usedBefore ? <span className="absolute right-3 top-3 rounded-full bg-amber-100 p-1 text-amber-700" title="Used before / saved"><Star className="h-4 w-4 fill-current" /></span> : null}<div className="flex gap-3"><FoodThumb label={candidate.label} imageUrl={img} size="md" /><div className="min-w-0 flex-1 pr-8"><p className="line-clamp-2 text-sm font-black text-slate-950">{displayProductCandidateLabel(candidate)}</p><p className="mt-1 text-xs font-bold text-slate-500">{candidate.brand_name || candidate.source_label} · {candidate.data_confidence}% confidence</p></div></div></button>; })}</div> : null}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block"><span className="text-sm font-bold text-slate-700">Person / household</span><select name="person_id" defaultValue={meal?.person_id ?? ""} className={inputClass}><option value="">Household recipe</option>{people.map((person) => <option key={person.id} value={person.id}>{person.name} ({person.relationship})</option>)}</select></label>
            <label className="block"><span className="text-sm font-bold text-slate-700">Card type</span><select value={cardKind} onChange={(event) => setCardKind(event.target.value as "recipe" | "ingredient" | "menu" | "product")} className={inputClass}><option value="recipe">Recipe card</option><option value="ingredient">Ingredient card</option><option value="product">Product card</option><option value="menu">Menu / takeaway card</option></select><span className="mt-1 block text-xs font-semibold text-slate-500">Use this to correct items like VIVE Orange Zero if they were imported as the wrong type.</span></label>
            <label className="block"><span className="text-sm font-bold text-slate-700">Servings made</span><input name="servings" type="number" step="0.01" value={servings} onChange={(event) => setServings(Number(event.target.value || 1))} className={inputClass} /><span className="mt-1 block text-xs font-semibold text-slate-500">Pulled from recipe pages where available; change it if the portion count is wrong.</span></label>
            <FormInput label="Adult serving multiplier" name="adult_serving_multiplier" type="number" step="0.05" defaultValue={meal?.adult_serving_multiplier ?? 1} />
            <FormInput label="Child serving multiplier" name="child_serving_multiplier" type="number" step="0.05" defaultValue={meal?.child_serving_multiplier ?? 0.55} />
            {!isProductCard ? <>
              <input type="hidden" name="estimated_cost" value={0} />
              <input type="hidden" name="supermarket_id" value="" />
            </> : null}
            <EditableImageUrlField name="image_url" label="Recipe / product image" value={imageUrl} onChange={setImageUrl} foodLabel={label || meal?.label || "food"} sourceUrl={sourceUrl} />
            <label className="block md:col-span-2"><span className="text-sm font-bold text-slate-700">Recipe / retailer / manufacturer URL</span><input name="source_url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="Optional source" className={inputClass} /></label><label className="block md:col-span-2"><span className="text-sm font-bold text-slate-700">Source video URL</span><input value={sourceVideoUrl} onChange={(event) => setSourceVideoUrl(event.target.value)} placeholder="Optional cooking/source video URL" className={inputClass} /></label>
            {isProductCard ? <>
              <FormInput label="Estimated shop cost" name="estimated_cost" type="number" step="0.01" defaultValue={meal?.estimated_cost ?? 0} />
              <label className="block"><span className="text-sm font-bold text-slate-700">Supermarket</span><select name="supermarket_id" defaultValue={meal?.supermarket_id ?? ""} className={inputClass}><option value="">No supermarket</option>{supermarkets.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}</select></label>
              <label className="block"><span className="text-xs font-black uppercase text-slate-500">Front label image</span><input name="label_front_image_url" defaultValue={meal?.label_front_image_url ?? ""} placeholder="Optional image URL" className={inputClass} /></label>
              <label className="block"><span className="text-xs font-black uppercase text-slate-500">Ingredients image</span><input name="label_ingredients_image_url" defaultValue={meal?.label_ingredients_image_url ?? ""} placeholder="Optional image URL" className={inputClass} /></label>
              <label className="block"><span className="text-xs font-black uppercase text-slate-500">Nutrition image</span><input name="label_nutrition_image_url" defaultValue={meal?.label_nutrition_image_url ?? ""} placeholder="Optional image URL" className={inputClass} /></label><label className="block md:col-span-2 rounded-2xl border border-dashed border-emerald-200 bg-emerald-50 p-4"><span className="text-xs font-black uppercase text-emerald-800">Upload label image for AI stripping</span><input type="file" accept="image/*" onChange={(event) => analyseLabelImage(event.target.files?.[0] || null)} className="mt-2 block w-full text-sm font-bold text-slate-700" /><span className="mt-2 block text-xs font-semibold text-emerald-900/80">Use this for Supplement Facts / Nutrition labels where no JSON is available.</span></label>
              <label className="flex items-center gap-2 rounded-2xl bg-slate-50 px-3 py-3 text-sm font-black text-slate-700"><input type="checkbox" name="user_verified_label" defaultChecked={Boolean(meal?.user_verified_label)} /> I have checked this against the product label</label>
            </> : null}
            <label className="block md:col-span-2"><span className="text-sm font-bold text-slate-700">Ingredients with quantities / product label text</span><textarea name="ingredients" value={ingredients} onChange={(event) => setIngredients(event.target.value)} rows={8} className={`${inputClass} min-h-[210px] resize-y`} placeholder="Paste ingredients from a recipe card, retailer page or product label" /></label>
            {!isProductCard ? <label className="block md:col-span-2"><span className="text-sm font-bold text-slate-700">How to make it / method</span><textarea value={recipeInstructions.join("\n")} onChange={(event) => setRecipeInstructions(event.target.value.split(/\n+/).map((line) => line.trim()).filter(Boolean))} rows={5} className={`${inputClass} min-h-[140px] resize-y`} placeholder="Pulled from the recipe URL where available, or type your method here." /></label> : <div className="rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-600 md:col-span-2">Product cards do not need a cooking method. Save label/source detail instead.</div>}
            <label className="block md:col-span-2"><span className="text-sm font-bold text-slate-700">Notes / health aim</span><textarea name="notes" defaultValue={meal?.notes ?? ""} rows={3} className={`${inputClass} min-h-[110px] resize-y`} placeholder="High protein, quick tea, kid-friendly, energy drink included etc." /></label>
          </div>
        </div>

        <aside className="rounded-[2rem] bg-emerald-50 p-5">
          <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-800">Recipe / product preview</p>
          <div className="mt-4 rounded-[1.75rem] bg-white p-3 shadow-sm"><MealImage meal={{ label: label || "Recipe", image_url: imageUrl }} /></div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm font-black text-slate-900">
            <div className="rounded-2xl bg-white p-3"><p className="text-xs text-slate-500">Score</p><p className="text-2xl">{number(estimate?.health_score ?? meal?.nutrition_score ?? 0)}</p></div>
            <div className="rounded-2xl bg-white p-3"><p className="text-xs text-slate-500">Confidence</p><p className="text-2xl">{number(estimate?.confidence ?? meal?.nutrition_confidence ?? 0)}%</p></div>
            <div className="rounded-2xl bg-white p-3"><p className="text-xs text-slate-500">Calories</p><p className="text-xl">{number(values.calories).toFixed(0)}</p></div>
            <div className="rounded-2xl bg-white p-3"><p className="text-xs text-slate-500">Protein</p><p className="text-xl">{number(values.protein_g).toFixed(1)}g</p></div>
            <div className="rounded-2xl bg-white p-3"><p className="text-xs text-slate-500">Fibre</p><p className="text-xl">{number(values.fibre_g).toFixed(1)}g</p></div>
            <div className="rounded-2xl bg-white p-3"><p className="text-xs text-slate-500">Salt</p><p className="text-xl">{number(values.salt_g).toFixed(2)}g</p></div>
            <div className="rounded-2xl bg-white p-3"><p className="text-xs text-slate-500">Added sugar</p><p className="text-xl">{number(values.added_sugar_g).toFixed(1)}g</p></div>
            <div className="rounded-2xl bg-white p-3"><p className="text-xs text-slate-500">Sat fat</p><p className="text-xl">{number(values.saturated_fat_g).toFixed(1)}g</p></div>
            <div className="rounded-2xl bg-white p-3"><p className="text-xs text-slate-500">Glycemic</p><p className="text-xl">{number(values.glycemic_impact_score).toFixed(0)}/100</p></div>
            <div className="rounded-2xl bg-white p-3"><p className="text-xs text-slate-500">Density</p><p className="text-xl">{number(values.energy_density_kcal_per_g).toFixed(2)}</p></div>
          </div>
          <button type="button" disabled={isPending} onClick={(event) => analyseRecipe(event.currentTarget.closest("form") as HTMLFormElement)} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-4 py-3 text-sm font-black text-white disabled:opacity-60">{isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} {isPending ? "Estimating..." : "Estimate deep nutrition"}</button>
          {assistantNote ? <p className="mt-3 rounded-2xl bg-white p-3 text-xs font-bold text-slate-600">{assistantNote}</p> : null}
          {error ? <p className="mt-3 rounded-2xl bg-red-50 p-3 text-sm font-black text-red-700">{error}</p> : null}
        </aside>
      </div>

      <DeepNutritionPanel values={values} estimate={estimate} meal={meal} />

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton>{meal ? "Save recipe/product" : "Save recipe/product card"}</SubmitButton>
        <p className="text-xs font-semibold text-slate-500">Where no image is supplied, the card will fall back to a generated-style placeholder based on the dish title for now.</p>
      </div>
    </form>
  );
}


type MenuImportItem = {
  label: string;
  description?: string;
  price?: string;
  allergens?: string[];
  source_url?: string;
  source_name?: string;
  import_kind?: "menu" | "ingredient" | "product";
  estimate?: RecipeEstimate;
  image_url?: string;
};

function MenuImportForm({ onClose }: { onClose: () => void }) {
  const [menuUrl, setMenuUrl] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [items, setItems] = useState<Array<MenuImportItem & { selected: boolean }>>([]);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function importMenu() {
    setError(null);
    setNote(null);
    if (!menuUrl.trim()) {
      setError("Paste a menu, restaurant or bakery URL first.");
      return;
    }
    setNote("Acknowledged. LoopHealth is reading the menu page and will add notifications for start/completion. This usually takes 10–40 seconds.");
    window.dispatchEvent(new Event("loop:notifications-updated"));
    startTransition(async () => {
      try {
        const response = await fetch("/api/nutrition/menu-import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: menuUrl, sourceName }),
        });
        const data = await response.json();
        window.dispatchEvent(new Event("loop:notifications-updated"));
        if (!response.ok) throw new Error(data.error || "Could not import menu");
        setItems((Array.isArray(data.items) ? data.items : []).map((item: MenuImportItem) => ({ ...item, selected: true })));
        const modeLabel = data.dynamicAppDetected
          ? data.headlessSucceeded
            ? "Dynamic page rendered with browser mode."
            : "Dynamic JavaScript menu detected; AI/web fallback used."
          : data.sourceRead
            ? `Direct page evidence read: ${Number(data.pageTextChars || 0).toLocaleString()} characters.`
            : "Web-search/AI extraction used because the public page exposed limited clean text.";
        setNote(`${data.note || "Menu imported."} ${modeLabel} ${data.evidenceNote || ""}`.trim());
      } catch (caught) {
        window.dispatchEvent(new Event("loop:notifications-updated"));
        setError(caught instanceof Error ? caught.message : "Could not import menu");
      }
    });
  }

  const selected = items.filter((item) => item.selected);
  const payload = selected.map((item) => ({
    label: item.label,
    description: item.description || "",
    price: item.price || "",
    source_url: item.source_url || menuUrl,
    allergens: item.allergens || [],
    estimate: item.estimate || null,
    source_name: sourceName || "",
  }));

  return (
    <div className="space-y-5">
      <div className="rounded-[2rem] border border-emerald-100 bg-emerald-50/80 p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_0.45fr_auto] md:items-end">
          <label className="block"><span className="text-sm font-black text-emerald-950">Menu / restaurant / bakery URL</span><input value={menuUrl} onChange={(event) => setMenuUrl(event.target.value)} placeholder="https://www.rudyspizza.co.uk/menu/..." className="mt-1 w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm font-semibold outline-none ring-emerald-500 transition focus:ring-2" /></label>
          <label className="block"><span className="text-sm font-black text-emerald-950">Source name</span><input value={sourceName} onChange={(event) => setSourceName(event.target.value)} placeholder="Rudy's, Greggs, local café" className="mt-1 w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm font-semibold outline-none ring-emerald-500 transition focus:ring-2" /></label>
          <button type="button" disabled={isPending} onClick={importMenu} className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white disabled:opacity-60">{isPending ? "Importing..." : "Import menu"}</button>
        </div>
        <p className="mt-2 text-xs font-semibold text-emerald-900/80">Use this when a product is not in barcode/product search and it is not your own recipe. LoopHealth turns menu items into reusable estimated product cards in bulk.</p>
        {note ? <p className="mt-3 rounded-2xl bg-white p-3 text-xs font-bold text-slate-600 ring-1 ring-emerald-100">{note}</p> : null}
        {error ? <p className="mt-3 rounded-2xl bg-red-50 p-3 text-sm font-black text-red-700">{error}</p> : null}
      </div>

      {items.length ? <div className="rounded-[2rem] border border-slate-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div><p className="text-sm font-black text-slate-950">Menu products found</p><p className="text-xs font-semibold text-slate-500">Untick anything you do not want to save into your household product database.</p></div>
          <div className="flex gap-2"><button type="button" onClick={() => setItems((current) => current.map((item) => ({ ...item, selected: true })))} className="rounded-full bg-emerald-100 px-3 py-2 text-xs font-black text-emerald-800">Select all</button><button type="button" onClick={() => setItems((current) => current.map((item) => ({ ...item, selected: false })))} className="rounded-full bg-slate-100 px-3 py-2 text-xs font-black text-slate-700">Clear</button></div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">{items.map((item, idx) => {
          const estimate = item.estimate;
          const processed = estimate ? scoreProcessedFood({ ...estimate, label: item.label, dietary_flags: estimate.dietary_flags, manufacturing_notes: estimate.manufacturing_notes, processing_level: estimate.processing_level }) : null;
          const gut = estimate ? scoreGutHealth({ ...estimate, label: item.label, dietary_flags: estimate.dietary_flags, manufacturing_notes: estimate.manufacturing_notes, processing_level: estimate.processing_level }) : null;
          return <label key={`${item.label}-${idx}`} className={`block rounded-[1.5rem] border-2 p-4 transition ${item.selected ? "border-emerald-400 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}>
            <div className="flex items-start gap-3"><input type="checkbox" checked={item.selected} onChange={(event) => setItems((current) => current.map((row, rowIdx) => rowIdx === idx ? { ...row, selected: event.target.checked } : row))} className="mt-1" /><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-3"><p className="font-black text-slate-950">{item.label}</p>{item.price ? <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-orange-700">{item.price}</span> : null}</div>{item.description ? <p className="mt-1 text-sm font-semibold text-slate-600">{item.description}</p> : null}<div className="mt-3 grid grid-cols-3 gap-2 text-xs font-black text-slate-700"><span className="rounded-2xl bg-white p-2">kcal {number(estimate?.calories).toFixed(0)}</span><span className="rounded-2xl bg-white p-2">processed {processed?.score ?? 0}</span><span className="rounded-2xl bg-white p-2">gut {gut?.score ?? 0}</span></div>{item.allergens?.length ? <p className="mt-2 text-xs font-bold text-slate-500">Allergens: {item.allergens.join(", ")}</p> : null}</div></div>
          </label>;
        })}</div>
      </div> : null}

      {selected.length ? <form action={bulkAddNutritionMeals} onSubmit={() => window.setTimeout(onClose, 500)} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="items_json" value={JSON.stringify(payload)} />
        <SubmitButton>Save {selected.length} menu item(s)</SubmitButton>
        <p className="text-xs font-semibold text-slate-500">Saved cards are estimates. Menu allergen data is useful, but product labels / restaurant checks still win.</p>
      </form> : null}
    </div>
  );
}


type MenuImportStatus = "idle" | "acknowledged" | "reading" | "structuring" | "ready" | "failed";

function ToggleSetting({ name, title, description, defaultChecked, icon: Icon, comingSoon = false }: { name: string; title: string; description: string; defaultChecked: boolean; icon: React.ElementType; comingSoon?: boolean }) {
  const [enabled, setEnabled] = useState(defaultChecked);
  return (
    <button type="button" onClick={() => setEnabled((current) => !current)} className={`rounded-[2rem] p-5 text-left transition ${enabled ? "bg-emerald-50 ring-2 ring-emerald-200" : "bg-slate-50 ring-1 ring-slate-100"}`}>
      <input type="hidden" name={name} value={enabled ? "on" : "off"} />
      <span className="flex items-start justify-between gap-4">
        <span className="flex items-start gap-3">
          <Icon className={`mt-1 h-5 w-5 ${enabled ? "text-emerald-700" : "text-slate-600"}`} />
          <span>
            <span className="flex flex-wrap items-center gap-2 font-black text-slate-950">{title}{comingSoon ? <span className="rounded-full bg-white px-2 py-1 text-[10px] font-black uppercase text-slate-500 ring-1 ring-slate-100">future</span> : null}</span>
            <span className="mt-1 block text-sm font-semibold text-slate-600">{description}</span>
          </span>
        </span>
        <span className={`relative mt-1 h-7 w-12 rounded-full transition ${enabled ? "bg-emerald-600" : "bg-slate-300"}`} aria-hidden="true">
          <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow-sm transition ${enabled ? "left-6" : "left-1"}`} />
        </span>
      </span>
      <span className={`mt-4 inline-flex rounded-full px-3 py-1 text-xs font-black ${enabled ? "bg-emerald-100 text-emerald-800" : "bg-white text-slate-500 ring-1 ring-slate-100"}`}>{enabled ? "Enabled" : "Off"}</span>
    </button>
  );
}


function MenuImportProgress({ status, sourceReadInfo, itemCount }: { status: MenuImportStatus; sourceReadInfo?: string | null; itemCount: number }) {
  const steps = [
    { key: "acknowledged", label: "Acknowledged" },
    { key: "reading", label: "Reading page" },
    { key: "structuring", label: "Estimating nutrition" },
    { key: "ready", label: "Ready" },
  ];
  const activeIndex = status === "failed" ? 1 : Math.max(0, steps.findIndex((step) => step.key === status));
  if (status === "idle") return null;
  return (
    <div className="mt-4 rounded-[1.5rem] border border-emerald-100 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-black text-slate-950">Menu import status</p>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            {status === "failed" ? "Import failed. Try the direct menu URL or add the product manually." : status === "ready" ? `${itemCount} item(s) ready to review.` : "Usually 10–40 seconds for normal pages; JavaScript menus may queue/fall back to AI web extraction unless headless rendering is enabled."}
          </p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-black ${status === "ready" ? "bg-emerald-100 text-emerald-800" : status === "failed" ? "bg-red-50 text-red-700" : "bg-blue-50 text-blue-700"}`}>{status === "ready" ? "Complete" : status === "failed" ? "Needs attention" : "Processing"}</span>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-4">
        {steps.map((step, idx) => {
          const done = status === "ready" || (status !== "failed" && idx <= activeIndex);
          const active = step.key === status;
          return <div key={step.key} className={`rounded-2xl px-3 py-3 text-xs font-black ${done ? "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-100" : "bg-slate-50 text-slate-400"}`}><span className={`mr-2 inline-grid h-5 w-5 place-items-center rounded-full ${active ? "bg-slate-950 text-white" : done ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-500"}`}>{done && !active ? "✓" : idx + 1}</span>{step.label}</div>;
        })}
      </div>
      {sourceReadInfo ? <p className="mt-3 rounded-2xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600">{sourceReadInfo}</p> : null}
    </div>
  );
}


function LogFoodForm({ people, meals, meal, selectedDate, settings, onClose }: { people: NutritionPerson[]; meals: NutritionMeal[]; meal?: NutritionMeal; selectedDate: string; settings: NutritionSettings; onClose: () => void }) {
  const [selectedMealId, setSelectedMealId] = useState(meal?.id || "");
  const [selectedProduct, setSelectedProduct] = useState<ProductLookupCandidate | null>(null);
  const [productQuery, setProductQuery] = useState("");
  const [productCandidates, setProductCandidates] = useState<ProductLookupCandidate[]>([]);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [cardSearch, setCardSearch] = useState(meal?.label || "");
  const [menuUrl, setMenuUrl] = useState("");
  const [menuImportNote, setMenuImportNote] = useState<string | null>(null);
  const [menuImportStatus, setMenuImportStatus] = useState<MenuImportStatus>("idle");
  const [sourceReadInfo, setSourceReadInfo] = useState<string | null>(null);
  const [menuItems, setMenuItems] = useState<MenuImportItem[]>([]);
  const [isMenuPending, startMenuTransition] = useTransition();
  const [isLookupPending, startLookupTransition] = useTransition();
  const selectedMeal = meal || meals.find((item) => item.id === selectedMealId) || null;
  const existingLabelSet = new Set(meals.map((item) => item.label.toLowerCase().trim()));
  const linkedApprovalPeople = people.filter((person) => person.linked_user_id && person.account_status !== "managed_by_household");
  const defaultLogPerson = useMemo(() => people.find(isSelfPerson) || people.find((person) => /daniel/i.test(person.name)) || people[0] || null, [people]);
  const [selectedPeople, setSelectedPeople] = useState<string[]>(() => selectedMeal?.person_id ? [selectedMeal.person_id] : (defaultLogPerson?.id ? [defaultLogPerson.id] : [HOUSEHOLD_SENTINEL]));
  const defaultMultiplier = selectedMeal ? number(selectedMeal.adult_serving_multiplier || 1) : 1;
  const [portion, setPortion] = useState(defaultMultiplier || 1);
  const [mealSlot, setMealSlot] = useState("meal");
  const [inputMode, setInputMode] = useState<"search" | "ai">("search");
  const [aiDescription, setAiDescription] = useState("");
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [manualImageUrl, setManualImageUrl] = useState(selectedMeal?.image_url || "");
  const [eatenAt, setEatenAt] = useState(defaultNowTime());
  const [drinkVolumeMl, setDrinkVolumeMl] = useState("");
  const [allocationMode, setAllocationMode] = useState<"per_person" | "split">("per_person");
  const [isAiPending, startAiTransition] = useTransition();

  useEffect(() => {
    if (selectedMeal?.person_id) setSelectedPeople([selectedMeal.person_id]);
  }, [selectedMeal?.person_id]);

  useEffect(() => {
    setManualImageUrl(selectedMeal?.image_url || selectedProduct?.image_url || "");
  }, [selectedMeal?.id, selectedProduct?.label]);

  const activeSource: ActiveFoodSource | null = selectedMeal ? {
    label: selectedMeal.label,
    image_url: selectedMeal.image_url,
    nutrition: nutritionFromRecord(selectedMeal),
    adult: number(selectedMeal.adult_serving_multiplier || 1),
    child: number(selectedMeal.child_serving_multiplier || 0.55),
    ingredientsText: selectedMeal.ingredients || "",
    ingredientsJson: Array.isArray(selectedMeal.ingredients_json) ? selectedMeal.ingredients_json : [],
    ratios: Array.isArray(selectedMeal.ingredient_ratio_json) ? selectedMeal.ingredient_ratio_json : [],
    servingLabel: `${number(selectedMeal.servings || 1)} saved serving${number(selectedMeal.servings || 1) === 1 ? "" : "s"}`,
    confidenceReason: selectedMeal.confidence_reason || "",
  } : selectedProduct ? {
    label: displayProductCandidateLabel(selectedProduct),
    image_url: selectedProduct.image_url || "",
    nutrition: selectedProduct.estimate,
    adult: 1,
    child: 0.55,
    ingredientsText: selectedProduct.ingredients_text || "",
    ingredientsJson: Array.isArray(selectedProduct.estimate?.ingredients_json) ? selectedProduct.estimate.ingredients_json : [],
    ratios: Array.isArray(selectedProduct.estimate?.ingredient_ratio_json) ? selectedProduct.estimate.ingredient_ratio_json : [],
    servingLabel: selectedProduct.serving_label || "1 product serving",
    confidenceReason: selectedProduct.confidence_reason || selectedProduct.estimate?.confidence_reason || "",
  } : null;

  function togglePerson(id: string) {
    setSelectedPeople((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  async function lookupProduct(deepResearch = false) {
    const query = productQuery.trim();
    if (!query) {
      setLookupError("Search a product name or barcode first.");
      return;
    }
    setLookupError(null);
    startLookupTransition(async () => {
      try {
        const response = await fetch("/api/nutrition/product-lookup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, deepResearch }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not lookup product");
        setProductCandidates(Array.isArray(data.candidates) ? data.candidates : []);
        if (!data.candidates?.length) setLookupError(data.note || "No product match found yet.");
      } catch (caught) {
        setLookupError(caught instanceof Error ? caught.message : "Could not lookup product");
      }
    });
  }

  function applyProduct(candidate: ProductLookupCandidate) {
    setSelectedMealId("");
    setSelectedProduct({ ...candidate, label: displayProductCandidateLabel(candidate) });
    setProductCandidates([]);
    setLookupError(null);
    setManualImageUrl(candidate.image_url || "");
    setPortion(1);
    const text = `${candidate.label || ""} ${candidate.serving_label || ""} ${candidate.ingredients_text || ""}`;
    if (/\b(water|tea|coffee|espresso|latte|cappuccino|juice|smoothie|shake|drink|squash|milk)\b/i.test(text)) setMealSlot("drink");
  }

  function menuItemToCandidate(item: MenuImportItem): ProductLookupCandidate {
    const estimate = item.estimate || ({} as RecipeEstimate);
    return {
      source: item.import_kind === "ingredient" || item.import_kind === "product" ? "ingredient_url_import" : "restaurant_menu_import",
      source_label: item.source_name || (item.import_kind === "ingredient" ? "Ingredient URL" : "Menu import"),
      source_url: item.source_url || menuUrl || null,
      label: item.label,
      brand_name: item.source_name || "Menu import",
      image_url: (item as any).image_url || fallbackFoodImageUrl(item.label),
      ingredients_text: item.description || "",
      serving_label: "1 item / serving",
      data_confidence: number(estimate.confidence || 52),
      confidence_reason: estimate.confidence_reason || "Estimated from public menu text rather than a full nutrition label.",
      estimate,
    } as ProductLookupCandidate;
  }

  function applyMenuItem(item: MenuImportItem) {
    applyProduct(menuItemToCandidate(item));
  }


  function labelFromFreehand(text: string) {
    return cleanProductOrMealLabel(text);
  }

  async function buildAiEntry() {
    const description = aiDescription.trim();
    if (!description) {
      setAiNote("Describe what you ate or drank first.");
      return;
    }
    const label = labelFromFreehand(description);
    setAiNote("Estimating this as one diary entry. You can adjust the image, time, slot and portion before saving.");
    startAiTransition(async () => {
      try {
        const response = await fetch("/api/nutrition/recipe-estimate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ label, ingredients: description, notes: "Freehand food diary entry", servings: 1 }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Could not estimate this entry");
        const estimate = data.estimate as RecipeEstimate;
        const candidateLabel = cleanProductOrMealLabel(label);
        const candidate: ProductLookupCandidate = {
          source: "ai_freehand",
          source_label: "AI freehand diary",
          source_url: null,
          label: candidateLabel,
          brand_name: null,
          image_url: "",
          ingredients_text: description,
          serving_label: "1 described serving",
          data_confidence: number(estimate?.confidence || 45),
          confidence_reason: estimate?.confidence_reason || "Estimated from a freehand diary description.",
          estimate,
        };
        setSelectedMealId("");
        setSelectedProduct(candidate);
        setManualImageUrl("");
        setPortion(1);
        const parsedVolume = extractVolumeMl(description);
        if (parsedVolume) setDrinkVolumeMl(String(parsedVolume));
        const parsedTime = extractTimeHHMM(description);
        if (parsedTime) setEatenAt(parsedTime);
        if (parsedVolume || /(water|tea|coffee|latte|cappuccino|juice|smoothie|shake|gfuel|g fuel|drink|squash|milk)/i.test(description)) setMealSlot("drink");
        else setMealSlot("meal");
        setAiNote(data.note || "AI entry prepared. Review the estimate, add the time/volume if needed, then save.");
      } catch (caught) {
        setAiNote(caught instanceof Error ? caught.message : "Could not estimate this entry");
      }
    });
  }

  async function importMenuFromLog() {
    if (!menuUrl.trim()) {
      setMenuImportStatus("failed");
      setMenuImportNote("Paste a restaurant, bakery or product page URL first.");
      return;
    }
    setMenuItems([]);
    setSourceReadInfo(null);
    setMenuImportStatus("acknowledged");
    setMenuImportNote("Acknowledged. LoopHealth is starting the import and will also add a notification.");
    window.dispatchEvent(new Event("loop:notifications-updated"));
    window.setTimeout(() => setMenuImportStatus((current) => current === "acknowledged" ? "reading" : current), 500);
    window.setTimeout(() => setMenuImportStatus((current) => current === "reading" ? "structuring" : current), 2500);
    startMenuTransition(async () => {
      try {
        const response = await fetch("/api/nutrition/menu-import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: menuUrl, sourceName: productQuery || "Ingredient/product URL", importKind: "ingredient" }),
        });
        const data = await response.json();
        window.dispatchEvent(new Event("loop:notifications-updated"));
        if (!response.ok) throw new Error(data.error || "Could not import this URL");
        const nextItems = Array.isArray(data.items) ? data.items : [];
        setMenuItems(nextItems);
        setMenuImportStatus("ready");
        const modeLabel = data.dynamicAppDetected
          ? data.headlessSucceeded
            ? "Dynamic JavaScript menu rendered with browser mode"
            : "Dynamic JavaScript menu detected; using AI/web fallback"
          : data.sourceMode === "structured"
            ? "Structured recipe/menu data found"
            : data.sourceRead
              ? "Readable page text found"
              : "AI/web fallback";
        setSourceReadInfo(`${modeLabel}. ${data.evidenceNote || ""} ${data.sourceRead ? `Evidence read: ${Number(data.pageTextChars || 0).toLocaleString()} chars.` : "The public page exposed limited clean text."} ${Number(data.apiHintCount || 0) ? `${data.apiHintCount} API/network hint(s) captured.` : ""}`.trim());
        setMenuImportNote(data.note || `${nextItems.length} item(s) found. Pick one to log or save them to cards.`);
      } catch (caught) {
        setMenuImportStatus("failed");
        setMenuImportNote(caught instanceof Error ? caught.message : "Could not import this URL");
        window.dispatchEvent(new Event("loop:notifications-updated"));
      }
    });
  }

  const approvalNames = linkedApprovalPeople.filter((person) => selectedPeople.includes(person.id)).map((person) => person.name);
  const activeLabel = activeSource?.label || selectedProduct?.label || "Food entry";
  const resolvedImageUrl = manualImageUrl || activeSource?.image_url || selectedProduct?.image_url || "";
  const matchingSavedMeals = useMemo(() => {
    const query = (cardSearch || productQuery).trim().toLowerCase();
    if (!query && !meal) return [];
    return meals
      .filter((meal) => !query || `${meal.label} ${meal.brand_name || ""} ${meal.card_kind || ""} ${meal.product_data_source || ""}`.toLowerCase().includes(query))
      .slice(0, 8);
  }, [meals, cardSearch, productQuery, meal]);
  const realPeopleSelected = selectedPeople.filter((id) => id !== HOUSEHOLD_SENTINEL).length;
  const selectedTargetCount = Math.max(1, realPeopleSelected + (selectedPeople.includes(HOUSEHOLD_SENTINEL) ? 1 : 0));
  const timePromptOn = settings.health_prompt_for_time_enabled !== false;

  return (
    <form action={logFoodEntry} className="space-y-4" onSubmit={() => window.setTimeout(onClose, 350)}>
      <input type="hidden" name="meal_id" value={selectedMeal?.id || ""} />
      <input type="hidden" name="serving_allocation_mode" value={allocationMode} />
      <input type="hidden" name="label" value={activeLabel} /><input type="hidden" name="freehand_description" value={aiDescription} />
      <input type="hidden" name="image_url" value={resolvedImageUrl} />
      <input type="hidden" name="person_ids_json" value={JSON.stringify(selectedPeople)} />
      <HiddenNutritionInputs values={activeSource?.nutrition || {}} />
      {selectedProduct ? (
        <>
          <input type="hidden" name="product_data_source" value={selectedProduct.source || "product_search"} />
          <input type="hidden" name="product_data_confidence" value={selectedProduct.data_confidence || selectedProduct.estimate?.confidence || 0} />
          <input type="hidden" name="product_image_url" value={resolvedImageUrl || selectedProduct.image_url || ""} />
          <input type="hidden" name="product_source_url" value={selectedProduct.source_url || ""} />
          <input type="hidden" name="brand_name" value={selectedProduct.brand_name || selectedProduct.source_label || ""} />
          <input type="hidden" name="barcode" value={selectedProduct.barcode || ""} />
          <input type="hidden" name="gtin" value={selectedProduct.gtin || selectedProduct.barcode || ""} />
          <input type="hidden" name="product_lookup_json" value={JSON.stringify(selectedProduct)} />
          <input type="hidden" name="nutrition_confidence" value={selectedProduct.estimate?.confidence || selectedProduct.data_confidence || 0} />
          <input type="hidden" name="nutrition_score" value={selectedProduct.estimate?.health_score || scoreMeal(selectedProduct.estimate || {})} />
          <input type="hidden" name="allergen_flags" value={JSON.stringify(selectedProduct.estimate?.allergen_flags || [])} />
          <input type="hidden" name="dietary_flags" value={JSON.stringify(selectedProduct.estimate?.dietary_flags || [])} />
          <input type="hidden" name="manufacturing_notes" value={JSON.stringify(selectedProduct.estimate?.manufacturing_notes || [])} />
          <input type="hidden" name="confidence_reason" value={selectedProduct.estimate?.confidence_reason || selectedProduct.confidence_reason || ""} />
          <input type="hidden" name="processing_level" value={selectedProduct.estimate?.processing_level || "unknown"} />
          <input type="hidden" name="image_prompt" value={selectedProduct.estimate?.image_prompt || `A clear food photo of ${selectedProduct.label}`} />
          <input type="hidden" name="source_url" value={selectedProduct.source_url || ""} />
          <input type="hidden" name="ingredients" value={selectedProduct.ingredients_text || ""} />
          <input type="hidden" name="ingredients_json" value={JSON.stringify(selectedProduct.estimate?.ingredients_json || [])} />
          <input type="hidden" name="ingredient_ratio_json" value={JSON.stringify(selectedProduct.estimate?.ingredient_ratio_json || [])} />
          <input type="hidden" name="nutrition_json" value={JSON.stringify({ assumptions: selectedProduct.estimate?.assumptions || [], micronutrient_notes: selectedProduct.estimate?.micronutrient_notes || [], auto_saved_from_log: true })} />
        </>
      ) : null}

      <div className={`rounded-[2rem] border p-4 ${inputMode === "ai" ? "border-slate-200 bg-slate-50" : "border-emerald-100 bg-emerald-50/80"}`}>
        <div className="mb-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => setInputMode("search")} className={`rounded-full px-4 py-2 text-sm font-black ${inputMode === "search" ? "bg-slate-950 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200"}`}>Quick search</button>
          <button type="button" onClick={() => setInputMode("ai")} className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-black ${inputMode === "ai" ? "bg-slate-950 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200"}`}><Sparkles className="h-4 w-4" /> Ask AI</button>
        </div>

        {inputMode === "search" ? <>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <label className="block flex-1"><span className="text-sm font-black text-emerald-950">Quick food / drink search</span><input value={productQuery} onChange={(event) => setProductQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); lookupProduct(false); } }} className="mt-1 w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm font-semibold outline-none ring-emerald-500 transition focus:ring-2" placeholder="Search Greggs sausage roll, Costa latte, Coke Zero..." /></label>
            <button type="button" disabled={isLookupPending} onClick={() => lookupProduct(false)} className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white disabled:opacity-60">{isLookupPending ? "Searching..." : "Search"}</button>
            <button type="button" disabled={isLookupPending} onClick={() => lookupProduct(true)} className="rounded-2xl bg-white px-5 py-3 text-sm font-black text-emerald-800 ring-1 ring-emerald-200 disabled:opacity-60">Retailer search</button>
          </div>
          <p className="mt-2 text-xs font-semibold text-emerald-900/80">Log from saved cards, branded search, retailer lookup or a source URL when the product is not in the database yet.</p>
          {lookupError ? <p className="mt-3 rounded-2xl bg-white p-3 text-sm font-black text-orange-800 ring-1 ring-orange-100">{lookupError}</p> : null}
          {productQuery.trim() && matchingSavedMeals.length ? <div className="mt-4 rounded-[1.5rem] bg-white p-3 ring-1 ring-emerald-100"><p className="mb-2 text-xs font-black uppercase tracking-wide text-emerald-700">Saved matches</p><div className="grid gap-2 md:grid-cols-2">{matchingSavedMeals.map((item) => <button key={item.id} type="button" onClick={() => { setSelectedMealId(item.id); setSelectedProduct(null); setManualImageUrl(item.image_url || item.product_image_url || ""); setCardSearch(item.label); if (isProductLikeKind(`${item.card_kind || ""} ${item.product_data_source || ""}`) && /drink|gfuel|g fuel|coffee|latte/i.test(item.label)) setMealSlot("drink"); }} className={`rounded-2xl px-3 py-2 text-left text-sm font-black ring-1 ${selectedMealId === item.id ? "bg-slate-950 text-white ring-slate-950" : "bg-slate-50 text-slate-800 ring-slate-100"}`}><span className="block">{item.label}</span><span className="block text-xs font-semibold opacity-70">{isProductLikeKind(`${item.card_kind || ""} ${item.product_data_source || ""}`) ? "Product/card" : "Recipe/meal"}</span></button>)}</div></div> : null}
          {lookupError && !productCandidates.length ? (
            <div className="mt-4 rounded-[1.5rem] border border-dashed border-emerald-200 bg-white p-4">
              <p className="text-sm font-black text-slate-950">Not found? Add a URL and LoopHealth will pull it in.</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">Use this for restaurants, bakery menus, takeaway pages or product pages that are not in barcode search yet.</p>
              <div className="mt-3 flex flex-col gap-3 md:flex-row">
                <input value={menuUrl} onChange={(event) => setMenuUrl(event.target.value)} placeholder="https://restaurant-or-product-page..." className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none ring-emerald-500 transition focus:ring-2" />
                <button type="button" disabled={isMenuPending} onClick={importMenuFromLog} className="rounded-2xl bg-emerald-700 px-5 py-3 text-sm font-black text-white disabled:opacity-60">{isMenuPending ? "Scanning..." : "Pull from URL"}</button>
              </div>
              {menuImportNote ? <p className="mt-3 rounded-2xl bg-emerald-50 p-3 text-xs font-black text-emerald-900">{menuImportNote}</p> : null}
              <MenuImportProgress status={menuImportStatus} sourceReadInfo={sourceReadInfo} itemCount={menuItems.length} />
            </div>
          ) : null}
          {productCandidates.length ? <div className="mt-4 grid gap-3 md:grid-cols-2">{productCandidates.map((candidate, idx) => { const usedBefore = candidateSavedBefore(candidate, meals); const img = candidate.image_url || fallbackFoodImageUrl(candidate.label); return <button key={`${candidate.gtin || candidate.barcode || candidate.label}-${idx}`} type="button" onClick={() => applyProduct(candidate)} className="relative rounded-[1.5rem] bg-white p-3 text-left shadow-sm ring-1 ring-emerald-100 transition hover:-translate-y-0.5 hover:shadow-lg">{usedBefore ? <span className="absolute right-3 top-3 rounded-full bg-amber-100 p-1 text-amber-700" title="Used before / saved"><Star className="h-4 w-4 fill-current" /></span> : null}<div className="flex gap-3"><FoodThumb label={candidate.label} imageUrl={img} size="md" /><div className="min-w-0 flex-1 pr-8"><p className="line-clamp-2 text-sm font-black text-slate-950">{displayProductCandidateLabel(candidate)}</p><p className="mt-1 text-xs font-bold text-slate-500">{candidate.brand_name || candidate.source_label} · {candidate.data_confidence}% confidence</p></div></div></button>; })}</div> : null}
          {menuItems.length ? (
            <div className="mt-4 rounded-[1.5rem] bg-white p-4 ring-1 ring-emerald-100">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><p className="text-sm font-black text-slate-950">URL import results</p><p className="text-xs font-semibold text-slate-500">Select one to log now, or save the imported set as reusable cards. Showing up to 120 items where found.</p></div>
                <><input type="hidden" name="items_json" value={JSON.stringify(menuItems)} /><button type="submit" formAction={bulkAddNutritionMeals} className="rounded-full bg-slate-950 px-4 py-2 text-xs font-black text-white">Save all to cards</button></>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">{menuItems.slice(0, 120).map((item, idx) => <button key={`${item.label}-${idx}`} type="button" onClick={() => applyMenuItem(item)} className="rounded-2xl bg-slate-50 p-3 text-left ring-1 ring-slate-100"><p className="font-black text-slate-950">{item.label} {item.price ? <span className="text-emerald-700">{item.price}</span> : null}</p><p className="mt-1 line-clamp-2 text-xs font-semibold text-slate-500">{item.description || "Menu estimate"}</p><p className="mt-1 text-xs font-bold text-slate-400">{number(item.estimate?.confidence).toFixed(0)}% confidence</p></button>)}</div>
            </div>
          ) : null}
        </> : <>
          <label className="block"><span className="flex items-center gap-2 text-sm font-black text-slate-950"><Sparkles className="h-4 w-4" /> Freehand meal / drink diary</span><textarea value={aiDescription} onChange={(event) => setAiDescription(event.target.value)} rows={5} className={`${inputClass} min-h-[140px] resize-y`} placeholder="I've had 2 scrambled eggs with unsalted butter on thick San Francisco sourdough, a splash of extra virgin olive oil from Lidl, one scoop of ZOE Daily 30+ and some grated Double Gloucester cheese..." /></label>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button type="button" disabled={isAiPending} onClick={buildAiEntry} className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white disabled:opacity-60">{isAiPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Build entry</button>
            <p className="text-xs font-semibold text-slate-500">AI fills the same lower form; you still choose who ate it, time, volume and image before saving.</p>
          </div>
          {aiNote ? <p className="mt-3 rounded-2xl bg-white p-3 text-xs font-black text-slate-700 ring-1 ring-slate-100">{aiNote}</p> : null}
        </>}
      </div>

      {!activeSource ? <p className="rounded-[2rem] border border-dashed border-emerald-200 bg-emerald-50/60 p-4 text-sm font-black text-emerald-900">Start with the search bar or Ask AI. Once LOOP has found or built the food/card, the date, time, person, serving and meal-slot options appear underneath.</p> : null}

      {activeSource ? <>
      <div className="grid gap-4 md:grid-cols-2">
        <FormInput label="Date" name="eaten_on" type="date" defaultValue={selectedDate} required />
        <TimeSliderInput name="eaten_at" value={eatenAt} onChange={setEatenAt} label="Time eaten / drunk" note={timePromptOn ? "Used later for caffeine timing, carb release and habit patterning." : undefined} />
        <label className="block">
          <span className="text-sm font-bold text-slate-700">Serving multiplier</span>
          <div className="mt-1 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <input name="serving_multiplier" type="number" step="0.05" value={portion} onChange={(event) => setPortion(Number(event.target.value || 0))} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold outline-none ring-emerald-500 focus:ring-2" />
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setAllocationMode("per_person")} className={`rounded-2xl px-3 py-2 text-xs font-black ${allocationMode === "per_person" ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-700"}`}>Each person</button>
              <button type="button" onClick={() => setAllocationMode("split")} className={`rounded-2xl px-3 py-2 text-xs font-black ${allocationMode === "split" ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-700"}`}>Split/shared</button>
            </div>
            <p className="mt-2 text-xs font-semibold text-slate-500">Each person logs the full serving for every selected person. Split/shared divides one serving across the selected people.</p>
          </div>
        </label>
        {mealSlot === "drink" ? <label className="block"><span className="flex items-center gap-2 text-sm font-bold text-slate-700"><Droplets className="h-4 w-4" /> Drink volume (ml)</span><input name="drink_volume_ml" type="number" min="0" step="25" value={drinkVolumeMl} onChange={(event) => setDrinkVolumeMl(event.target.value)} placeholder="500" className={inputClass} /><span className="mt-1 block text-xs font-semibold text-slate-500">Powders, concentrates and caffeinated drinks have different hydration context at 250ml, 500ml or 2L.</span></label> : <input type="hidden" name="drink_volume_ml" value="0" />}
      </div>

      <div className="rounded-[2rem] border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between gap-3"><div><p className="text-sm font-black text-slate-950">Who ate this?</p><p className="text-xs font-semibold text-slate-500">Tap one, many, or select all. Linked members will get a notification to review and accept the entry.</p></div><button type="button" onClick={() => setSelectedPeople([HOUSEHOLD_SENTINEL, ...people.map((person) => person.id)])} className="rounded-full bg-slate-100 px-3 py-2 text-xs font-black text-slate-700">Select all</button></div>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => togglePerson(HOUSEHOLD_SENTINEL)} className={`flex min-w-[120px] items-center gap-3 rounded-2xl border-2 px-3 py-3 text-left ${selectedPeople.includes(HOUSEHOLD_SENTINEL) ? "border-emerald-500 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}><span className="grid h-10 w-10 place-items-center rounded-full bg-slate-950 text-sm font-black text-white">All</span><span><span className="block text-sm font-black text-slate-950">Household / shared</span><span className="block text-xs font-semibold text-slate-500">Cumulative shared entry</span></span></button>
          {people.map((person) => { const childLocked = settings.health_child_logging_enabled === false && isChild(person); return <button key={person.id} type="button" disabled={childLocked} onClick={() => childLocked ? null : togglePerson(person.id)} className={`flex min-w-[140px] items-center gap-3 rounded-2xl border-2 px-3 py-3 text-left ${childLocked ? "border-slate-200 bg-slate-50 opacity-50" : selectedPeople.includes(person.id) ? "border-emerald-500 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}>{person.avatar_url ? <img src={person.avatar_url} alt="" className="h-10 w-10 rounded-full object-cover" /> : <span className="grid h-10 w-10 place-items-center rounded-full bg-slate-200 text-sm font-black text-slate-700">{initials(person.name)}</span>}<span><span className="flex items-center gap-1 text-sm font-black text-slate-950">{person.name}{person.linked_user_id ? <span className="grid h-4 w-4 place-items-center rounded-full bg-emerald-500 text-[10px] text-white">✓</span> : null}</span><span className="block text-xs font-semibold text-slate-500">{childLocked ? "child logging off" : person.relationship}</span></span></button>; })}
        </div>
        {approvalNames.length ? <p className="mt-3 rounded-2xl bg-emerald-50 px-4 py-3 text-xs font-black text-emerald-900">Approval notification will be sent to: {approvalNames.join(", ")}.</p> : null}
      </div>

      <div className="rounded-[2rem] border border-slate-200 bg-white p-4">
        <p className="text-sm font-black text-slate-950">Meal slot</p>
        <div className="mt-3 flex flex-wrap gap-2">{MEAL_SLOT_OPTIONS.map((slot) => { const Icon = slot.icon; const active = mealSlot === slot.value; return <button key={slot.value} type="button" onClick={() => setMealSlot(slot.value)} className={`inline-flex items-center gap-2 rounded-full px-4 py-3 text-sm font-black ${active ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-700"}`}><Icon className="h-4 w-4" /> {slot.label}</button>; })}</div>
        <input type="hidden" name="meal_slot" value={mealSlot} />
      </div>

      <div className="flex flex-wrap gap-2">
        {activeSource ? <><button type="button" onClick={() => setPortion(number(activeSource.adult || 1))} className="rounded-full bg-slate-100 px-3 py-2 text-xs font-black text-slate-700">1 adult</button>{settings.health_child_scaling_enabled !== false ? <button type="button" onClick={() => setPortion(number(activeSource.child || 0.55))} className="rounded-full bg-emerald-100 px-3 py-2 text-xs font-black text-emerald-700">1 child</button> : null}{settings.health_child_scaling_enabled !== false ? <button type="button" onClick={() => setPortion(number(activeSource.adult || 1) * 2 + number(activeSource.child || 0.55))} className="rounded-full bg-orange-100 px-3 py-2 text-xs font-black text-orange-700">2 adults + child</button> : null}</> : null}
      </div>

      {activeSource ? <div className="rounded-[2rem] border border-slate-200 bg-slate-50 p-4 shadow-sm"><div className="grid gap-4 md:grid-cols-[180px_1fr]"><EditableImageUrlField label="Square image saved with this log" value={resolvedImageUrl} onChange={setManualImageUrl} foodLabel={activeSource.label} sourceUrl={selectedProduct?.source_url || selectedMeal?.source_url || null} compact /><div><p className="flex items-center gap-2 text-lg font-black text-slate-950">{activeSource.label}{(selectedMeal || existingLabelSet.has(activeSource.label.toLowerCase().trim())) ? <Star className="h-4 w-4 fill-amber-400 text-amber-500" /> : null}</p><p className="mt-1 text-xs font-bold text-slate-500">Base: {number(activeSource.nutrition.calories).toFixed(0)} kcal · protein {number(activeSource.nutrition.protein_g).toFixed(1)}g · fibre {number(activeSource.nutrition.fibre_g).toFixed(1)}g</p><p className="mt-2 text-xs font-semibold text-slate-400">Changing the image here saves it against the log and reusable card. Review ingredient estimates before relying on the AI output.</p><div className="mt-3"><ActiveIngredientBreakdown source={activeSource} portion={portion} allocationMode={allocationMode} targetCount={selectedTargetCount} /></div></div></div></div> : <p className="rounded-[2rem] border border-dashed border-slate-300 p-4 text-sm font-semibold text-slate-500">Choose a saved card, search a branded product or build an AI freehand entry first.</p>}

      <FormInput label="Notes" name="notes" placeholder="Felt full, kids ate half, added a drink etc." />
      <div className="flex items-end"><SubmitButton>Log food</SubmitButton></div>
      </> : null}
    </form>
  );
}


function EditLogForm({ people, log, onClose }: { people: NutritionPerson[]; log: FoodLog; onClose: () => void }) {
  const [imageUrl, setImageUrl] = useState(log.image_url || "");
  const [mealSlot, setMealSlot] = useState(log.meal_slot || "meal");
  const [eatenAt, setEatenAt] = useState(timeLabel(log.eaten_at) || defaultNowTime());
  return (
    <form action={updateFoodEntry} className="space-y-4" onSubmit={() => window.setTimeout(onClose, 350)}>
      <input type="hidden" name="id" value={log.id} />
      <input type="hidden" name="meal_id" value={log.meal_id || ""} />
      <HiddenNutritionInputs values={nutritionFromRecord(log)} />
      <div className="grid gap-4 md:grid-cols-2">
        <FormInput label="Food / drink name" name="label" defaultValue={log.label} required />
        <FormInput label="Date" name="eaten_on" type="date" defaultValue={log.eaten_on} required />
        <TimeSliderInput name="eaten_at" value={eatenAt} onChange={setEatenAt} label="Time eaten / drunk" />
        <label className="block"><span className="text-sm font-bold text-slate-700">Person</span><select name="person_id" defaultValue={log.person_id || ""} className={inputClass}><option value="">Household / shared</option>{people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
        <label className="block"><span className="text-sm font-bold text-slate-700">Meal slot</span><select name="meal_slot" value={mealSlot} onChange={(event) => setMealSlot(event.target.value)} className={inputClass}>{MEAL_SLOT_OPTIONS.map((slot) => <option key={slot.value} value={slot.value}>{slot.label}</option>)}</select></label>
        <label className="block"><span className="flex items-center gap-2 text-sm font-bold text-slate-700"><Droplets className="h-4 w-4" /> Drink volume (ml)</span><input name="drink_volume_ml" type="number" min="0" step="25" defaultValue={number(log.drink_volume_ml) || ""} placeholder={mealSlot === "drink" ? "500" : "0"} className={inputClass} /><span className="mt-1 block text-xs font-semibold text-slate-500">Keep this at 0 for food. For drinks, this feeds hydration and timing context.</span></label>
        <input type="hidden" name="serving_multiplier" value="1" />
        <div className="md:col-span-2"><EditableImageUrlField name="image_url" label="Food log image" value={imageUrl} onChange={setImageUrl} foodLabel={log.label} compact /></div>
        <label className="block md:col-span-2"><span className="text-sm font-bold text-slate-700">Notes</span><textarea name="notes" defaultValue={log.notes || ""} rows={3} className={`${inputClass} min-h-[110px] resize-y`} /></label>
      </div>
      <div className="flex items-end"><SubmitButton>Save food log</SubmitButton></div>
    </form>
  );
}


function SourceDetails({ meal }: { meal: NutritionMeal }) {
  const lookup = meal.product_lookup_json && typeof meal.product_lookup_json === "object" ? meal.product_lookup_json : {};
  const sourceName = meal.brand_name || lookup.source_label || meal.nutrition_json?.import_source || null;
  const menuPrice = lookup.price || meal.nutrition_json?.menu_price || (meal.estimated_cost ? `£${number(meal.estimated_cost).toFixed(2)}` : null);
  const sourceUrl = meal.product_source_url || meal.source_url || lookup.source_url || null;
  const isMenu = String(meal.product_data_source || lookup.source || "").includes("menu") || asArray(meal.dietary_flags).includes("restaurant / menu estimate");
  const allergens = asArray(meal.allergen_flags);

  if (!sourceName && !menuPrice && !sourceUrl && !meal.confidence_reason && !allergens.length && !isMenu) return null;

  return (
    <div className="mt-3 rounded-2xl border border-slate-100 bg-slate-50 p-3 text-xs font-bold text-slate-600">
      <div className="mb-2 flex flex-wrap gap-2">
        {isMenu ? <span className="rounded-full bg-emerald-100 px-2 py-1 font-black text-emerald-800">Menu estimate</span> : null}
        {sourceName ? <span className="rounded-full bg-white px-2 py-1 text-slate-700 ring-1 ring-slate-100">{sourceName}</span> : null}
        {menuPrice ? <span className="rounded-full bg-white px-2 py-1 text-slate-700 ring-1 ring-slate-100">{String(menuPrice)}</span> : null}
        {sourceUrl ? <a href={String(sourceUrl)} target="_blank" rel="noreferrer" className="rounded-full bg-white px-2 py-1 text-emerald-700 ring-1 ring-emerald-100">Open source</a> : null}
      </div>
      {meal.confidence_reason ? <p className="line-clamp-2">Confidence: {meal.confidence_reason}</p> : null}
      {allergens.length ? <div className="mt-2"><p className="mb-1 text-[0.65rem] font-black uppercase tracking-wide text-slate-400">Allergens</p><PillList items={allergens.slice(0, 6)} /></div> : null}
    </div>
  );
}

function RecipeCard({ meal, onLog, onEdit }: { meal: NutritionMeal; onLog: () => void; onEdit: () => void }) {
  const score = number(meal.nutrition_score || scoreMeal(nutritionFromRecord(meal)));
  const processed = scoreProcessedFood({ ...nutritionFromRecord(meal), label: meal.label, dietary_flags: meal.dietary_flags, manufacturing_notes: meal.manufacturing_notes, processing_level: meal.processing_level || undefined });
  const gut = scoreGutHealth({ ...nutritionFromRecord(meal), label: meal.label, dietary_flags: meal.dietary_flags, manufacturing_notes: meal.manufacturing_notes, processing_level: meal.processing_level || undefined });
  const productLike = isProductLikeKind(`${meal.card_kind || ""} ${meal.product_data_source || ""}`);
  const updateStatus = nutritionUpdateStatus(meal);
  return (
    <article className="relative flex h-full flex-col overflow-hidden rounded-[2rem] border border-white/70 bg-white shadow-lg">
      {updateStatus ? <span className="absolute right-4 top-4 z-10 rounded-full bg-amber-100 px-3 py-2 text-xs font-black text-amber-800" title={productUpdateStatusLabel(updateStatus)}>⏱ {updateStatus}</span> : null}<div className="p-3"><MealImage meal={meal} /></div>
      <div className="flex flex-1 flex-col px-5 pb-5">
        <div className="flex items-start justify-between gap-3">
          <div><p className="text-xs font-black uppercase tracking-wide text-slate-500">{number(meal.servings).toFixed(0)} serving(s) · confidence {number(meal.nutrition_confidence).toFixed(0)}%</p><h3 className="mt-1 text-xl font-black text-slate-950">{meal.label}</h3>{meal.brand_name || meal.barcode ? <p className="mt-1 text-xs font-bold text-emerald-700">{meal.brand_name ? `${meal.brand_name} · ` : ""}{meal.barcode ? `barcode ${meal.barcode}` : meal.product_data_source}</p> : null}</div>
          <span className="rounded-2xl px-3 py-2 text-lg font-black" style={{ backgroundColor: `${ringColor(score)}22`, color: ringColor(score) }}>{score}</span>
        </div>
        <div className="mt-4 grid grid-cols-4 gap-2 text-center text-xs font-black text-slate-700">
          <div className="rounded-2xl bg-slate-50 p-2"><span className="block text-slate-400">kcal</span>{number(meal.calories).toFixed(0)}</div>
          <div className="rounded-2xl bg-slate-50 p-2"><span className="block text-slate-400">protein</span>{number(meal.protein_g).toFixed(0)}g</div>
          <div className="rounded-2xl bg-slate-50 p-2"><span className="block text-slate-400">added sugar</span>{number(meal.added_sugar_g).toFixed(1)}g</div>
          <div className="rounded-2xl bg-slate-50 p-2"><span className="block text-slate-400">sat fat</span>{number(meal.saturated_fat_g).toFixed(1)}g</div>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs font-black text-slate-700">
          <div className="rounded-2xl bg-slate-50 p-2"><span className="block text-slate-400">sol fibre</span>{number(meal.soluble_fibre_g).toFixed(1)}g</div>
          <div className="rounded-2xl bg-slate-50 p-2"><span className="block text-slate-400">glycemic</span>{number(meal.glycemic_impact_score).toFixed(0)}</div>
          <div className="rounded-2xl bg-slate-50 p-2"><span className="block text-slate-400">density</span>{number(meal.energy_density_kcal_per_g).toFixed(2)}</div>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs font-black text-slate-700"><div className="rounded-2xl bg-orange-50 p-2"><span className="block text-orange-700">processed</span>{processed.score}/100</div><div className="rounded-2xl bg-emerald-50 p-2"><span className="block text-emerald-700">gut health</span>{gut.score}/100</div></div>
        <div className="mt-3"><p className="mb-1 text-[0.65rem] font-black uppercase tracking-wide text-slate-400">Dietary flags</p><PillList items={asArray(meal.dietary_flags).slice(0, 5)} empty="No dietary flags yet" /></div>
        {productLike ? <div className="mt-3 rounded-2xl bg-slate-50 p-3 text-xs font-bold text-slate-600">Product card — no cooking method needed. Use Source/Correction to improve the label data.</div> : Array.isArray(meal.nutrition_json?.instructions) && meal.nutrition_json.instructions.length ? <div className="mt-3 flex h-40 flex-col rounded-2xl bg-slate-50 p-3 text-xs font-bold text-slate-600"><p className="mb-1 text-[0.65rem] font-black uppercase tracking-wide text-slate-400">How to make it</p><ol className="list-decimal space-y-1 overflow-auto pl-4">{meal.nutrition_json.instructions.slice(0, 5).map((step: string, idx: number) => <li key={`${step}-${idx}`}>{step}</li>)}</ol></div> : <form action={generateMealMethod} className="mt-3 rounded-2xl border border-dashed border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-900"><input type="hidden" name="id" value={meal.id} /><p>No saved method yet.</p><button className="mt-2 rounded-full bg-emerald-100 px-3 py-2 text-xs font-black text-emerald-800">Generate method</button></form>}
        <div className="mt-3"><SourceDetails meal={meal} /></div>{productLike ? <form action={queueNutritionProductCorrection} className="mt-3 space-y-2"><input type="hidden" name="meal_id" value={meal.id} /><input type="hidden" name="label" value={meal.label} /><input name="source_url" placeholder="Submit label/source URL to correct this product" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold outline-none" /><button className="w-full rounded-full bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-800">Queue correction</button></form> : null}
        {meal.image_prompt ? <p className="mt-3 line-clamp-2 text-xs font-semibold text-slate-500">Image idea: {meal.image_prompt}</p> : null}
        <div className="mt-auto pt-4"><div className="flex flex-wrap gap-2"><Link href={`/nutrition/cards/${meal.id}`} className="rounded-full bg-emerald-50 px-4 py-2 text-sm font-black text-emerald-800">View card</Link><button onClick={onLog} className="rounded-full bg-slate-950 px-4 py-2 text-sm font-black text-white">Log today</button><button onClick={onEdit} className="rounded-full bg-slate-100 px-4 py-2 text-sm font-black text-slate-700">Edit</button><form action={setNutritionMealCardKind}><input type="hidden" name="id" value={meal.id} /><input type="hidden" name="card_kind" value={productLike ? "recipe" : "product"} /><button className="rounded-full bg-slate-100 px-4 py-2 text-sm font-black text-slate-700">Mark as {productLike ? "recipe" : "product"}</button></form><form action={deleteNutritionMeal}><input type="hidden" name="id" value={meal.id} /><button className="rounded-full bg-red-50 px-4 py-2 text-sm font-black text-red-600">Delete</button></form></div></div>
      </div>
    </article>
  );
}

export function NutritionClient({ people, meals, logs, supermarkets, selectedDate, settings, initialOpen = null, initialMealId = null }: Props) {
  const [modal, setModal] = useState<Modal>(null);
  const [activePanel, setActivePanel] = useState<NutritionPanel>("log");
  const todayLogs = logs.filter((log) => log.eaten_on === selectedDate);
  const selfPerson = useMemo(() => people.find(isSelfPerson) || people.find((person) => /daniel/i.test(person.name)) || people[0] || null, [people]);
  const [activePersonId, setActivePersonId] = useState<string>(() => selfPerson?.id || HOUSEHOLD_SENTINEL);
  useEffect(() => {
    if (activePersonId !== HOUSEHOLD_SENTINEL && activePersonId !== "__all__" && !people.some((person) => person.id === activePersonId)) {
      setActivePersonId(selfPerson?.id || HOUSEHOLD_SENTINEL);
    }
  }, [activePersonId, people, selfPerson?.id]);
  const viewLabel = activePersonId === "__all__" ? "Everyone" : activePersonId === HOUSEHOLD_SENTINEL ? "Household / shared" : personName(people, activePersonId);
  const viewedTodayLogs = useMemo(() => todayLogs.filter((log) => logBelongsToView(log, activePersonId)), [todayLogs, activePersonId]);
  const timelineLogs = useMemo(() => viewedTodayLogs.slice().sort(sortLogsByConsumption), [viewedTodayLogs]);
  const streakDays = useMemo(() => {
    let streak = 0;
    const byDate = new Map<string, FoodLog[]>();
    logs.filter((log) => logBelongsToView(log, activePersonId)).forEach((log) => byDate.set(log.eaten_on, [...(byDate.get(log.eaten_on) || []), log]));
    for (let idx = 0; idx < 7; idx += 1) {
      const date = new Date(`${selectedDate}T00:00:00`);
      date.setDate(date.getDate() - idx);
      const key = date.toISOString().slice(0, 10);
      const dayLogs = byDate.get(key) || [];
      const totals = addNutritionTotals(dayLogs.map(nutritionFromRecord));
      if (scoreNutritionDay(totals).score >= 65 && dayLogs.length > 0) streak += 1;
      else break;
    }
    return streak;
  }, [logs, selectedDate, activePersonId]);
  const totals = useMemo(() => addNutritionTotals(viewedTodayLogs.map(nutritionFromRecord)), [viewedTodayLogs]);
  const hydrationMl = viewedTodayLogs.reduce((sum, log) => sum + number(log.drink_volume_ml), 0);
  const rawDailyScore = scoreNutritionDay(totals, streakDays);
  const dailyScore = viewedTodayLogs.length === 0 ? {
    score: 0,
    label: "Not started",
    tone: "low" as const,
    highlights: [],
    nudges: ["Start your day with water, then add meals or drinks to build a meaningful nutrition score."],
    snippet: `${viewLabel} has nothing logged yet, so this view begins at 0 / 100 until food or drinks are added.`,
  } : rawDailyScore;
  const dayQuickMeals = useMemo(() => {
    const seen = new Set<string>();
    return viewedTodayLogs
      .map((log) => log.meal_id ? meals.find((meal) => meal.id === log.meal_id) : null)
      .filter((meal): meal is NutritionMeal => Boolean(meal && !seen.has(meal.id) && seen.add(meal.id)))
      .slice(0, 4);
  }, [viewedTodayLogs, meals]);
  const weeklyDays = useMemo(() => Array.from({ length: 7 }, (_, idx) => {
    const date = weekDateKey(selectedDate, idx);
    const entries = logs.filter((log) => log.eaten_on === date && logBelongsToView(log, activePersonId));
    const dayTotals = addNutritionTotals(entries.map(nutritionFromRecord));
    const score = entries.length ? scoreNutritionDay(dayTotals).score : 0;
    const fill = entries.length ? Math.max(12, Math.min(100, score)) : 0;
    return { date, entries, totals: dayTotals, score, fill, active: date === selectedDate };
  }), [logs, selectedDate, activePersonId]);
  const weekScrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!initialOpen) return;
    if (initialOpen === "recipe") setModal({ type: "recipe" });
    if (initialOpen === "log") {
      const matchedMeal = initialMealId ? meals.find((item) => item.id === initialMealId) : undefined;
      setModal(matchedMeal ? { type: "log", meal: matchedMeal } : { type: "log" });
    }
    if (initialOpen === "edit-recipe" && initialMealId) {
      const matchedMeal = meals.find((item) => item.id === initialMealId);
      if (matchedMeal) setModal({ type: "edit-recipe", meal: matchedMeal });
    }
  }, [initialOpen, initialMealId, meals]);

  useEffect(() => {
    const scroller = weekScrollerRef.current;
    const active = scroller?.querySelector<HTMLElement>("[data-active-day='true']");
    if (scroller && active) {
      const left = active.offsetLeft - scroller.clientWidth / 2 + active.clientWidth / 2;
      scroller.scrollTo({ left: Math.max(0, left), behavior: "smooth" });
    }
  }, [selectedDate, activePersonId]);

  const perLogProcessed = viewedTodayLogs.map((log) => ({ log, processed: scoreProcessedFood({ ...nutritionFromRecord(log), label: log.label, processing_level: log.meal_slot === "drink" ? "drink" : undefined }) }));
  const processedFromEntries = perLogProcessed.length
    ? Math.round(perLogProcessed.reduce((sum, item) => sum + item.processed.score * Math.max(1, number(item.log.calories)), 0) / perLogProcessed.reduce((sum, item) => sum + Math.max(1, number(item.log.calories)), 0))
    : 0;
  const processedEntry = perLogProcessed.find((item) => item.processed.score >= 65);
  const baseBalanceRecommendations = nutritionBalanceRecommendations(totals, undefined, dailyScore.nudges);
  const processedEntryNudge = processedEntry
    ? (String(processedEntry.log.meal_slot || "").toLowerCase() === "drink"
      ? `${processedEntry.log.label} is logged as a drink. Treat sweeteners/syrups as add-ons, not the whole drink: keep an eye on caffeine, fluids and sugar/salt balance.`
      : `${processedEntry.log.label} looks heavily processed — balance the day with a simple high-fibre meal rather than another pastry/takeaway item.`)
    : null;
  const balanceRecommendations = {
    ...baseBalanceRecommendations,
    processed: processedFromEntries > baseBalanceRecommendations.processed.score ? { ...baseBalanceRecommendations.processed, score: processedFromEntries, label: processedFromEntries >= 70 ? "High processed load" : processedFromEntries >= 45 ? "Moderate processed load" : baseBalanceRecommendations.processed.label } : baseBalanceRecommendations.processed,
    recommendations: Array.from(new Set([
      ...(processedEntryNudge ? [processedEntryNudge] : []),
      ...baseBalanceRecommendations.recommendations,
    ])).slice(0, 6),
  };
  const foodVsExerciseNote = "Apple Health sync belongs in the future native app: HealthKit can read workouts, active energy and mindful minutes, then this page can compare food balance vs training effort for the week.";

  return (
    <main className="mx-auto w-[95vw] max-w-none space-y-7 px-4 py-6 sm:px-6 lg:px-8">
      <section className="overflow-hidden rounded-[2.5rem] bg-[radial-gradient(circle_at_20%_15%,rgba(236,253,245,.25),transparent_28%),linear-gradient(135deg,#071121,#10243d_52%,#275044)] p-7 text-white shadow-2xl shadow-slate-950/20">
        <div className="mx-auto max-w-5xl text-center">
          <p className="inline-flex rounded-full bg-white/10 px-4 py-2 text-xs font-black uppercase tracking-[0.25em] text-emerald-100 ring-1 ring-white/10"><HeartPulse className="mr-2 h-4 w-4" /> Health command centre</p>
          <h1 className="mt-6 text-4xl font-black tracking-tight md:text-6xl">A smarter way to measure your diet.</h1>
          <p className="mx-auto mt-3 max-w-3xl text-base font-semibold text-slate-200">Build recipe cards with ingredient ratios, deep macro splits, fortification estimates, allergen flags and confidence scoring — then let the daily score swing as food and drinks are logged.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3"><button onClick={() => setModal({ type: "recipe" })} className="inline-flex items-center gap-2 rounded-full bg-emerald-400 px-5 py-3 text-sm font-black text-slate-950"><Plus className="h-4 w-4" /> Add recipe</button><button onClick={() => setModal({ type: "log" })} className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-black text-slate-950"><Utensils className="h-4 w-4" /> Log food</button><Link href="/nutrition/cards" className="inline-flex items-center gap-2 rounded-full bg-white/10 px-5 py-3 text-sm font-black text-white ring-1 ring-white/20"><Salad className="h-4 w-4" /> Meal cards</Link></div>
        </div>
      </section>

      <section className="rounded-[2.5rem] border border-white/70 bg-white/85 p-5 shadow-xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-600">Nutrition view</p>
            <h2 className="text-2xl font-black text-slate-950">Currently counting: {viewLabel}</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">Calories, score, hydration and coach snippets only use the selected person/view. Food allocated to Bethany, Oakley or another profile will not be added to Daniel unless that profile is selected.</p>
          </div>
          <div className="flex max-w-full gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button onClick={() => setActivePersonId(selfPerson?.id || HOUSEHOLD_SENTINEL)} className={`shrink-0 rounded-full px-4 py-2 text-sm font-black ${activePersonId === (selfPerson?.id || HOUSEHOLD_SENTINEL) ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-700"}`}>Me</button>
            <button onClick={() => setActivePersonId("__all__")} className={`shrink-0 rounded-full px-4 py-2 text-sm font-black ${activePersonId === "__all__" ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-700"}`}>Everyone</button>
            <button onClick={() => setActivePersonId(HOUSEHOLD_SENTINEL)} className={`shrink-0 rounded-full px-4 py-2 text-sm font-black ${activePersonId === HOUSEHOLD_SENTINEL ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-700"}`}>Household</button>
            {people.map((person) => (
              <button key={person.id} onClick={() => setActivePersonId(person.id)} className={`flex shrink-0 items-center gap-2 rounded-full px-3 py-2 text-sm font-black ${activePersonId === person.id ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-700"}`}>
                {person.avatar_url ? <img src={person.avatar_url} alt="" className="h-6 w-6 rounded-full object-cover" /> : <span className="grid h-6 w-6 place-items-center rounded-full bg-white/80 text-[0.65rem] font-black text-slate-700">{initials(person.name).slice(0, 1)}</span>}
                {person.name}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-[2.5rem] border border-white/70 bg-white/85 p-5 shadow-xl">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div><p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-600">This week</p><h2 className="text-2xl font-black text-slate-950">Weekly balance</h2><p className="mt-1 text-sm font-semibold text-slate-500">Swipe across the week. These tiles follow the selected nutrition view, so someone else’s meal does not change your count.</p></div>
          <button onClick={() => setActivePanel("log")} className="rounded-full bg-slate-950 px-4 py-2 text-sm font-black text-white">Open food log</button>
        </div>
        <div ref={weekScrollerRef} className="flex snap-x gap-3 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] md:grid md:grid-cols-7 md:overflow-visible [&::-webkit-scrollbar]:hidden">
          {weeklyDays.map((day) => {
            const colour = day.score >= 75 ? "bg-emerald-400" : day.score >= 55 ? "bg-lime-300" : day.score > 0 ? "bg-orange-300" : "bg-slate-200";
            const calories = number(day.totals.calories);
            const calorieFill = day.entries.length ? Math.max(8, Math.min(100, calories / DAILY_TARGETS.calories * 100)) : 0;
            return <Link key={day.date} data-active-day={day.active ? "true" : "false"} href={`/nutrition?date=${day.date}`} className={`group min-w-[76vw] snap-center rounded-[1.5rem] border p-3 transition hover:-translate-y-0.5 hover:shadow-lg sm:min-w-[260px] md:min-w-0 ${day.active ? "border-slate-950 bg-slate-950 text-white" : "border-slate-200 bg-slate-50 text-slate-900"}`}>
              <div className="flex items-center justify-between gap-2"><span className="text-xs font-black uppercase tracking-wide">{shortDay(day.date)}</span><span className={`rounded-full px-2 py-1 text-xs font-black ${day.active ? "bg-white text-slate-950" : "bg-white text-slate-600"}`}>{day.score}/100</span></div>
              <div className="mt-3 h-16 overflow-hidden rounded-2xl bg-white/70 ring-1 ring-slate-100 md:h-20">
                <div className="flex h-full items-stretch"><div className={`${colour} transition-all`} style={{ width: `${calorieFill}%` }} /></div>
              </div>
              <p className={`mt-2 text-xs font-bold ${day.active ? "text-white/80" : "text-slate-500"}`}>{day.entries.length} item(s) · {calories.toFixed(0)} kcal</p>
            </Link>;
          })}
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-[2.5rem] border border-white/70 bg-[#f4f3df] p-6 shadow-xl">
          <div className="text-center"><p className="text-sm font-black text-slate-700">{dateLabel(selectedDate)}</p></div>
          <Link href={`/nutrition/day?date=${selectedDate}&person=${encodeURIComponent(activePersonId)}`} className="block rounded-[2rem] transition hover:bg-white/30"><Gauge score={dailyScore.score} label={dailyScore.label} /></Link>
          <div className="mx-auto mt-2 grid max-w-xl grid-cols-4 gap-3">
            {dayQuickMeals.map((meal) => <button key={meal.id} onClick={() => setModal({ type: "log", meal })} className="relative overflow-hidden rounded-2xl border-2 border-white bg-white shadow-md" title="Log this again"><MealImage meal={meal} size="small" /><span className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-slate-950 text-white"><CheckCircle2 className="h-4 w-4" /></span><span className="absolute bottom-1 right-1 rounded-xl bg-lime-300 px-2 py-1 text-sm font-black text-slate-900">{number(meal.nutrition_score || scoreMeal(nutritionFromRecord(meal))).toFixed(0)}</span></button>)}
          </div>
          <p className="mx-auto mt-5 max-w-xl rounded-3xl bg-white/75 p-4 text-center text-sm font-black text-slate-800">{dailyScore.snippet}</p>
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          <TargetBar label="Calories" value={number(totals.calories)} target={DAILY_TARGETS.calories} unit="kcal" note={`${viewedTodayLogs.length} food/drink entry(s) for ${viewLabel}. Apple Health can later adjust this target using BMR and active energy.`} />
          <TargetBar label="Protein" value={number(totals.protein_g)} target={DAILY_TARGETS.protein_g} unit="g" note="Default adult target; later this can use weight, sex and training load." />
          <TargetBar label="Fibre" value={number(totals.fibre_g)} target={DAILY_TARGETS.fibre_g} unit="g" note={`Soluble fibre ${number(totals.soluble_fibre_g).toFixed(1)}g. Fibre is a key gut-health driver.`} />
          <TargetBar label="Salt" value={number(totals.salt_g)} target={DAILY_TARGETS.salt_g} unit="g" inverted note="UK adult guide is about 6g salt/day; lower is usually better unless medically advised otherwise." />
          <FatQualityCard totals={totals} />
          <TargetBar label="Caffeine" value={number(totals.caffeine_mg)} target={DAILY_TARGETS.caffeine_mg} unit="mg" inverted note="A broad adult ceiling. Timing, sleep and pregnancy/breastfeeding context can change this." />
          <TargetBar label="Logged fluids" value={hydrationMl} target={2000} unit="ml" note="Pulled from drink entries, so the liquid volume changes hydration context instead of only caffeine/macros." />
          <ProcessedLoadCard processed={balanceRecommendations.processed} />
          <div className="rounded-[2rem] border border-white/70 bg-white p-5 shadow-lg"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase text-slate-500">Gut health</p><p className="mt-2 text-3xl font-black text-slate-950">{balanceRecommendations.gut.score}/100</p></div><ScoreChip score={balanceRecommendations.gut.score} label={balanceRecommendations.gut.label} /></div><p className="mt-3 text-sm font-semibold text-slate-500">Based on fibre, soluble fibre, plant/legume signals, fermented-food signals and processed-load pressure.</p></div>
          <div className="rounded-[2rem] border border-emerald-100 bg-emerald-50 p-5 md:col-span-2"><div className="flex items-start gap-3"><Sparkles className="mt-1 h-5 w-5 text-emerald-700" /><div><p className="font-black text-emerald-950">Coach snippets</p><div className="mt-2 space-y-1 text-sm font-semibold text-emerald-900">{dailyScore.highlights.map((item) => <p key={item}>• {item}</p>)}{balanceRecommendations.recommendations.map((item) => <p key={item}>• {item}</p>)}{!dailyScore.highlights.length && !balanceRecommendations.recommendations.length ? <p>• Add a meal or drink entry and the daily coach will become more specific.</p> : null}</div><Link href={`/nutrition/day?date=${selectedDate}&person=${encodeURIComponent(activePersonId)}`} className="mt-4 inline-flex rounded-full bg-emerald-700 px-4 py-2 text-sm font-black text-white">Examine all nutrients</Link></div></div></div>
        </div>
      </section>

      <section className="rounded-[2.5rem] border border-white/70 bg-white/85 p-6 shadow-xl">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-600">LoopHealth workspace</p><h2 className="text-2xl font-black text-slate-950">Food log, saved cards and settings</h2></div>
          <div className="flex flex-wrap gap-2">
            {(["log", "settings"] as NutritionPanel[]).map((panel) => <button key={panel} onClick={() => setActivePanel(panel)} className={`rounded-full px-4 py-2 text-sm font-black ${activePanel === panel ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-700"}`}>{panel === "log" ? "Food log" : "Health settings"}</button>)}<Link href="/nutrition/ingredients" className="rounded-full bg-slate-100 px-4 py-2 text-sm font-black text-slate-700">Ingredients</Link><Link href="/nutrition/cards" className="rounded-full bg-slate-100 px-4 py-2 text-sm font-black text-slate-700">Saved meal cards</Link>
          </div>
        </div>

        {activePanel === "log" ? (
          <div className="space-y-5">
            <div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-[0.22em] text-slate-500">{dateLabel(selectedDate)}</p><h3 className="text-2xl font-black text-slate-950">Food log</h3></div><button onClick={() => setModal({ type: "log" })} className="rounded-full bg-slate-950 px-4 py-2 text-sm font-black text-white">Add</button></div>
            {timelineLogs.length ? (
              <div className="rounded-[2rem] bg-slate-50 p-4">
                <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-black text-slate-950">Timeline for {viewLabel}</p>
                    <p className="text-xs font-semibold text-slate-500">Ordered by when it was eaten or drunk. Use Everyone to check the full household day.</p>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-500 ring-1 ring-slate-100">{timelineLogs.length} entry(s)</span>
                </div>
                <div className="space-y-3">
                  {timelineLogs.map((log) => <FoodTimelineRow key={log.id} log={log} people={people} onEdit={() => setModal({ type: "edit-log", log })} />)}
                </div>
              </div>
            ) : <p className="rounded-3xl border border-dashed border-slate-300 p-5 text-sm font-semibold text-slate-500">No food logged for {viewLabel} on this day yet.</p>}
          </div>
        ) : null}

        {activePanel === "cards" ? (
          <div>
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-600">Recipe cards</p><h3 className="text-2xl font-black text-slate-950">Saved meals and products</h3></div><div className="flex flex-wrap gap-2"><button onClick={() => setModal({ type: "menu-import" })} className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-4 py-2 text-sm font-black text-emerald-800 ring-1 ring-emerald-100"><Import className="h-4 w-4" /> Import menu</button><button onClick={() => setModal({ type: "recipe" })} className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-sm font-black text-white"><Plus className="h-4 w-4" /> Add recipe</button></div></div>
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{meals.map((meal) => <RecipeCard key={meal.id} meal={meal} onLog={() => setModal({ type: "log", meal })} onEdit={() => setModal({ type: "edit-recipe", meal })} />)}{meals.length === 0 ? <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white p-8 text-center text-sm font-semibold text-slate-500 md:col-span-2 xl:col-span-3">Add a recipe or product name, estimate deep nutrition and it becomes a reusable card for adult and child portions.</div> : null}</div>
          </div>
        ) : null}

        {activePanel === "settings" ? (
          <form action={updateNutritionSettings} className="grid gap-4 lg:grid-cols-4">
            <ToggleSetting name="health_child_scaling_enabled" title="Child portion scaling" description="Show child portion shortcuts when logging meals." icon={Scale} defaultChecked={settings.health_child_scaling_enabled !== false} />
            <ToggleSetting name="health_child_logging_enabled" title="Allow child logging" description="Make child profiles selectable in the food allocation step." icon={Utensils} defaultChecked={settings.health_child_logging_enabled !== false} />
            <ToggleSetting name="health_apple_health_enabled" title="Apple Health / integrations" description="Future native app sync for workouts, active energy and mindful minutes." icon={CalendarDays} defaultChecked={Boolean(settings.health_apple_health_enabled)} comingSoon />
            <ToggleSetting name="health_prompt_for_time_enabled" title="Prompt for time" description="Show time guidance when logging food/drinks so timing can support hydration, caffeine and carb-release patterns." icon={Clock} defaultChecked={settings.health_prompt_for_time_enabled !== false} />
            <div className="lg:col-span-4"><SubmitButton>Save health settings</SubmitButton><p className="mt-3 text-xs font-semibold text-slate-500">{foodVsExerciseNote}</p></div>
          </form>
        ) : null}

        {number(totals.caffeine_mg) > 0 && activePanel === "log" ? <div className="mt-5 rounded-[2.5rem] border border-orange-100 bg-orange-50 p-6 shadow-xl"><div className="flex items-start gap-3"><Coffee className="mt-1 h-5 w-5 text-orange-700" /><div><p className="font-black text-orange-950">Caffeine / drink balance</p><p className="mt-1 text-sm font-semibold text-orange-900">Caffeine can fit into a day. The app now separates the base drink from syrups/sweeteners and nudges hydration, sleep timing and sugar/salt balance where needed.</p></div></div></div> : null}
      </section>

      {modal?.type === "menu-import" ? <ModalShell title="Import menu products" description="Paste a restaurant, bakery or takeaway menu URL and save estimated product cards in bulk." onClose={() => setModal(null)}><MenuImportForm onClose={() => setModal(null)} /></ModalShell> : null}
      {modal?.type === "recipe" ? <ModalShell title="Build recipe card" description="Choose custom recipe or import recipe, refine the ingredient list, then estimate deep nutrition and save the card." onClose={() => setModal(null)}><RecipeForm people={people} supermarkets={supermarkets} onClose={() => setModal(null)} /></ModalShell> : null}
      {modal?.type === "edit-recipe" ? <ModalShell title={`Edit ${modal.meal.label}`} description="Update the recipe card, import details or ingredient ratios, then refresh the deep nutrition estimate." onClose={() => setModal(null)}><RecipeForm people={people} supermarkets={supermarkets} meal={modal.meal} onClose={() => setModal(null)} /></ModalShell> : null}
      {modal?.type === "log" ? <ModalShell title="Log food / drink" description="Use a saved card or search a branded product, then allocate it to one or many people with a meal-slot shortcut." onClose={() => setModal(null)}><LogFoodForm people={people} meals={meals} meal={modal.meal} selectedDate={selectedDate} settings={settings} onClose={() => setModal(null)} /></ModalShell> : null}
      {modal?.type === "edit-log" ? <ModalShell title={`Edit ${modal.log.label}`} description="Update the food log, meal slot, person, image or notes." onClose={() => setModal(null)}><EditLogForm people={people} log={modal.log} onClose={() => setModal(null)} /></ModalShell> : null}
    </main>
  );
}
