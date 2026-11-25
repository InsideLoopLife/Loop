"use client";

import { carAssetPath } from "@/components/mortgage/carAssets";
import { CAR_BODY_OPTIONS, CAR_PAINTS, guessBody, paintFor } from "@/lib/vehicles/look";

/** Colour and body style for a car, so the drive drawing on Household matches it. */
export function CarLookPicker({
  colour,
  body,
  make,
  model,
  fuel,
  onChange,
  title = "How it looks on your drive",
}: {
  colour: string | null | undefined;
  body: string | null | undefined;
  make?: string | null;
  model?: string | null;
  fuel?: string | null;
  onChange: (patch: { colour?: string | null; body?: string | null }) => void;
  title?: string;
}) {
  const guessed = guessBody(make, model);
  const shownBody = body || guessed || "hatch";
  const paint = paintFor(colour);
  const ev = fuel === "electric" || fuel === "plug_in_hybrid";
  return (
    <fieldset className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
      <legend className="px-1 text-xs font-black text-slate-600">{title}</legend>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1 space-y-2.5">
          <div>
            <p className="text-[11px] font-bold text-slate-500">Colour</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {CAR_PAINTS.map((p) => (
                <button key={p.hex} type="button" onClick={() => onChange({ colour: p.name })} aria-pressed={paint === p.hex}
                  className={`flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5 text-xs font-semibold ${paint === p.hex ? "bg-slate-950 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100"}`}>
                  <span className="h-4 w-4 rounded-full ring-1 ring-black/10" style={{ background: p.hex }} />{p.name}
                </button>
              ))}
            </div>
            {colour && !CAR_PAINTS.some((p) => p.name === colour) ? <p className="mt-1 text-[11px] text-slate-500">&ldquo;{colour}&rdquo; — shown as {CAR_PAINTS.find((p) => p.hex === paint)?.name.toLowerCase() || "the default colour"}</p> : null}
          </div>
          <div>
            <p className="text-[11px] font-bold text-slate-500">Body style{!body && guessed ? " — guessed from the model" : ""}</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {CAR_BODY_OPTIONS.map(([key, text]) => (
                <button key={key} type="button" onClick={() => onChange({ body: key })} aria-pressed={shownBody === key}
                  className={`rounded-full px-2.5 py-1 text-xs font-bold ${shownBody === key ? (body ? "bg-slate-950 text-white" : "bg-slate-700 text-white") : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100"}`}>{text}</button>
              ))}
            </div>
          </div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={carAssetPath({ body: shownBody, colour: paint || undefined, ev }, false, "modern")} alt="How the car will look on the drive" width={140} height={112} className="h-24 w-32 shrink-0 rounded-lg bg-slate-200/50 object-contain" />
      </div>
    </fieldset>
  );
}
