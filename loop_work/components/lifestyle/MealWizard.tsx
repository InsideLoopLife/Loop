"use client";

import { useState } from "react";
import { FormInput } from "@/components/FormInput";
import { SubmitButton } from "@/components/SubmitButton";
import { addMeal, updateMeal } from "@/app/lifestyle/actions";

type Person = { id: string; name: string };
type Supermarket = { id: string; name: string };
type Meal = {
  id: string;
  label?: string | null;
  person_id?: string | null;
  supermarket_id?: string | null;
  servings?: number | null;
  source_url?: string | null;
  image_url?: string | null;
  estimated_cost?: number | null;
  calories?: number | null;
  protein_g?: number | null;
  carbs_g?: number | null;
  fat_g?: number | null;
  fibre_g?: number | null;
  sugar_g?: number | null;
  salt_g?: number | null;
  ingredients?: string | null;
  notes?: string | null;
};

const inputClass = "mt-1 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-950 placeholder:text-slate-400 outline-none ring-orange-500 transition focus:border-orange-400 focus:ring-2";
const textareaClass = "mt-1 min-h-28 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold outline-none ring-orange-500 transition focus:ring-2";

function PersonOptions({ people }: { people: Person[] }) {
  return (
    <>
      <option value="">Household / shared</option>
      {people.map((person) => (
        <option key={person.id} value={person.id}>
          {person.name}
        </option>
      ))}
    </>
  );
}

type StepId = "identity" | "shopping" | "nutrition" | "ingredients-notes";
const STEPS: { id: StepId; label: string }[] = [
  { id: "identity", label: "Meal" },
  { id: "shopping", label: "Shopping" },
  { id: "nutrition", label: "Nutrition" },
  { id: "ingredients-notes", label: "Ingredients & notes" },
];

export function MealWizard({ people, supermarkets, meal }: { people: Person[]; supermarkets: Supermarket[]; meal?: Meal }) {
  const [stepIndex, setStepIndex] = useState(0);
  const currentStepId = STEPS[stepIndex].id;
  const isLastStep = stepIndex === STEPS.length - 1;

  return (
    <form action={meal ? updateMeal : addMeal} className="space-y-5">
      {meal ? <input type="hidden" name="id" value={meal.id} /> : null}

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

      <div style={{ display: currentStepId === "identity" ? "block" : "none" }} className="grid gap-4 md:grid-cols-2">
        <FormInput label="Meal / recipe" name="label" defaultValue={meal?.label} placeholder="Chicken pasta, chilli, smoothie" required />
        <label className="block">
          <span className="text-sm font-bold text-slate-700">Person / plan</span>
          <select name="person_id" defaultValue={meal?.person_id ?? ""} className={inputClass}>
            <PersonOptions people={people} />
          </select>
        </label>
        <FormInput label="Servings" name="servings" type="number" step="0.01" defaultValue={meal?.servings ?? 1} />
      </div>

      <div style={{ display: currentStepId === "shopping" ? "block" : "none" }} className="grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="text-sm font-bold text-slate-700">Supermarket</span>
          <select name="supermarket_id" defaultValue={meal?.supermarket_id ?? ""} className={inputClass}>
            <option value="">No supermarket</option>
            {supermarkets.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
        </label>
        <FormInput label="Recipe URL" name="source_url" defaultValue={meal?.source_url} placeholder="Paste meal URL" />
        <FormInput label="Image URL / photo reference" name="image_url" defaultValue={meal?.image_url} placeholder="Optional for now" />
        <FormInput label="Estimated shop cost" name="estimated_cost" type="number" step="0.01" defaultValue={meal?.estimated_cost} />
      </div>

      <div style={{ display: currentStepId === "nutrition" ? "block" : "none" }} className="grid gap-4 md:grid-cols-3">
        <FormInput label="Calories" name="calories" type="number" step="0.01" defaultValue={meal?.calories} />
        <FormInput label="Protein g" name="protein_g" type="number" step="0.01" defaultValue={meal?.protein_g} />
        <FormInput label="Carbs g" name="carbs_g" type="number" step="0.01" defaultValue={meal?.carbs_g} />
        <FormInput label="Fat g" name="fat_g" type="number" step="0.01" defaultValue={meal?.fat_g} />
        <FormInput label="Fibre g" name="fibre_g" type="number" step="0.01" defaultValue={meal?.fibre_g} />
        <FormInput label="Sugar g" name="sugar_g" type="number" step="0.01" defaultValue={meal?.sugar_g} />
        <FormInput label="Salt g" name="salt_g" type="number" step="0.01" defaultValue={meal?.salt_g} />
      </div>

      <div style={{ display: currentStepId === "ingredients-notes" ? "block" : "none" }} className="space-y-4">
        <label className="block">
          <span className="text-sm font-bold text-slate-700">Ingredients / shopping list</span>
          <textarea name="ingredients" defaultValue={meal?.ingredients ?? ""} className={textareaClass} placeholder="Paste ingredients, one per line" />
        </label>
        <label className="block">
          <span className="text-sm font-bold text-slate-700">Notes / health aim</span>
          <textarea name="notes" defaultValue={meal?.notes ?? ""} className={textareaClass} placeholder="High protein, kids liked it, easy batch cook" />
        </label>
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 pt-4">
        <button type="button" onClick={() => setStepIndex((i) => Math.max(0, i - 1))} disabled={stepIndex === 0} className="text-sm font-black text-slate-500 hover:text-slate-900 disabled:opacity-30">
          ← Back
        </button>
        {isLastStep ? (
          <SubmitButton>{meal ? "Save meal" : "Add meal"}</SubmitButton>
        ) : (
          <button type="button" onClick={() => setStepIndex((i) => Math.min(STEPS.length - 1, i + 1))} className="rounded-full bg-orange-500 px-5 py-2.5 text-sm font-black text-white hover:bg-orange-600">
            Next →
          </button>
        )}
      </div>
    </form>
  );
}
