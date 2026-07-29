"use client";

import { useMemo, useState } from "react";
import { CalendarClock, CheckCircle2, ClipboardList, Copy, Download, HeartPulse, Plus, ReceiptText, RotateCcw, Salad, Share2, ShoppingBasket, Sparkles, Utensils } from "lucide-react";
import { FormInput } from "@/components/FormInput";
import { SubmitButton } from "@/components/SubmitButton";
import { formatMoney } from "@/lib/format/money";
import { addDealBill, addMeal, addSupermarket, deleteDealBill, deleteMeal, updateDealBill, updateMeal } from "@/app/lifestyle/actions";

type Person = { id: string; name: string; relationship: string };
type DealBill = {
  id: string;
  person_id: string | null;
  label: string;
  provider: string;
  category: string;
  monthly_cost: number;
  billing_day: number | null;
  contract_start: string | null;
  contract_end: string | null;
  notice_days: number;
  comparison_url: string | null;
  account_reference: string | null;
  auto_recommendation_enabled: boolean;
  notes: string | null;
};
type Supermarket = { id: string; name: string; location_label: string | null; online_url: string | null; notes: string | null };
type Meal = {
  id: string;
  person_id: string | null;
  label: string;
  source_url: string | null;
  image_url: string | null;
  servings: number;
  estimated_cost: number;
  supermarket_id: string | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fibre_g: number;
  sugar_g: number;
  salt_g: number;
  ingredients: string | null;
  notes: string | null;
};

type Props = { people: Person[]; bills: DealBill[]; supermarkets: Supermarket[]; meals: Meal[] };
type Modal = { type: "bill" } | { type: "edit-bill"; bill: DealBill } | { type: "supermarket" } | { type: "meal" } | { type: "edit-meal"; meal: Meal } | null;
type Tab = "deals" | "food" | "health";

const inputClass = "mt-1 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none ring-orange-500 transition focus:ring-2";

function today() {
  return new Date().toISOString().slice(0, 10);
}

function daysUntil(date: string | null) {
  if (!date) return null;
  const start = new Date(today());
  const end = new Date(`${date}T00:00:00`);
  return Math.ceil((end.getTime() - start.getTime()) / 86400000);
}

function personName(people: Person[], personId: string | null) {
  if (!personId) return "Household";
  return people.find((person) => person.id === personId)?.name ?? "Person";
}

function supermarketName(supermarkets: Supermarket[], id: string | null) {
  if (!id) return "No supermarket set";
  return supermarkets.find((store) => store.id === id)?.name ?? "Supermarket";
}

type ShoppingItem = {
  id: string;
  label: string;
  mealLabel: string;
  supermarket: string;
};

function cleanIngredientLine(line: string) {
  return line
    .replace(/^[-*•\u2610\u2611\s]+/u, "")
    .replace(/^\[[ xX]\]\s*/u, "")
    .trim();
}

function shoppingItemsFromMeals(meals: Meal[], supermarkets: Supermarket[]) {
  const seen = new Map<string, ShoppingItem>();

  meals.forEach((meal) => {
    const lines = String(meal.ingredients || "")
      .split(/\r?\n|,/)
      .map(cleanIngredientLine)
      .filter(Boolean);

    lines.forEach((label, index) => {
      const key = label.toLowerCase();
      if (seen.has(key)) return;
      seen.set(key, {
        id: `${meal.id}-${index}-${key.replace(/[^a-z0-9]+/g, "-")}`,
        label,
        mealLabel: meal.label,
        supermarket: supermarketName(supermarkets, meal.supermarket_id),
      });
    });
  });

  return Array.from(seen.values()).sort((a, b) => a.label.localeCompare(b.label));
}

function buildAppleNotesShoppingText(items: ShoppingItem[], meals: Meal[]) {
  const mealNames = meals.map((meal) => meal.label).join(", ") || "Saved meals";
  const lines = [
    "Shopping list",
    `Meals: ${mealNames}`,
    "",
    ...items.map((item) => `☐ ${item.label}`),
  ];

  return lines.join("\n");
}

function buildMarkdownShoppingText(items: ShoppingItem[], meals: Meal[]) {
  const mealNames = meals.map((meal) => meal.label).join(", ") || "Saved meals";
  const lines = [
    "# Shopping list",
    `Meals: ${mealNames}`,
    "",
    ...items.map((item) => `- [ ] ${item.label}`),
  ];

  return lines.join("\n");
}

function dealStatus(bill: DealBill) {
  const days = daysUntil(bill.contract_end);
  if (days === null) return { label: "Rolling / no end date", tone: "bg-slate-100 text-slate-700", action: "No renewal date set" };
  if (days <= 0) return { label: "Check now", tone: "bg-red-100 text-red-700", action: "Deal has ended or is due now" };
  if (days <= Number(bill.notice_days ?? 45)) return { label: "Switch window", tone: "bg-orange-100 text-orange-700", action: `${days} day(s) left — compare deals` };
  if (days <= 90) return { label: "Coming up", tone: "bg-amber-100 text-amber-700", action: `${days} day(s) left` };
  return { label: "In contract", tone: "bg-emerald-100 text-emerald-700", action: `${days} day(s) left` };
}

function PersonOptions({ people }: { people: Person[] }) {
  return (
    <>
      <option value="">Household / shared</option>
      {people.map((person) => <option key={person.id} value={person.id}>{person.name} ({person.relationship})</option>)}
    </>
  );
}

function ModalShell({ title, description, children, onClose }: { title: string; description?: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-sm sm:items-center sm:p-6">
      <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-t-[2rem] border border-white/70 bg-white p-6 shadow-2xl sm:rounded-[2rem]">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black tracking-tight text-slate-950">{title}</h2>
            {description ? <p className="mt-1 text-sm font-semibold text-slate-500">{description}</p> : null}
          </div>
          <button onClick={onClose} className="rounded-full bg-slate-100 px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-200">Close</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function BillForm({ people, bill }: { people: Person[]; bill?: DealBill }) {
  return (
    <form action={bill ? updateDealBill : addDealBill} className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {bill ? <input type="hidden" name="id" value={bill.id} /> : null}
      <FormInput label="Bill / contract name" name="label" defaultValue={bill?.label} placeholder="Broadband, car insurance, energy" required />
      <FormInput label="Provider" name="provider" defaultValue={bill?.provider} placeholder="Sky, Octopus, Admiral" required />
      <label className="block"><span className="text-sm font-bold text-slate-700">Category</span><select name="category" defaultValue={bill?.category ?? "utilities"} className={inputClass}><option value="utilities">Utilities</option><option value="insurance">Insurance</option><option value="mobile">Mobile</option><option value="broadband">Broadband</option><option value="subscription">Subscription</option><option value="food">Food / grocery</option><option value="health">Health</option><option value="other">Other</option></select></label>
      <label className="block"><span className="text-sm font-bold text-slate-700">Owner</span><select name="person_id" defaultValue={bill?.person_id ?? ""} className={inputClass}><PersonOptions people={people} /></select></label>
      <FormInput label="Monthly cost" name="monthly_cost" type="number" step="0.01" defaultValue={bill?.monthly_cost} />
      <FormInput label="Billing day" name="billing_day" type="number" step="1" defaultValue={bill?.billing_day} placeholder="1-31" />
      <FormInput label="Contract start" name="contract_start" type="date" defaultValue={bill?.contract_start} />
      <FormInput label="Contract end" name="contract_end" type="date" defaultValue={bill?.contract_end} />
      <FormInput label="Notice/check days before end" name="notice_days" type="number" step="1" defaultValue={bill?.notice_days ?? 45} />
      <FormInput label="Comparison/source URL" name="comparison_url" defaultValue={bill?.comparison_url} placeholder="MSE, comparison site, provider URL" />
      <FormInput label="Account/reference" name="account_reference" defaultValue={bill?.account_reference} />
      <FormInput label="Notes" name="notes" defaultValue={bill?.notes} placeholder="Current deal, renewal notes" />
      <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">
        <input name="auto_recommendation_enabled" type="checkbox" defaultChecked={bill?.auto_recommendation_enabled ?? true} className="h-4 w-4" /> Show renewal recommendation
      </label>
      <div className="flex items-end"><SubmitButton>{bill ? "Save bill" : "Add bill"}</SubmitButton></div>
    </form>
  );
}

function SupermarketForm() {
  return (
    <form action={addSupermarket} className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <FormInput label="Supermarket" name="name" placeholder="Tesco, Aldi, Sainsbury's" required />
      <FormInput label="Location / delivery area" name="location_label" placeholder="Warrington, online shop" />
      <FormInput label="Online URL" name="online_url" placeholder="https://..." />
      <FormInput label="Notes" name="notes" placeholder="Best for weekly shop, baby items" />
      <div className="flex items-end"><SubmitButton>Add supermarket</SubmitButton></div>
    </form>
  );
}

function MealForm({ people, supermarkets, meal }: { people: Person[]; supermarkets: Supermarket[]; meal?: Meal }) {
  return (
    <form action={meal ? updateMeal : addMeal} className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {meal ? <input type="hidden" name="id" value={meal.id} /> : null}
      <FormInput label="Meal / recipe" name="label" defaultValue={meal?.label} placeholder="Chicken pasta, chilli, smoothie" required />
      <label className="block"><span className="text-sm font-bold text-slate-700">Person / plan</span><select name="person_id" defaultValue={meal?.person_id ?? ""} className={inputClass}><PersonOptions people={people} /></select></label>
      <label className="block"><span className="text-sm font-bold text-slate-700">Supermarket</span><select name="supermarket_id" defaultValue={meal?.supermarket_id ?? ""} className={inputClass}><option value="">No supermarket</option>{supermarkets.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}</select></label>
      <FormInput label="Servings" name="servings" type="number" step="0.01" defaultValue={meal?.servings ?? 1} />
      <FormInput label="Recipe URL" name="source_url" defaultValue={meal?.source_url} placeholder="Paste meal URL" />
      <FormInput label="Image URL / photo reference" name="image_url" defaultValue={meal?.image_url} placeholder="Optional for now" />
      <FormInput label="Estimated shop cost" name="estimated_cost" type="number" step="0.01" defaultValue={meal?.estimated_cost} />
      <FormInput label="Calories" name="calories" type="number" step="0.01" defaultValue={meal?.calories} />
      <FormInput label="Protein g" name="protein_g" type="number" step="0.01" defaultValue={meal?.protein_g} />
      <FormInput label="Carbs g" name="carbs_g" type="number" step="0.01" defaultValue={meal?.carbs_g} />
      <FormInput label="Fat g" name="fat_g" type="number" step="0.01" defaultValue={meal?.fat_g} />
      <FormInput label="Fibre g" name="fibre_g" type="number" step="0.01" defaultValue={meal?.fibre_g} />
      <FormInput label="Sugar g" name="sugar_g" type="number" step="0.01" defaultValue={meal?.sugar_g} />
      <FormInput label="Salt g" name="salt_g" type="number" step="0.01" defaultValue={meal?.salt_g} />
      <label className="block md:col-span-2"><span className="text-sm font-bold text-slate-700">Ingredients / shopping list</span><textarea name="ingredients" defaultValue={meal?.ingredients ?? ""} className="mt-1 min-h-28 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none ring-orange-500 transition focus:ring-2" placeholder="Paste ingredients, one per line" /></label>
      <label className="block md:col-span-2"><span className="text-sm font-bold text-slate-700">Notes / health aim</span><textarea name="notes" defaultValue={meal?.notes ?? ""} className="mt-1 min-h-28 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none ring-orange-500 transition focus:ring-2" placeholder="High protein, kids liked it, easy batch cook" /></label>
      <div className="flex items-end"><SubmitButton>{meal ? "Save meal" : "Add meal"}</SubmitButton></div>
    </form>
  );
}


function ShoppingListBuilder({ meals, supermarkets }: { meals: Meal[]; supermarkets: Supermarket[] }) {
  const [selectedMealIds, setSelectedMealIds] = useState<string[]>(meals.map((meal) => meal.id));
  const [checkedItemIds, setCheckedItemIds] = useState<string[]>([]);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);

  const selectedMeals = useMemo(
    () => meals.filter((meal) => selectedMealIds.includes(meal.id)),
    [meals, selectedMealIds]
  );
  const items = useMemo(
    () => shoppingItemsFromMeals(selectedMeals, supermarkets),
    [selectedMeals, supermarkets]
  );
  const notesText = useMemo(() => buildAppleNotesShoppingText(items, selectedMeals), [items, selectedMeals]);
  const markdownText = useMemo(() => buildMarkdownShoppingText(items, selectedMeals), [items, selectedMeals]);

  function toggleMeal(mealId: string) {
    setSelectedMealIds((current) => current.includes(mealId) ? current.filter((id) => id !== mealId) : [...current, mealId]);
  }

  function toggleItem(itemId: string) {
    setCheckedItemIds((current) => current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId]);
  }

  async function copyText(text: string, label = "Copied") {
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus(label);
      window.setTimeout(() => setCopyStatus(null), 1800);
    } catch {
      setCopyStatus("Could not copy automatically — select the text and copy it manually.");
    }
  }

  async function shareList() {
    if (navigator.share) {
      try {
        await navigator.share({ title: "Shopping list", text: notesText });
        return;
      } catch {
        // User may cancel the native share sheet; fall through to copy.
      }
    }
    await copyText(notesText, "Copied for sharing");
  }

  function downloadList() {
    const blob = new Blob([notesText], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `shopping-list-${new Date().toISOString().slice(0, 10)}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="rounded-[2rem] border border-white/70 bg-white/90 p-5 shadow-lg">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="rounded-2xl bg-slate-950 p-2 text-white"><ClipboardList className="h-5 w-5" /></div>
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-orange-600">Phone-friendly list</p>
              <h2 className="text-2xl font-black text-slate-950">Shopping checklist</h2>
            </div>
          </div>
          <p className="mt-2 max-w-2xl text-sm font-semibold text-slate-600">Choose meals, generate one tidy checklist, tick it off in the app, or share/copy it into Apple Notes, WhatsApp or any notes app on your phone.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => copyText(notesText, "Copied for Apple Notes")} className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-sm font-black text-white"><Copy className="h-4 w-4" /> Copy</button>
          <button type="button" onClick={shareList} className="inline-flex items-center gap-2 rounded-full bg-orange-100 px-4 py-2 text-sm font-black text-orange-700"><Share2 className="h-4 w-4" /> Share</button>
          <button type="button" onClick={downloadList} className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-sm font-black text-slate-700"><Download className="h-4 w-4" /> .txt</button>
        </div>
      </div>

      {copyStatus ? <p className="mt-3 rounded-2xl bg-emerald-50 px-4 py-2 text-sm font-black text-emerald-700">{copyStatus}</p> : null}

      <div className="mt-5 grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-3xl bg-slate-50 p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-black text-slate-950">Meals included</p>
            <button type="button" onClick={() => setSelectedMealIds(meals.map((meal) => meal.id))} className="text-xs font-black text-orange-600">Select all</button>
          </div>
          <div className="mt-3 space-y-2">
            {meals.map((meal) => (
              <label key={meal.id} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-3 text-sm font-bold text-slate-700">
                <input type="checkbox" checked={selectedMealIds.includes(meal.id)} onChange={() => toggleMeal(meal.id)} className="mt-1 h-4 w-4" />
                <span><span className="block font-black text-slate-950">{meal.label}</span><span className="text-xs text-slate-500">{meal.ingredients ? `${meal.ingredients.split(/\r?\n|,/).filter(Boolean).length} ingredient line(s)` : "No ingredients yet"}</span></span>
              </label>
            ))}
            {meals.length === 0 ? <p className="rounded-2xl border border-dashed border-slate-300 bg-white p-4 text-sm font-semibold text-slate-500">Add meals first, then this will generate a phone-ready shopping list.</p> : null}
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-black text-slate-950">Checklist</p>
              <p className="text-xs font-semibold text-slate-500">{checkedItemIds.length} of {items.length} ticked</p>
            </div>
            <button type="button" onClick={() => setCheckedItemIds([])} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-700"><RotateCcw className="h-3.5 w-3.5" /> Reset</button>
          </div>
          <div className="mt-3 max-h-[420px] space-y-2 overflow-y-auto pr-1">
            {items.map((item) => {
              const checked = checkedItemIds.includes(item.id);
              return (
                <button key={item.id} type="button" onClick={() => toggleItem(item.id)} className={`flex w-full items-start gap-3 rounded-2xl border p-3 text-left transition ${checked ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100"}`}>
                  <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${checked ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 bg-white"}`}>{checked ? <CheckCircle2 className="h-4 w-4" /> : null}</span>
                  <span><span className={`block text-sm font-black ${checked ? "line-through" : ""}`}>{item.label}</span><span className="text-xs font-semibold opacity-70">{item.mealLabel}</span></span>
                </button>
              );
            })}
            {items.length === 0 ? <p className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm font-semibold text-slate-500">No ingredients found for the selected meals.</p> : null}
          </div>
        </div>
      </div>

      <details className="mt-4 rounded-3xl bg-slate-50 p-4">
        <summary className="cursor-pointer text-sm font-black text-slate-700">Show Apple Notes / Markdown text</summary>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <div>
            <p className="text-xs font-black uppercase text-slate-500">Apple Notes friendly</p>
            <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-2xl bg-white p-4 text-sm font-semibold text-slate-700">{notesText}</pre>
          </div>
          <div>
            <p className="text-xs font-black uppercase text-slate-500">Markdown checklist</p>
            <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-2xl bg-white p-4 text-sm font-semibold text-slate-700">{markdownText}</pre>
          </div>
        </div>
      </details>
    </div>
  );
}

export function LifestyleClient({ people, bills, supermarkets, meals }: Props) {
  const [tab, setTab] = useState<Tab>("deals");
  const [modal, setModal] = useState<Modal>(null);
  const [openMenu, setOpenMenu] = useState(false);

  const monthlyBills = bills.reduce((sum, bill) => sum + Number(bill.monthly_cost || 0), 0);
  const dueBills = bills.filter((bill) => {
    const days = daysUntil(bill.contract_end);
    return days !== null && days <= Number(bill.notice_days ?? 45);
  });
  const mealCost = meals.reduce((sum, meal) => sum + Number(meal.estimated_cost || 0), 0);
  const macroTotals = useMemo(() => meals.reduce((acc, meal) => ({
    calories: acc.calories + Number(meal.calories || 0),
    protein: acc.protein + Number(meal.protein_g || 0),
    carbs: acc.carbs + Number(meal.carbs_g || 0),
    fat: acc.fat + Number(meal.fat_g || 0),
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 }), [meals]);

  return (
    <main className="mx-auto max-w-7xl space-y-7 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.24em] text-orange-600">Lifestyle OS</p>
          <h1 className="mt-2 text-4xl font-black tracking-tight text-slate-950 md:text-5xl">Bills, food and health</h1>
          <p className="mt-2 max-w-3xl text-sm font-semibold text-slate-600">Track renewal dates, find better deal windows, plan meals, rough grocery pricing and macro/micro notes without needing live bank or supermarket integrations yet.</p>
        </div>
        <div className="relative">
          <button onClick={() => setOpenMenu((value) => !value)} className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-xl shadow-slate-950/20"><Plus className="h-4 w-4" /> Add</button>
          {openMenu ? (
            <div className="absolute right-0 z-20 mt-2 w-72 overflow-hidden rounded-3xl border border-white bg-white p-2 shadow-2xl">
              <button onClick={() => { setModal({ type: "bill" }); setOpenMenu(false); }} className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-black hover:bg-slate-50"><ReceiptText className="h-4 w-4" /> Bill / renewal tracker</button>
              <button onClick={() => { setModal({ type: "supermarket" }); setOpenMenu(false); }} className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-black hover:bg-slate-50"><ShoppingBasket className="h-4 w-4" /> Supermarket</button>
              <button onClick={() => { setModal({ type: "meal" }); setOpenMenu(false); }} className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-black hover:bg-slate-50"><Utensils className="h-4 w-4" /> Meal / recipe</button>
            </div>
          ) : null}
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded-[2rem] bg-slate-950 p-5 text-white shadow-xl"><p className="text-xs font-black uppercase text-slate-300">Tracked bills</p><p className="mt-2 text-3xl font-black">{formatMoney(monthlyBills)}</p><p className="text-xs text-slate-300">monthly commitments</p></div>
        <div className="rounded-[2rem] border border-white/70 bg-white/85 p-5 shadow-lg"><p className="text-xs font-black uppercase text-slate-500">Needs checking</p><p className="mt-2 text-3xl font-black text-slate-950">{dueBills.length}</p><p className="text-xs text-slate-500">contracts in or near switch window</p></div>
        <div className="rounded-[2rem] border border-white/70 bg-white/85 p-5 shadow-lg"><p className="text-xs font-black uppercase text-slate-500">Meal plan value</p><p className="mt-2 text-3xl font-black text-slate-950">{formatMoney(mealCost)}</p><p className="text-xs text-slate-500">estimated grocery cost</p></div>
        <div className="rounded-[2rem] border border-white/70 bg-white/85 p-5 shadow-lg"><p className="text-xs font-black uppercase text-slate-500">Protein planned</p><p className="mt-2 text-3xl font-black text-slate-950">{macroTotals.protein.toFixed(0)}g</p><p className="text-xs text-slate-500">across saved meals</p></div>
      </section>

      <div className="flex flex-wrap gap-2 rounded-full border border-slate-200 bg-white/80 p-1 shadow-inner">
        {[
          { id: "deals", label: "Bills & renewals", icon: CalendarClock },
          { id: "food", label: "Food shopping", icon: Salad },
          { id: "health", label: "Macro / micro tracker", icon: HeartPulse },
        ].map((item) => {
          const Icon = item.icon;
          return <button key={item.id} onClick={() => setTab(item.id as Tab)} className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-black ${tab === item.id ? "bg-slate-950 text-white" : "text-slate-600 hover:bg-slate-50"}`}><Icon className="h-4 w-4" /> {item.label}</button>;
        })}
      </div>

      {tab === "deals" ? (
        <section className="grid gap-4 lg:grid-cols-2">
          {bills.map((bill) => {
            const status = dealStatus(bill);
            return (
              <article key={bill.id} className="rounded-[2rem] border border-white/70 bg-white/88 p-5 shadow-lg">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-black uppercase tracking-wide text-slate-500">{bill.category.replaceAll("_", " ")} · {personName(people, bill.person_id)}</p>
                    <h3 className="mt-1 text-xl font-black text-slate-950">{bill.provider}</h3>
                    <p className="text-sm font-semibold text-slate-600">{bill.label}</p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-black ${status.tone}`}>{status.label}</span>
                </div>
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase text-slate-500">Monthly</p><p className="text-xl font-black">{formatMoney(bill.monthly_cost)}</p></div>
                  <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase text-slate-500">End date</p><p className="text-sm font-black">{bill.contract_end ?? "Not set"}</p></div>
                  <div className="rounded-2xl bg-orange-50 p-4"><p className="text-xs font-bold uppercase text-orange-700">Recommendation</p><p className="text-sm font-black text-orange-900">{status.action}</p></div>
                </div>
                {bill.notes ? <p className="mt-4 text-sm font-medium text-slate-600">{bill.notes}</p> : null}
                <div className="mt-4 flex flex-wrap gap-3">
                  <button onClick={() => setModal({ type: "edit-bill", bill })} className="rounded-full bg-slate-100 px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-200">Edit</button>
                  {bill.comparison_url ? <a href={bill.comparison_url} target="_blank" rel="noreferrer" className="rounded-full bg-orange-100 px-4 py-2 text-sm font-black text-orange-700 hover:bg-orange-200">Compare/open source</a> : null}
                  <form action={deleteDealBill}><input type="hidden" name="id" value={bill.id} /><button className="rounded-full bg-red-50 px-4 py-2 text-sm font-black text-red-600 hover:bg-red-100">Delete</button></form>
                </div>
              </article>
            );
          })}
          {bills.length === 0 ? <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white/70 p-8 text-center text-sm font-semibold text-slate-500">Add bills like broadband, energy, insurance or subscriptions so the overview can prompt renewal checks.</div> : null}
        </section>
      ) : null}

      {tab === "food" ? (
        <section className="space-y-5">
          <ShoppingListBuilder meals={meals} supermarkets={supermarkets} />
          <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="rounded-[2rem] border border-white/70 bg-white/88 p-5 shadow-lg">
            <h2 className="text-xl font-black text-slate-950">Supermarkets</h2>
            <div className="mt-4 space-y-3">
              {supermarkets.map((store) => <div key={store.id} className="rounded-2xl border border-slate-200 p-4"><p className="font-black text-slate-950">{store.name}</p><p className="text-sm text-slate-500">{store.location_label ?? "No location set"}</p>{store.online_url ? <a href={store.online_url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-black text-orange-600">Open shop</a> : null}</div>)}
              {supermarkets.length === 0 ? <p className="text-sm font-semibold text-slate-500">Add supermarkets to tag rough prices against places you shop.</p> : null}
            </div>
          </div>
          <div className="space-y-4">
            {meals.map((meal) => (
              <article key={meal.id} className="rounded-[2rem] border border-white/70 bg-white/88 p-5 shadow-lg">
                <div className="flex items-start justify-between gap-4">
                  <div><p className="text-xs font-black uppercase tracking-wide text-slate-500">{personName(people, meal.person_id)} · {supermarketName(supermarkets, meal.supermarket_id)}</p><h3 className="mt-1 text-xl font-black text-slate-950">{meal.label}</h3><p className="text-sm font-semibold text-slate-600">{meal.servings} serving(s) · {formatMoney(meal.estimated_cost)} rough shop cost</p></div>
                  <button onClick={() => setModal({ type: "edit-meal", meal })} className="rounded-full bg-slate-100 px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-200">Edit</button>
                </div>
                <div className="mt-4 grid gap-2 sm:grid-cols-4">
                  <div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs font-bold text-slate-500">Calories</p><p className="font-black">{Number(meal.calories).toFixed(0)}</p></div>
                  <div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs font-bold text-slate-500">Protein</p><p className="font-black">{Number(meal.protein_g).toFixed(0)}g</p></div>
                  <div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs font-bold text-slate-500">Carbs</p><p className="font-black">{Number(meal.carbs_g).toFixed(0)}g</p></div>
                  <div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs font-bold text-slate-500">Fat</p><p className="font-black">{Number(meal.fat_g).toFixed(0)}g</p></div>
                </div>
                {meal.ingredients ? <pre className="mt-4 whitespace-pre-wrap rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-600">{meal.ingredients}</pre> : null}
                <div className="mt-4 flex gap-3"><form action={deleteMeal}><input type="hidden" name="id" value={meal.id} /><button className="rounded-full bg-red-50 px-4 py-2 text-sm font-black text-red-600 hover:bg-red-100">Delete</button></form>{meal.source_url ? <a href={meal.source_url} target="_blank" rel="noreferrer" className="rounded-full bg-orange-100 px-4 py-2 text-sm font-black text-orange-700 hover:bg-orange-200">Open recipe</a> : null}</div>
              </article>
            ))}
            {meals.length === 0 ? <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white/70 p-8 text-center text-sm font-semibold text-slate-500">Add a recipe URL, meal photo reference or ingredients list to start building a grocery and health planner.</div> : null}
          </div>
          </div>
        </section>
      ) : null}

      {tab === "health" ? (
        <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[{ label: "Calories", value: macroTotals.calories.toFixed(0), helper: "saved meal total" }, { label: "Protein", value: `${macroTotals.protein.toFixed(0)}g`, helper: "supports higher-protein planning" }, { label: "Carbs", value: `${macroTotals.carbs.toFixed(0)}g`, helper: "rough meal plan total" }, { label: "Fat", value: `${macroTotals.fat.toFixed(0)}g`, helper: "rough meal plan total" }].map((card) => <div key={card.label} className="rounded-[2rem] border border-white/70 bg-white/88 p-5 shadow-lg"><p className="text-xs font-black uppercase text-slate-500">{card.label}</p><p className="mt-2 text-3xl font-black text-slate-950">{card.value}</p><p className="text-xs font-semibold text-slate-500">{card.helper}</p></div>)}
          <div className="rounded-[2rem] border border-orange-100 bg-orange-50 p-5 lg:col-span-4"><div className="flex items-start gap-3"><Sparkles className="mt-1 h-5 w-5 text-orange-600" /><div><p className="font-black text-orange-900">Next AI step</p><p className="mt-1 text-sm font-semibold text-orange-800">Use the saved OpenAI token server-side to turn recipe URLs/photos into ingredients, rough macros and a supermarket shopping list. FoodData Central and Open Food Facts can then enrich nutrition/barcode data.</p></div></div></div>
        </section>
      ) : null}

      {modal?.type === "bill" ? <ModalShell title="Add bill / renewal" description="Track contracts so the overview can remind you when to compare better deals." onClose={() => setModal(null)}><BillForm people={people} /></ModalShell> : null}
      {modal?.type === "edit-bill" ? <ModalShell title={`Edit ${modal.bill.provider}`} description="Update costs, renewal date or comparison details." onClose={() => setModal(null)}><BillForm people={people} bill={modal.bill} /></ModalShell> : null}
      {modal?.type === "supermarket" ? <ModalShell title="Add supermarket" description="Use this to group grocery pricing assumptions." onClose={() => setModal(null)}><SupermarketForm /></ModalShell> : null}
      {modal?.type === "meal" ? <ModalShell title="Add meal / recipe" description="Manual first: paste a recipe URL, image reference, ingredients and rough macros." onClose={() => setModal(null)}><MealForm people={people} supermarkets={supermarkets} /></ModalShell> : null}
      {modal?.type === "edit-meal" ? <ModalShell title={`Edit ${modal.meal.label}`} onClose={() => setModal(null)}><MealForm people={people} supermarkets={supermarkets} meal={modal.meal} /></ModalShell> : null}
    </main>
  );
}
