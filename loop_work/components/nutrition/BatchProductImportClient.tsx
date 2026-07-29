"use client";

import { useMemo, useState, useTransition } from "react";
import { bulkAddNutritionMeals } from "@/app/nutrition/actions";
import type { ProductLookupCandidate } from "@/lib/nutrition/product-data";

type ImportMode = "products" | "menu" | "ingredients";
type BatchItem = {
  label: string;
  description?: string;
  source_url?: string | null;
  source_name?: string;
  price?: string | null;
  import_kind?: "product" | "ingredient" | "menu";
  image_url?: string | null;
  allergens?: string[];
  estimate?: any;
};
type ProgressRow = { id: string; label: string; status: "queued" | "checking" | "created" | "warning" | "failed"; detail?: string; image_url?: string | null };

function candidateToItem(candidate: ProductLookupCandidate, sourceName: string, importKind: "product" | "ingredient" = "product"): BatchItem {
  return {
    label: candidate.label,
    description: candidate.ingredients_text || candidate.confidence_reason || "Product lookup result",
    source_url: candidate.source_url || null,
    source_name: candidate.brand_name || sourceName || candidate.source_label,
    price: null,
    import_kind: importKind,
    image_url: candidate.image_url || null,
    allergens: candidate.estimate?.allergen_flags || [],
    estimate: candidate.estimate,
  };
}

function imageFor(label: string, imageUrl?: string | null) {
  return imageUrl || `/api/food-image-placeholder?label=${encodeURIComponent(label || "Food")}`;
}

async function readJsonResponse(response: Response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new Error(text?.slice(0, 240) || `Request failed with ${response.status}`);
  }
}

export function BatchProductImportClient() {
  const [mode, setMode] = useState<ImportMode>("products");
  const [sourceName, setSourceName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [lines, setLines] = useState("");
  const [items, setItems] = useState<BatchItem[]>([]);
  const [progress, setProgress] = useState<ProgressRow[]>([]);
  const [note, setNote] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const selectedJson = useMemo(() => JSON.stringify(items), [items]);

  function addProgress(row: ProgressRow) {
    setProgress((current) => [...current, row]);
  }

  function updateProgress(id: string, patch: Partial<ProgressRow>) {
    setProgress((current) => current.map((row) => row.id === id ? { ...row, ...patch } : row));
  }

  function revealItemsGradually(nextItems: BatchItem[], detailPrefix: string) {
    setItems([]);
    nextItems.forEach((item, index) => {
      const id = `${item.label}-${index}`;
      addProgress({ id, label: item.label, status: "queued", detail: "Waiting to be added to the review list.", image_url: item.image_url });
      window.setTimeout(() => {
        setItems((current) => [...current, item]);
        updateProgress(id, { status: "created", detail: `${detailPrefix} · ${Number(item.estimate?.confidence || 0).toFixed(0)}% confidence`, image_url: item.image_url });
      }, 120 * index);
    });
  }

  async function runImport() {
    const queries = lines.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 120);
    setNote("Queued. LoopHealth is checking saved/global data first, then UK product sources/web only where needed.");
    setItems([]);
    setProgress([]);

    startTransition(async () => {
      try {
        if (mode === "menu" || sourceUrl.trim()) {
          addProgress({ id: "source", label: sourceName || sourceUrl || "Source", status: "checking", detail: "Reading source URL, looking for structured menu/product evidence and web fallback data." });
          const response = await fetch("/api/nutrition/menu-import", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              url: sourceUrl.trim(),
              sourceName: sourceName || "Batch import",
              importKind: mode === "menu" ? "menu" : mode === "ingredients" ? "ingredient" : "product",
              itemHints: queries,
              exhaustive: true,
            }),
          });
          const data = await readJsonResponse(response);
          if (!response.ok) throw new Error(data.error || "Could not import that source.");
          const next = Array.isArray(data.items) ? data.items : [];
          const prepared = next.map((item: any) => ({
            ...item,
            source_name: item.source_name || sourceName || data.sourceName || "Batch import",
            import_kind: mode === "menu" ? "menu" : mode === "ingredients" ? "ingredient" : "product",
          }));
          updateProgress("source", {
            status: prepared.length ? "created" : "warning",
            detail: prepared.length
              ? `${prepared.length} item(s) extracted. ${data.sourceMode || "source checked"}${data.dynamicAppDetected ? " · dynamic menu detected" : ""}`
              : "No usable products were extracted. Try the direct product/menu URL, add known item names, or enable headless imports for JavaScript menus.",
          });
          revealItemsGradually(prepared, "Imported from source");
          setNote(`${prepared.length} item(s) found from the source. Review them, then save to reusable cards/global product cache. ${data.note || ""}`.trim());
          return;
        }

        if (!queries.length) throw new Error("Add a URL or paste product/ingredient names, one per line.");
        const results: BatchItem[] = [];
        for (const [index, query] of queries.entries()) {
          const id = `${index}-${query}`;
          addProgress({ id, label: query, status: "checking", detail: "Checking saved cards, shared cache, Open Food Facts UK/global and AI/web fallback." });
          const response = await fetch("/api/nutrition/product-lookup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ query, deepResearch: true, refreshExternal: true }),
          });
          const data = await readJsonResponse(response);
          if (!response.ok) throw new Error(data.error || `Could not lookup ${query}`);
          const first = Array.isArray(data.candidates) ? data.candidates[0] : null;
          let item: BatchItem;
          if (first) {
            item = { ...candidateToItem(first, sourceName || "Batch product import", mode === "ingredients" ? "ingredient" : "product") };
            updateProgress(id, { status: "created", detail: `${first.source_label || first.source} · ${first.data_confidence || first.estimate?.confidence || 0}% confidence`, image_url: first.image_url });
          } else {
            item = { label: query, description: "No confident product match yet. Save as a placeholder and improve later.", source_name: sourceName || "Manual batch import", import_kind: mode === "ingredients" ? "ingredient" : "product", image_url: imageFor(query), estimate: { confidence: 20, health_score: 0, ingredients_json: [{ name: query }], per_serving: {} } };
            updateProgress(id, { status: "warning", detail: "No confident match. Placeholder prepared so you can improve and reuse it later.", image_url: item.image_url });
          }
          results.push(item);
          setItems((current) => [...current, item]);
        }
        setNote(`${results.length} product/ingredient row(s) prepared. Items found via web lookup are cached after saving, so future lookups should avoid another web check.`);
      } catch (error) {
        setNote(error instanceof Error ? error.message : "Batch import failed.");
      }
    });
  }

  return <section className="rounded-[2rem] border border-white/70 bg-white p-5 shadow-xl">
    <div className="grid gap-3 md:grid-cols-3">
      {[
        ["products", "Products", "Brand/product lists such as Coca-Cola, G Fuel, supermarket own-label drinks"],
        ["ingredients", "Ingredients", "Milk, syrups, mince, espresso, sauces or repeat ingredients"],
        ["menu", "Takeaway menu", "Restaurant or TenKites/viewthe.menu style menu pages"],
      ].map(([key, title, text]) => <button key={key} type="button" onClick={() => setMode(key as ImportMode)} className={`rounded-[1.5rem] p-4 text-left ring-1 transition ${mode === key ? "bg-slate-950 text-white ring-slate-950" : "bg-slate-50 text-slate-900 ring-slate-100"}`}><p className="font-black">{title}</p><p className={`mt-1 text-xs font-semibold ${mode === key ? "text-slate-300" : "text-slate-500"}`}>{text}</p></button>)}
    </div>

    <div className="mt-5 grid gap-4 md:grid-cols-2">
      <label className="block"><span className="text-sm font-black text-slate-700">Source / brand / place name</span><input value={sourceName} onChange={(event) => setSourceName(event.target.value)} placeholder="Coca-Cola, G Fuel, Rudy's, Greggs..." className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none ring-emerald-500 focus:ring-2" /></label>
      <label className="block"><span className="text-sm font-black text-slate-700">Source URL</span><input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="Manufacturer, menu or retailer page URL" className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none ring-emerald-500 focus:ring-2" /></label>
      <label className="block md:col-span-2"><span className="text-sm font-black text-slate-700">Product / ingredient names</span><textarea value={lines} onChange={(event) => setLines(event.target.value)} rows={8} placeholder={"One per line, e.g.\nFanta Orange Zero\nG Fuel Hype Sauce\nSplendid Syrups toffee caramel\nGraham's Gold Top milk"} className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none ring-emerald-500 focus:ring-2" /></label>
    </div>

    <div className="mt-4 flex flex-wrap items-center gap-3"><button type="button" disabled={isPending} onClick={runImport} className="rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white disabled:opacity-60">{isPending ? "Checking sources..." : "Run batch checker"}</button>{note ? <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-xs font-black text-emerald-900">{note}</p> : null}</div>

    {progress.length ? <div className="mt-5 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-4">
      <p className="text-sm font-black text-slate-950">Live import log</p>
      <p className="mt-1 text-xs font-semibold text-slate-500">Rows appear as LoopHealth checks them. Save the completed rows to make them reusable without future web checks.</p>
      <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">{progress.map((row) => <div key={row.id} className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-100">
        <img src={imageFor(row.label, row.image_url)} alt="" className="h-12 w-12 rounded-2xl object-cover" />
        <div className="min-w-0 flex-1"><p className="line-clamp-1 text-sm font-black text-slate-950">{row.label}</p><p className="line-clamp-2 text-xs font-semibold text-slate-500">{row.detail}</p></div>
        <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${row.status === "created" ? "bg-emerald-100 text-emerald-800" : row.status === "failed" ? "bg-red-50 text-red-700" : row.status === "warning" ? "bg-orange-50 text-orange-700" : "bg-blue-50 text-blue-700"}`}>{row.status}</span>
      </div>)}</div>
    </div> : null}

    {items.length ? <div className="mt-6 rounded-[1.5rem] bg-slate-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-black text-slate-950">Review imported items</p><p className="text-xs font-semibold text-slate-500">Saving adds them as reusable cards and to the product/ingredient cache. With the service-role key configured, confident items are also saved globally for all users.</p></div><form action={bulkAddNutritionMeals}><input type="hidden" name="items_json" value={selectedJson} /><button className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-black text-white">Save all to reusable cards</button></form></div>
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{items.map((item, idx) => <article key={`${item.label}-${idx}`} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100"><div className="flex gap-3"><img src={imageFor(item.label, item.image_url)} alt="" className="h-14 w-14 rounded-2xl object-cover" /><div className="min-w-0 flex-1"><p className="text-xs font-black uppercase tracking-wide text-emerald-700">{item.import_kind || mode} · {Number(item.estimate?.confidence || 0).toFixed(0)}%</p><h3 className="mt-1 line-clamp-2 text-base font-black text-slate-950">{item.label}</h3></div></div><p className="mt-2 line-clamp-3 text-xs font-semibold text-slate-500">{item.description || "No description supplied."}</p></article>)}</div>
    </div> : null}
  </section>;
}
