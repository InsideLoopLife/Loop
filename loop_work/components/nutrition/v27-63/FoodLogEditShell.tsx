"use client";

import * as React from "react";
import { DateIconInput } from "./DateIconInput";
import { FoodPersonOption, PersonAvatarMultiSelect } from "./PersonAvatarMultiSelect";
import { ProductServingPicker, ServingOption } from "./ProductServingPicker";
import { TimeWheelInput } from "./TimeWheelInput";
import { NutrientSnapshotGrid } from "./NutrientSnapshotGrid";

type Nutrient = {
  key: string;
  label: string;
  value: number | string | null | undefined;
  unit?: string;
};

type FoodLogEditShellProps = {
  title: string;
  imageUrl?: string | null;
  defaultDate?: string | null;
  defaultTime?: string | null;
  people: FoodPersonOption[];
  selectedPersonIds?: string[];
  isDrink?: boolean;
  servingOptions?: ServingOption[];
  nutrients: Nutrient[];
  productUrl?: string | null;
  action: (formData: FormData) => void | Promise<void>;
};

export function FoodLogEditShell({
  title,
  imageUrl,
  defaultDate,
  defaultTime,
  people,
  selectedPersonIds,
  isDrink = false,
  servingOptions = [],
  nutrients,
  productUrl,
  action,
}: FoodLogEditShellProps) {
  return (
    <form action={action} className="mx-auto max-w-7xl space-y-6 p-4">
      <div className="sticky top-0 z-30 -mx-4 border-b border-white/70 bg-white/85 px-4 py-3 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.25em] text-emerald-600">LoopHealth</p>
            <h1 className="text-2xl font-black">Edit food / drink</h1>
          </div>
          <div className="flex gap-2">
            <a href="/nutrition" className="rounded-full bg-slate-100 px-4 py-3 text-sm font-black">Close</a>
            <button className="rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white">Save</button>
          </div>
        </div>
      </div>

      <section className="grid gap-5 lg:grid-cols-[minmax(280px,420px)_1fr]">
        <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-xl">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="" className="aspect-square w-full object-cover" />
          ) : (
            <div className="grid aspect-square place-items-center bg-slate-50 text-sm font-black text-slate-400">Square image</div>
          )}
          <button type="button" className="m-4 rounded-full bg-slate-100 px-4 py-2 text-sm font-black">Change image</button>
        </div>

        <div className="space-y-4">
          <div className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-xl">
            <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
              <div>
                <label className="text-sm font-black">Food / drink name</label>
                <input
                  name="food_name"
                  defaultValue={title}
                  className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 text-xl font-black"
                />
              </div>
              <DateIconInput defaultValue={defaultDate} />
            </div>

            <div className="mt-5 grid gap-4 xl:grid-cols-2">
              <TimeWheelInput defaultValue={defaultTime} />
              <PersonAvatarMultiSelect people={people} defaultSelectedIds={selectedPersonIds} />
            </div>

            <div className="mt-5 grid gap-4 xl:grid-cols-2">
              <div className="rounded-3xl border border-slate-200 bg-white p-4">
                <label className="text-sm font-black">Meal slot</label>
                <div className="mt-3 flex flex-wrap gap-2">
                  {["Breakfast", "Lunch", "Dinner", "Snack", "Drink", "Meal"].map((slot) => (
                    <label key={slot} className="rounded-full bg-slate-100 px-4 py-2 text-sm font-black">
                      <input type="radio" name="meal_slot" value={slot.toLowerCase()} defaultChecked={isDrink && slot === "Drink"} className="sr-only" />
                      {slot}
                    </label>
                  ))}
                </div>
              </div>
              <ProductServingPicker options={servingOptions} isDrink={isDrink} />
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {productUrl ? (
                <a href={productUrl} className="rounded-full bg-emerald-100 px-4 py-2 text-sm font-black text-emerald-800">
                  See product
                </a>
              ) : null}
              <a href="/nutrition/cards" className="rounded-full bg-slate-100 px-4 py-2 text-sm font-black">
                Search product database
              </a>
              <button type="button" className="rounded-full bg-amber-100 px-4 py-2 text-sm font-black text-amber-800">
                Correct product
              </button>
            </div>
          </div>
        </div>
      </section>

      <NutrientSnapshotGrid nutrients={nutrients} />

      <div className="sticky bottom-3 z-30 flex justify-end">
        <button className="rounded-full bg-slate-950 px-6 py-4 text-sm font-black text-white shadow-2xl">Save food log</button>
      </div>
    </form>
  );
}
