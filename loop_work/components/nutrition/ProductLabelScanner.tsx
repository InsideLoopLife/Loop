
"use client";

import { useState, useTransition } from "react";
import { applyLabelImageCandidateToMeal } from "@/app/nutrition/actions";

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

type Candidate = {
  label?: string;
  brand_name?: string;
  card_kind?: string;
  serving_label?: string;
  package_quantity?: string;
  data_confidence?: number;
  confidence_reason?: string;
  ingredients_text?: string;
  directions?: string;
  estimate?: {
    per_serving?: Record<string, number>;
    ingredients_json?: any[];
    allergen_flags?: string[];
    dietary_flags?: string[];
    manufacturing_notes?: string[];
    micronutrient_notes?: string[];
    assumptions?: string[];
    confidence?: number;
  };
};

const nutrientPreview = [
  ["calories", "kcal", ""],
  ["carbs_g", "carbs", "g"],
  ["sugar_g", "sugar", "g"],
  ["sodium_mg", "sodium", "mg"],
  ["salt_g", "salt", "g"],
  ["caffeine_mg", "caffeine", "mg"],
  ["vitamin_c_mg", "vit C", "mg"],
  ["niacin_mg", "niacin", "mg"],
  ["vitamin_b12_ug", "B12", "µg"],
] as const;

function num(value: unknown) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "0";
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

export function ProductLabelScanner({ mealId, label, sourceUrl }: { mealId: string; label: string; sourceUrl?: string | null }) {
  const [source, setSource] = useState(sourceUrl || "");
  const [fileName, setFileName] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState("");
  const [status, setStatus] = useState("");
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [pending, startTransition] = useTransition();

  async function onFile(file?: File | null) {
    if (!file) return;
    setFileName(file.name);
    setImageDataUrl(await readFileAsDataUrl(file));
    setCandidate(null);
    setStatus("Label image ready. Click Read label to extract the facts.");
  }

  async function scan() {
    if (!imageDataUrl && !source) {
      setStatus("Add a label image or source URL first.");
      return;
    }
    startTransition(async () => {
      setStatus("Reading label…");
      setCandidate(null);
      try {
        const response = await fetch("/api/nutrition/label-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ imageDataUrl, imageUrl: source, sourceUrl: source, productHint: label, fileName }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not read label");
        setCandidate(data.candidate);
        setStatus(data.note || "Label extracted. Review before saving.");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Could not read label");
      }
    });
  }

  const per = candidate?.estimate?.per_serving || {};
  const ingredients = candidate?.estimate?.ingredients_json || [];

  return (
    <div className="mt-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-3 text-xs font-bold text-emerald-900">
      <p className="font-black uppercase tracking-wide text-emerald-700">Product label scanner</p>
      <p className="mt-1 text-emerald-900/80">Upload a nutrition/supplement facts label or paste a direct image URL. This replaces the incorrect product data after review.</p>
      <div className="mt-3 grid gap-2">
        <input value={source} onChange={(event) => setSource(event.target.value)} placeholder="Label image URL or product source" className="rounded-xl border border-emerald-200 bg-white px-3 py-2 outline-none" />
        <input type="file" accept="image/*" capture="environment" onChange={(event) => onFile(event.target.files?.[0])} className="rounded-xl bg-white px-3 py-2" />
        {fileName ? <p className="text-emerald-800">Selected: {fileName}</p> : null}
        <button type="button" onClick={scan} disabled={pending} className="rounded-full bg-emerald-700 px-3 py-2 font-black text-white disabled:opacity-60">{pending ? "Reading…" : "Read label"}</button>
      </div>
      {status ? <p className="mt-2 rounded-xl bg-white px-3 py-2 text-emerald-900">{status}</p> : null}
      {candidate ? (
        <div className="mt-3 rounded-xl bg-white p-3 text-slate-700">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-black text-slate-950">{candidate.brand_name ? `${candidate.brand_name} ` : ""}{candidate.label || label}</p>
              <p className="mt-1">{candidate.card_kind || "product"} · {candidate.serving_label || "Serving not stated"} · confidence {candidate.data_confidence || candidate.estimate?.per_serving?.confidence || candidate.estimate?.confidence || 0}%</p>
              {candidate.package_quantity ? <p className="mt-1 text-slate-500">Pack: {candidate.package_quantity}</p> : null}
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 md:grid-cols-4">
            {nutrientPreview.map(([key, title, suffix]) => (
              <span key={key} className="rounded-lg bg-slate-50 p-2"><span className="block text-[0.65rem] uppercase text-slate-400">{title}</span>{num(per[key])}{suffix}</span>
            ))}
          </div>
          {ingredients.length ? <div className="mt-3 rounded-xl bg-slate-50 p-3"><p className="text-[0.65rem] font-black uppercase text-slate-400">Ingredients read</p><p className="mt-1 line-clamp-4 text-xs font-semibold text-slate-600">{ingredients.map((item: any) => [item.quantity, item.name].filter(Boolean).join(" ")).join(", ")}</p></div> : null}
          {candidate.directions ? <p className="mt-2 rounded-xl bg-slate-50 p-3 text-xs font-semibold text-slate-600">Directions: {candidate.directions}</p> : null}
          <form action={applyLabelImageCandidateToMeal} className="mt-3">
            <input type="hidden" name="meal_id" value={mealId} />
            <input type="hidden" name="candidate_json" value={JSON.stringify(candidate)} />
            <button className="rounded-full bg-slate-950 px-3 py-2 font-black text-white">Apply corrected label data</button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
