"use client";

import * as React from "react";

export type ServingOption = {
  id: string;
  canonical_name: string;
  display_name?: string;
  serving_label: string;
  serving_ml?: number | null;
  serving_g?: number | null;
  prepared_volume_ml?: number | null;
  is_default?: boolean;
  requires_user_confirmation?: boolean;
};

type ProductServingPickerProps = {
  options?: ServingOption[];
  isDrink?: boolean;
  defaultVolumeMl?: number | null;
  defaultServingOptionId?: string | null;
};

export function ProductServingPicker({
  options = [],
  isDrink = false,
  defaultVolumeMl,
  defaultServingOptionId,
}: ProductServingPickerProps) {
  const defaultOption = defaultServingOptionId || options.find((option) => option.is_default)?.id || options[0]?.id || "";
  const [selectedId, setSelectedId] = React.useState(defaultOption);
  const selected = options.find((option) => option.id === selectedId);
  const suggestedMl = selected?.prepared_volume_ml || selected?.serving_ml || defaultVolumeMl || "";
  const [volumeMl, setVolumeMl] = React.useState<string>(suggestedMl ? String(suggestedMl) : "");

  React.useEffect(() => {
    const next = selected?.prepared_volume_ml || selected?.serving_ml;
    if (next) setVolumeMl(String(next));
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const needsVolume = isDrink && !volumeMl;

  return (
    <div className="space-y-3 rounded-3xl border border-slate-200 bg-white p-4">
      <input type="hidden" name="serving_option_id" value={selectedId} />
      <label className="block text-sm font-black">Serving size</label>

      {options.length ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {options.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setSelectedId(option.id)}
              className={`rounded-2xl border p-3 text-left ${
                selectedId === option.id ? "border-emerald-400 bg-emerald-50" : "border-slate-200 bg-slate-50"
              }`}
            >
              <span className="block text-sm font-black">{option.serving_label}</span>
              <span className="block text-xs text-slate-500">
                {option.display_name || option.canonical_name}
                {option.requires_user_confirmation ? " · confirm size" : ""}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl bg-amber-50 p-3 text-sm font-bold text-amber-800">
          No known serving size yet. Enter the drink volume or serving manually before saving.
        </div>
      )}

      {isDrink ? (
        <div>
          <label className="text-sm font-black">Drink volume (ml)</label>
          <input
            name="drink_volume_ml"
            value={volumeMl}
            onChange={(event) => setVolumeMl(event.target.value)}
            required={needsVolume}
            inputMode="decimal"
            type="number"
            min="1"
            step="1"
            placeholder="e.g. 250, 330, 500"
            className={`mt-2 w-full rounded-2xl border px-4 py-3 font-black ${
              needsVolume ? "border-amber-400 bg-amber-50" : "border-slate-200"
            }`}
          />
          <p className="mt-1 text-xs font-bold text-slate-500">
            Required for drinks unless LOOP knows the exact can/bottle/prepared volume.
          </p>
        </div>
      ) : null}
    </div>
  );
}
