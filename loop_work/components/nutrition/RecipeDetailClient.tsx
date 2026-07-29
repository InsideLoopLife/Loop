
"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { logFoodEntry, deleteNutritionMeal, generateMealMethod, queueNutritionProductCorrection, setNutritionMealCardKind } from "@/app/nutrition/actions";
import { isProductLikeKind, nutritionUpdateStatus, productUpdateStatusLabel } from "@/lib/nutrition/intelligence";
import { ProductLabelScanner } from "@/components/nutrition/ProductLabelScanner";

type Person = { id: string; name: string; relationship: string | null; avatar_url?: string | null };
type GroupedIngredient = { section: string; items: string[] };
type DetailMeal = {
  id: string;
  person_id: string | null;
  label: string;
  source_url: string | null;
  image_url: string | null;
  product_image_url?: string | null;
  servings: number | null;
  brand_name: string | null;
  product_data_source?: string | null;
  product_source_url?: string | null;
  card_kind?: string | null;
  nutrition_json?: any;
  ingredients?: string | null;
  ingredients_json?: any;
  nutrition_score: number | null;
  nutrition_confidence: number | null;
  calories: number | null; protein_g?: number | null; carbs_g?: number | null; fat_g?: number | null; fibre_g?: number | null; sugar_g?: number | null; added_sugar_g?: number | null; salt_g?: number | null; saturated_fat_g?: number | null; sodium_mg?: number | null; potassium_mg?: number | null; calcium_mg?: number | null; iron_mg?: number | null; magnesium_mg?: number | null; zinc_mg?: number | null; folate_ug?: number | null; niacin_mg?: number | null; thiamin_mg?: number | null; vitamin_c_mg?: number | null; vitamin_d_ug?: number | null; vitamin_b12_ug?: number | null; caffeine_mg?: number | null;
  allergen_flags: string[] | null;
  dietary_flags: string[] | null;
};

function n(value: unknown) { return Number(value || 0); }
function initials(name: string) { return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase() || "").join("") || "P"; }
function imageSrc(url: string | null | undefined, label = "Food") {
  const value = String(url || "").trim();
  if (!value) return `/api/food-image-placeholder?label=${encodeURIComponent(label)}`;
  if (value.startsWith("/api/food-image-placeholder") || value.startsWith("/api/image-proxy")) return value;
  const normalised = value.startsWith("//") ? `https:${value}` : value;
  if (!/^https?:\/\//i.test(normalised)) return `/api/food-image-placeholder?label=${encodeURIComponent(label)}`;
  return `/api/image-proxy?url=${encodeURIComponent(normalised)}`;
}
function ingredientSearchTerm(item: string) {
  return item.replace(/^[-•]\s*/, "").replace(/^\d+(?:\.\d+)?\s?(?:g|kg|ml|l|tbsp|tsp|shots?|slices?|medium|large|small|scoop)?\s+/i, "").replace(/\([^)]*\)/g, "").trim().slice(0, 80);
}
function scaleQuantity(text: string, factor: number) {
  if (!Number.isFinite(factor) || Math.abs(factor - 1) < 0.01) return text;
  return text.replace(/(^|\s)(\d+(?:\.\d+)?)(\s?(?:g|kg|ml|l|tbsp|tsp|tablespoons?|teaspoons?|shots?|slices?|cloves?|cups?)\b)/gi, (_match, prefix, num, unit) => {
    const scaled = Math.round(Number(num) * factor * 100) / 100;
    const display = Number.isInteger(scaled) ? String(scaled) : scaled.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
    return `${prefix}${display}${unit}`;
  });
}
function embedUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (/youtube\.com|youtu\.be/i.test(parsed.hostname)) {
      const id = parsed.hostname.includes("youtu.be") ? parsed.pathname.slice(1) : parsed.searchParams.get("v");
      return id ? `https://www.youtube.com/embed/${id}` : url;
    }
    if (/vimeo\.com/i.test(parsed.hostname)) {
      const id = parsed.pathname.split("/").filter(Boolean).pop();
      return id ? `https://player.vimeo.com/video/${id}` : url;
    }
    return url;
  } catch { return url; }
}


function labelFactRows(meal: DetailMeal): string[] {
  const rows: string[] = [];
  const add = (value: unknown) => {
    if (value == null) return;
    if (typeof value === "string" || typeof value === "number") rows.push(String(value));
    else if (Array.isArray(value)) value.forEach(add);
    else if (typeof value === "object") {
      const obj = value as any;
      if (obj.label || obj.name || obj.nutrient) rows.push(`${obj.amount || obj.quantity || obj.value || ""} ${obj.unit || ""} ${obj.label || obj.name || obj.nutrient || ""}`.trim());
      else Object.entries(obj).forEach(([key, val]) => rows.push(`${String(val)} ${key}`));
    }
  };
  add(meal.ingredients_json);
  String(meal.ingredients || "").split(/\r?\n|\s•\s/).forEach((line) => rows.push(line));
  add(meal.nutrition_json?.label_facts);
  add(meal.nutrition_json?.nutrition_facts);
  add(meal.nutrition_json?.supplement_facts_rows);
  add(meal.nutrition_json?.facts);
  return rows.map((row) => row.replace(/^[-•]\s*/, "").trim()).filter(Boolean);
}

function valueFromLabelRows(meal: DetailMeal, labelPattern: RegExp) {
  for (const row of labelFactRows(meal)) {
    if (!labelPattern.test(row)) continue;
    const match = row.match(/(\d+(?:\.\d+)?)/);
    if (match) return Number(match[1]);
  }
  return 0;
}

function bestNutrient(meal: DetailMeal, key: string, dbValue?: unknown) {
  const per = meal.nutrition_json?.per_serving && typeof meal.nutrition_json.per_serving === "object" ? meal.nutrition_json.per_serving : {};
  const supplement = meal.nutrition_json?.supplement_facts && typeof meal.nutrition_json.supplement_facts === "object" ? meal.nutrition_json.supplement_facts : {};
  const direct = Number(dbValue || 0);
  if (direct) return direct;
  const aliases: Record<string, string[]> = {
    calories: ["calories", "kcal"], protein_g: ["protein_g", "protein"], carbs_g: ["carbs_g", "carbohydrate", "total_carbohydrate"], fat_g: ["fat_g", "fat"], fibre_g: ["fibre_g", "fiber", "fibre"],
    sugar_g: ["sugar_g", "total_sugars", "sugars"], added_sugar_g: ["added_sugar_g", "added_sugars"], salt_g: ["salt_g", "salt"], sodium_mg: ["sodium_mg", "sodium"],
    vitamin_c_mg: ["vitamin_c_mg", "vitamin_c"], niacin_mg: ["niacin_mg", "niacin"], vitamin_b6_mg: ["vitamin_b6_mg", "vitamin_b6"], vitamin_b12_ug: ["vitamin_b12_ug", "vitamin_b12"],
    choline_mg: ["choline_mg", "choline"], caffeine_mg: ["caffeine_mg", "caffeine", "caffeine_anhydrous"], taurine_mg: ["taurine_mg", "taurine"], glycine_mg: ["glycine_mg", "glycine"],
    l_citrulline_mg: ["l_citrulline_mg", "citrulline", "l_citrulline"], l_theanine_mg: ["l_theanine_mg", "theanine", "l_theanine"], glucuronolactone_mg: ["glucuronolactone_mg", "glucuronolactone"],
    potassium_mg: ["potassium_mg", "potassium"], calcium_mg: ["calcium_mg", "calcium"], iron_mg: ["iron_mg", "iron"], magnesium_mg: ["magnesium_mg", "magnesium"], zinc_mg: ["zinc_mg", "zinc"], folate_ug: ["folate_ug", "folate"], thiamin_mg: ["thiamin_mg", "thiamin"]
  };
  for (const alias of aliases[key] || [key]) {
    const perValue = Number(per[alias] || 0);
    if (perValue) return perValue;
    const supplementValue = Number(supplement[alias] || 0);
    if (supplementValue) return supplementValue;
  }
  const fallbackMap: Record<string, RegExp> = {
    calories: /calories|kcal/i,
    carbs_g: /carbohydrate|carbs/i,
    sugar_g: /total sugars?|sugars?/i,
    added_sugar_g: /added sugars?/i,
    sodium_mg: /sodium/i,
    vitamin_c_mg: /vitamin c/i,
    niacin_mg: /niacin/i,
    vitamin_b6_mg: /vitamin b6/i,
    vitamin_b12_ug: /vitamin b12/i,
    choline_mg: /choline/i,
    caffeine_mg: /caffeine/i,
    taurine_mg: /taurine/i,
    glycine_mg: /\bglycine\b/i,
    l_citrulline_mg: /citrulline/i,
    l_theanine_mg: /theanine/i,
    glucuronolactone_mg: /glucuronolactone/i,
    potassium_mg: /potassium/i,
    calcium_mg: /calcium/i,
    iron_mg: /\biron\b/i,
    magnesium_mg: /magnesium/i,
    zinc_mg: /\bzinc\b/i,
    folate_ug: /folate/i,
    thiamin_mg: /thiamin/i,
  };
  return fallbackMap[key] ? valueFromLabelRows(meal, fallbackMap[key]) : 0;
}

function isNutrientFact(section: string, item: string) {
  const text = `${section} ${item}`.toLowerCase();
  return /nutrition|supplement|calories|carbohydrate|sugars?|sodium|vitamin|niacin|taurine|glycine|citrulline|theanine|caffeine|choline|glucuronolactone|magnesium|zinc|iron|calcium|folate|thiamin/.test(text);
}

function productSubType(meal: DetailMeal) {
  const text = `${meal.card_kind || ""} ${meal.product_data_source || ""} ${meal.label || ""} ${meal.nutrition_json?.serving_label || ""}`.toLowerCase();
  if (/drink_product|powdered_drink|prepared drink|gfuel|g fuel|latte|coffee|espresso|juice|smoothie|shake|drink/.test(text)) return "Drink product";
  if (/supplement/.test(text)) return "Supplement";
  if (/ingredient/.test(text)) return "Ingredient";
  if (/product|barcode|label/.test(text)) return "Food product";
  return "Recipe / meal";
}

function inferredAllergens(meal: DetailMeal) {
  const text = `${meal.label || ""} ${meal.ingredients || ""} ${JSON.stringify(meal.ingredients_json || [])}`.toLowerCase();
  const found = new Set<string>((meal.allergen_flags || []).map(String));
  if (/milk|cheese|butter|cream|yoghurt|yogurt|whey|casein|lactose/.test(text)) found.add("dairy");
  if (/egg\b|eggs/.test(text)) found.add("egg");
  if (/gluten|wheat|sourdough|bread|pasta|spaghetti/.test(text)) found.add("gluten");
  if (/(\bpeanut\b|\balmond\b|\bcashew\b|\bwalnut\b|\bhazelnut\b|\bpecan\b|\bpistachio\b|brazil nut|tree nut|\bnuts?\b)/.test(text)) found.add("nuts");
  if (/sesame|tahini/.test(text)) found.add("sesame");
  if (/soy|soya/.test(text)) found.add("soy");
  if (/fish|salmon|tuna|cod|shellfish|prawn|shrimp|crab/.test(text)) found.add("fish / shellfish");
  return Array.from(found);
}

function NutritionTransparency({ meal }: { meal: DetailMeal }) {
  const sodium = bestNutrient(meal, "sodium_mg", meal.sodium_mg);
  const salt = bestNutrient(meal, "salt_g", meal.salt_g) || (sodium ? Math.round((sodium * 2.54 / 1000) * 100) / 100 : 0);
  const facts = [
    ["Calories", bestNutrient(meal, "calories", meal.calories).toFixed(0), "kcal"],
    ["Protein", bestNutrient(meal, "protein_g", meal.protein_g).toFixed(1), "g"],
    ["Carbs", bestNutrient(meal, "carbs_g", meal.carbs_g).toFixed(1), "g"],
    ["Fat", bestNutrient(meal, "fat_g", meal.fat_g).toFixed(1), "g"],
    ["Fibre", bestNutrient(meal, "fibre_g", meal.fibre_g).toFixed(1), "g"],
    ["Sugar", bestNutrient(meal, "sugar_g", meal.sugar_g).toFixed(1), "g"],
    ["Added sugar", bestNutrient(meal, "added_sugar_g", meal.added_sugar_g).toFixed(1), "g"],
    ["Salt", salt.toFixed(2), "g"],
    ["Sat fat", bestNutrient(meal, "saturated_fat_g", meal.saturated_fat_g).toFixed(1), "g"],
    ["Sodium", sodium.toFixed(0), "mg"],
    ["Potassium", bestNutrient(meal, "potassium_mg", meal.potassium_mg).toFixed(0), "mg"],
    ["Calcium", bestNutrient(meal, "calcium_mg", meal.calcium_mg).toFixed(0), "mg"],
    ["Iron", bestNutrient(meal, "iron_mg", meal.iron_mg).toFixed(1), "mg"],
    ["Magnesium", bestNutrient(meal, "magnesium_mg", meal.magnesium_mg).toFixed(0), "mg"],
    ["Zinc", bestNutrient(meal, "zinc_mg", meal.zinc_mg).toFixed(1), "mg"],
    ["Folate", bestNutrient(meal, "folate_ug", meal.folate_ug).toFixed(0), "µg"],
    ["Niacin", bestNutrient(meal, "niacin_mg", meal.niacin_mg).toFixed(1), "mg"],
    ["Thiamin", bestNutrient(meal, "thiamin_mg", meal.thiamin_mg).toFixed(1), "mg"],
    ["Vitamin C", bestNutrient(meal, "vitamin_c_mg", meal.vitamin_c_mg).toFixed(0), "mg"],
    ["Vitamin B6", bestNutrient(meal, "vitamin_b6_mg").toFixed(1), "mg"],
    ["Vitamin D", bestNutrient(meal, "vitamin_d_ug", meal.vitamin_d_ug).toFixed(1), "µg"],
    ["B12", bestNutrient(meal, "vitamin_b12_ug", meal.vitamin_b12_ug).toFixed(1), "µg"],
    ["Choline", bestNutrient(meal, "choline_mg").toFixed(0), "mg"],
    ["Caffeine", bestNutrient(meal, "caffeine_mg", meal.caffeine_mg).toFixed(0), "mg"],
    ["Taurine", bestNutrient(meal, "taurine_mg").toFixed(0), "mg"],
    ["L-Citrulline", bestNutrient(meal, "l_citrulline_mg").toFixed(0), "mg"],
  ];
  return <section className="mt-6 rounded-[2rem] border border-slate-100 bg-slate-50 p-5"><p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-600">Nutrition transparency</p><h2 className="mt-1 text-2xl font-black text-slate-950">Macro / micro snapshot</h2><p className="mt-1 text-sm font-semibold text-slate-500">Every tracked nutrient we hold for this card is visible here. Label facts now feed this section directly, even where the database does not have a dedicated column yet.</p><div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-4">{facts.map(([label, value, unit]) => <div key={label} className="rounded-2xl bg-white p-3"><p className="text-[0.65rem] font-black uppercase text-slate-400">{label}</p><p className="mt-1 text-lg font-black text-slate-950">{value}<span className="ml-1 text-xs text-slate-500">{unit}</span></p></div>)}</div></section>;
}

function Panel({ title, eyebrow, children, defaultOpen = false }: { title: string; eyebrow?: string; children: React.ReactNode; defaultOpen?: boolean }) {
  return <details open={defaultOpen} className="rounded-[2rem] border border-white/70 bg-white p-5 shadow-xl"><summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden"><p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-600">{eyebrow}</p><div className="mt-1 flex items-center justify-between gap-3"><h2 className="text-2xl font-black text-slate-950">{title}</h2><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">expand</span></div></summary><div className="mt-5">{children}</div></details>;
}

export function RecipeDetailClient({ meal, people, ingredientGroups, steps, videos, today }: { meal: DetailMeal; people: Person[]; ingredientGroups: GroupedIngredient[]; steps: string[]; videos: string[]; today: string }) {
  const baseServings = Math.max(1, Number(meal.servings || 1));
  const [servingsToMake, setServingsToMake] = useState(baseServings);
  const defaultPerson = people.find((person) => /self|me|account owner|daniel/i.test(`${person.relationship || ""} ${person.name}`)) || people[0] || null;
  const [selectedPeople, setSelectedPeople] = useState<string[]>(meal.person_id ? [meal.person_id] : (defaultPerson?.id ? [defaultPerson.id] : []));
  const [showVideo, setShowVideo] = useState(Boolean(videos.length));
  const scaleFactor = Math.max(0.05, servingsToMake / baseServings);
  const selectedJson = useMemo(() => JSON.stringify(selectedPeople), [selectedPeople]);
  const productLike = isProductLikeKind(`${meal.card_kind || ""} ${meal.product_data_source || ""}`);
  const productTypeLabel = productSubType(meal);
  const displayedAllergens = inferredAllergens(meal);
  const updateStatus = nutritionUpdateStatus(meal);
  const mainImage = imageSrc(meal.image_url || meal.product_image_url, meal.label);

  function toggle(id: string) { setSelectedPeople((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]); }

  return <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
    <article className="rounded-[2rem] border border-white/70 bg-white p-5 shadow-xl">
      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="min-h-[320px]"><img src={mainImage} alt="" className="h-full min-h-[320px] w-full rounded-[2rem] object-cover shadow-lg" /></div>
        <div>
          <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-600">{productLike ? "Product serving" : `${baseServings} base serving(s)`}</p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm font-black text-slate-700"><div className="rounded-2xl bg-slate-50 p-3"><span className="block text-xs uppercase text-slate-400">kcal</span>{bestNutrient(meal, "calories", meal.calories).toFixed(0)}</div><div className="rounded-2xl bg-slate-50 p-3"><span className="block text-xs uppercase text-slate-400">protein</span>{bestNutrient(meal, "protein_g", meal.protein_g).toFixed(0)}g</div><div className="rounded-2xl bg-slate-50 p-3"><span className="block text-xs uppercase text-slate-400">fibre</span>{bestNutrient(meal, "fibre_g", meal.fibre_g).toFixed(1)}g</div><div className="rounded-2xl bg-slate-50 p-3"><span className="block text-xs uppercase text-slate-400">salt</span>{(bestNutrient(meal, "salt_g", meal.salt_g) || (bestNutrient(meal, "sodium_mg", meal.sodium_mg) * 2.54 / 1000)).toFixed(1)}g</div></div>
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-black"><span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-800">Confidence {n(meal.nutrition_confidence).toFixed(0)}%</span><span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">Score {n(meal.nutrition_score).toFixed(0)}/100</span>{meal.brand_name ? <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">{meal.brand_name}</span> : null}</div>
          {updateStatus ? <p className="mt-3 inline-flex rounded-full bg-amber-100 px-3 py-2 text-xs font-black text-amber-800" title={productUpdateStatusLabel(updateStatus)}>⏱ {productUpdateStatusLabel(updateStatus)}</p> : null}
          {meal.dietary_flags?.length ? <div className="mt-4"><p className="text-xs font-black uppercase tracking-wide text-slate-400">Dietary flags</p><div className="mt-2 flex flex-wrap gap-2">{meal.dietary_flags.map((flag) => <span key={flag} className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-700 ring-1 ring-slate-100">{flag}</span>)}</div></div> : null}
          {displayedAllergens.length ? <div className="mt-4"><p className="text-xs font-black uppercase tracking-wide text-slate-400">Allergens</p><div className="mt-2 flex flex-wrap gap-2">{displayedAllergens.map((flag) => <span key={flag} className="rounded-full bg-red-50 px-3 py-1 text-xs font-black text-red-700">{flag}</span>)}</div></div> : null}
        </div>
      </div>
      <div className="mt-6"><div className="mb-3 flex flex-col gap-3 md:flex-row md:items-end md:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-600">Ingredients</p><h2 className="text-2xl font-black text-slate-950">Everything we know</h2></div><label className="block"><span className="text-xs font-black uppercase tracking-wide text-slate-500">Scale to servings</span><input type="number" min="0.25" step="0.25" value={servingsToMake} onChange={(event) => setServingsToMake(Number(event.target.value || baseServings))} className="mt-1 w-36 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black outline-none ring-emerald-500 focus:ring-2" /></label></div>
        <div className="grid gap-4 lg:grid-cols-2">{ingredientGroups.length ? ingredientGroups.map((group) => <div key={group.section} className="rounded-[1.75rem] bg-slate-50 p-4"><p className="text-sm font-black uppercase tracking-wide text-slate-500">{group.section}</p><ul className="mt-3 space-y-2 text-sm font-semibold text-slate-700">{group.items.map((item, idx) => { const term = ingredientSearchTerm(item); return <li key={`${group.section}-${idx}`} className="flex gap-2"><span className="mt-[0.35rem] inline-block h-2 w-2 rounded-full bg-emerald-500" /> <span className="min-w-0 flex-1">{scaleQuantity(item, scaleFactor)}</span>{term && !isNutrientFact(group.section, item) ? <Link href={`/nutrition/ingredients?q=${encodeURIComponent(term)}`} className="shrink-0 rounded-full bg-white px-2 py-1 text-xs font-black text-amber-600 ring-1 ring-amber-100" title={`Open ingredient intelligence for ${term}`}>Info</Link> : null}</li>; })}</ul></div>) : <div className="rounded-[1.75rem] border border-dashed border-slate-300 bg-slate-50 p-4 text-sm font-semibold text-slate-500">No structured ingredients saved yet. Edit the card to add them.</div>}</div>
      </div>
      <NutritionTransparency meal={meal} />
    </article>
    <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
      <Panel title={productLike ? "Product details" : "How to make it"} eyebrow={productLike ? "Product type" : "Method"} defaultOpen>
        {productLike ? <div className="rounded-[1.75rem] bg-slate-50 p-4 text-sm font-bold text-slate-600"><span className="mb-3 inline-flex rounded-full bg-emerald-100 px-3 py-2 text-xs font-black uppercase tracking-wide text-emerald-800">{productTypeLabel}</span><p>This is a product card, so no cooking method is needed. Use the correction/label scanner to improve product facts.</p></div> : steps.length ? <ol className="space-y-4">{steps.map((step, idx) => <li key={idx} className="rounded-[1.75rem] bg-slate-50 p-4"><p className="text-xs font-black uppercase tracking-wide text-emerald-700">Step {idx + 1}</p><p className="mt-2 text-sm font-semibold leading-6 text-slate-700">{step}</p></li>)}</ol> : <form action={generateMealMethod} className="rounded-[1.75rem] border border-dashed border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-900"><input type="hidden" name="id" value={meal.id} /><p>No method has been saved yet.</p><button className="mt-3 rounded-full bg-emerald-100 px-4 py-2 text-sm font-black text-emerald-800">Generate method</button></form>}
      </Panel>
      {videos.length ? <Panel title="Cook along" eyebrow="Source video"><div className="flex items-center justify-between gap-3"><button type="button" onClick={() => setShowVideo((value) => !value)} className="rounded-full bg-slate-100 px-4 py-2 text-xs font-black text-slate-700">{showVideo ? "Hide" : "Show"}</button></div>{showVideo ? <div className="mt-4 overflow-hidden rounded-[1.5rem] bg-slate-950"><iframe src={embedUrl(videos[0])} title={`${meal.label} video`} className="aspect-video w-full" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen /></div> : null}</Panel> : null}
      <Panel title="Log this now" eyebrow="Quick add">
        <form action={logFoodEntry} className="space-y-4"><input type="hidden" name="meal_id" value={meal.id} /><input type="hidden" name="label" value={meal.label} /><input type="hidden" name="image_url" value={meal.image_url || meal.product_image_url || ""} /><input type="hidden" name="person_ids_json" value={selectedJson} /><input type="hidden" name="serving_multiplier" value={scaleFactor} />
          <div className="grid gap-4 sm:grid-cols-2"><label className="block"><span className="text-sm font-bold text-slate-700">Date</span><input name="eaten_on" type="date" defaultValue={today} className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none ring-emerald-500 focus:ring-2" /></label><label className="block"><span className="text-sm font-bold text-slate-700">Meal slot</span><select name="meal_slot" defaultValue={productLike && /drink|coffee|latte|gfuel|g fuel/i.test(meal.label) ? "drink" : "meal"} className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none ring-emerald-500 focus:ring-2"><option value="breakfast">Breakfast</option><option value="lunch">Lunch</option><option value="dinner">Dinner</option><option value="snack">Snack</option><option value="drink">Drink</option><option value="meal">Meal</option></select></label></div>
          <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-3"><p className="text-sm font-black text-slate-950">Who had this?</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => toggle("__household__")} className={`rounded-2xl px-4 py-3 text-sm font-black ring-2 ${selectedPeople.includes("__household__") ? "bg-slate-950 text-white ring-slate-950" : "bg-white text-slate-700 ring-slate-100"}`}>Household</button>{people.map((person) => <button key={person.id} type="button" onClick={() => toggle(person.id)} className={`flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-black ring-2 ${selectedPeople.includes(person.id) ? "bg-emerald-50 text-emerald-900 ring-emerald-400" : "bg-white text-slate-700 ring-slate-100"}`}>{person.avatar_url ? <img src={person.avatar_url} alt="" className="h-7 w-7 rounded-full object-cover" /> : <span className="grid h-7 w-7 place-items-center rounded-full bg-slate-200 text-xs">{initials(person.name)}</span>}{person.name}</button>)}</div></div>
          <label className="block"><span className="text-sm font-bold text-slate-700">Notes</span><textarea name="notes" rows={4} placeholder="Optional note for this serving..." className="mt-1 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold outline-none ring-emerald-500 focus:ring-2" /></label><button className="rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white">Add to daily log</button></form>
      </Panel>
      {productLike ? <Panel title="Submit better label/source data" eyebrow="Product correction"><form action={queueNutritionProductCorrection} id="product-correction" className="space-y-3"><input type="hidden" name="meal_id" value={meal.id} /><input type="hidden" name="label" value={meal.label} /><input name="source_url" defaultValue={meal.product_source_url || meal.source_url || ""} placeholder="Product URL or source" className="w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm font-bold outline-none" /><input name="label_image_url" placeholder="Label image URL" className="w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm font-bold outline-none" /><textarea name="notes" placeholder="What is wrong? e.g. serving is 6.2g scoop, calories should be 5." className="w-full rounded-2xl border border-emerald-200 bg-white px-4 py-3 text-sm font-bold outline-none" /><button className="rounded-full bg-emerald-700 px-5 py-3 text-sm font-black text-white">Queue correction</button></form><ProductLabelScanner mealId={meal.id} label={meal.label} sourceUrl={meal.product_source_url || meal.source_url || ""} /></Panel> : null}
      <Panel title="Manage this card" eyebrow="Card management"><div className="flex flex-wrap gap-2"><Link href={`/nutrition?open=edit-recipe&meal=${meal.id}`} className="rounded-full bg-slate-950 px-4 py-2 text-sm font-black text-white">Edit card</Link><Link href="/nutrition?open=recipe" className="rounded-full bg-slate-100 px-4 py-2 text-sm font-black text-slate-700">Create another</Link><form action={setNutritionMealCardKind}><input type="hidden" name="id" value={meal.id} /><input type="hidden" name="card_kind" value={productLike ? "recipe" : "product"} /><button className="rounded-full bg-slate-100 px-4 py-2 text-sm font-black text-slate-700">Mark as {productLike ? "recipe" : "product"}</button></form><form action={deleteNutritionMeal}><input type="hidden" name="id" value={meal.id} /><button className="rounded-full bg-red-50 px-4 py-2 text-sm font-black text-red-600">Delete</button></form></div></Panel>
    </aside>
  </section>;
}
