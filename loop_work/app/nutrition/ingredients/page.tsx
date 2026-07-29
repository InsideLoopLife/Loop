import Link from "next/link";
import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { createClient } from "@/lib/supabase/server";
import { mealImageEmoji } from "@/lib/nutrition/scoring";
import { createIngredientIntelligenceFromSearch } from "@/app/nutrition/actions";

type Ingredient = {
  id: string;
  label: string;
  brand_name: string | null;
  source_url: string | null;
  image_url: string | null;
  source_type: string | null;
  data_confidence: number | null;
  serving_label: string | null;
  ingredients_text: string | null;
  allergen_flags: string[] | null;
  dietary_flags: string[] | null;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  fibre_g: number | null;
  sugar_g: number | null;
  salt_g: number | null;
  saturated_fat_g: number | null;
  caffeine_mg: number | null;
  use_count: number | null;
  last_used_at: string | null;
  meal_id: string | null;
};

function n(value: unknown) { return Number(value || 0); }
function imageSrc(url: string | null | undefined, label = "Food") {
  const value = String(url || "").trim();
  if (!value) return `/api/food-image-placeholder?label=${encodeURIComponent(label)}`;
  if (value.startsWith("/api/food-image-placeholder") || value.startsWith("/api/image-proxy")) return value;
  const normalised = value.startsWith("//") ? `https:${value}` : value;
  if (!/^(https?:)?\/\//i.test(normalised)) return `/api/food-image-placeholder?label=${encodeURIComponent(label)}`;
  return `/api/image-proxy?url=${encodeURIComponent(normalised)}`;
}
function IngredientImage({ item }: { item: Ingredient }) {
  const src = imageSrc(item.image_url, item.label);
  if (src) return <img src={src} alt="" className="h-28 w-28 rounded-[1.5rem] object-cover shadow-sm" />;
  return <div className="grid h-28 w-28 place-items-center rounded-[1.5rem] bg-[radial-gradient(circle_at_25%_20%,rgba(255,255,255,.9),transparent_25%),linear-gradient(135deg,#ecfdf5,#fef3c7_55%,#fed7aa)] text-3xl shadow-inner">{mealImageEmoji(item.label)}</div>;
}

export default async function NutritionIngredientsPage({ searchParams }: { searchParams?: Promise<{ q?: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const params = await searchParams;
  const q = String(params?.q || "").trim();
  let query = supabase.from("nutrition_ingredients").select("id, label, brand_name, source_url, image_url, source_type, data_confidence, serving_label, ingredients_text, allergen_flags, dietary_flags, calories, protein_g, carbs_g, fat_g, fibre_g, sugar_g, salt_g, saturated_fat_g, caffeine_mg, use_count, last_used_at, meal_id").eq("user_id", user.id);
  if (q) query = query.ilike("label", `%${q}%`);
  const { data, error } = await query.order("last_used_at", { ascending: false }).order("use_count", { ascending: false }).limit(120).returns<Ingredient[]>();
  const items = data || [];

  return <>
    <Nav />
    <main className="mx-auto w-[95vw] max-w-none space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[2.5rem] bg-slate-950 p-7 text-white shadow-2xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-200">LoopHealth database</p>
            <h1 className="mt-2 text-4xl font-black tracking-tight">Ingredients and products</h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold text-slate-300">This is for reusable ingredients, drinks and packaged/product entries imported from URLs, labels or quick search. Recipes stay in the recipe card library.</p>
          </div>
          <div className="flex flex-wrap gap-2"><Link href="/nutrition/cards" className="rounded-full bg-white/10 px-5 py-3 text-sm font-black text-white ring-1 ring-white/20">Recipe cards</Link><Link href="/nutrition" className="rounded-full bg-white px-5 py-3 text-sm font-black text-slate-950">Daily log</Link></div>
        </div>
      </section>

      <section className="rounded-[2rem] border border-white/70 bg-white/90 p-4 shadow-xl">
        <form className="grid gap-3 md:grid-cols-[1fr_auto]" action="/nutrition/ingredients">
          <input name="q" defaultValue={q} placeholder="Search syrup, milk, espresso, VIVE, GFuel, barcode products..." className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold outline-none ring-emerald-500 focus:ring-2" />
          <button className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white">Search</button>
        </form>
      </section>

      {error ? <section className="rounded-[2rem] border border-amber-200 bg-amber-50 p-5 text-sm font-bold text-amber-900">Ingredient database is not ready yet. Run <code className="rounded bg-white px-2 py-1">db/v27_27_loophealth_ingredients_cards_day_quickfix.sql</code>, then refresh this page.</section> : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => <article key={item.id} className="rounded-[2rem] border border-white/70 bg-white p-5 shadow-xl">
          <div className="flex gap-4">
            <IngredientImage item={item} />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-black uppercase tracking-wide text-emerald-700">{item.source_type || "ingredient"} · used {n(item.use_count).toFixed(0)} time(s)</p>
              <h2 className="mt-1 line-clamp-2 text-xl font-black text-slate-950">{item.label}</h2>
              {item.brand_name ? <p className="mt-1 text-sm font-bold text-slate-500">{item.brand_name}</p> : null}
              <p className="mt-2 text-xs font-semibold text-slate-500">Confidence {n(item.data_confidence).toFixed(0)}%</p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-4 gap-2 text-xs font-black text-slate-700"><div className="rounded-2xl bg-slate-50 p-2"><span className="block text-slate-400">kcal</span>{n(item.calories).toFixed(0)}</div><div className="rounded-2xl bg-slate-50 p-2"><span className="block text-slate-400">protein</span>{n(item.protein_g).toFixed(1)}g</div><div className="rounded-2xl bg-slate-50 p-2"><span className="block text-slate-400">fibre</span>{n(item.fibre_g).toFixed(1)}g</div><div className="rounded-2xl bg-slate-50 p-2"><span className="block text-slate-400">salt</span>{n(item.salt_g).toFixed(2)}g</div></div>
          {item.ingredients_text ? <p className="mt-4 line-clamp-3 rounded-2xl bg-slate-50 p-3 text-sm font-semibold text-slate-600">{item.ingredients_text}</p> : null}
          <div className="mt-4 flex flex-wrap gap-2">{item.meal_id ? <Link href={`/nutrition?open=log&meal=${item.meal_id}`} className="rounded-full bg-slate-950 px-4 py-2 text-sm font-black text-white">Log again</Link> : null}{item.source_url ? <a href={item.source_url} target="_blank" rel="noreferrer" className="rounded-full bg-emerald-50 px-4 py-2 text-sm font-black text-emerald-800">Source</a> : null}</div>
        </article>)}
        {!items.length && !error ? <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white/80 p-8 text-center md:col-span-2 xl:col-span-3">
          {q ? <>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-700">Ingredient intelligence</p>
            <h2 className="mt-2 text-2xl font-black text-slate-950">No record for “{q}” yet</h2>
            <p className="mx-auto mt-2 max-w-2xl text-sm font-semibold text-slate-500">Create a starter ingredient/product profile now. LOOP will queue it for enrichment so future users can improve it with source URLs, label scans and better macro/micro data.</p>
            <form action={createIngredientIntelligenceFromSearch} className="mx-auto mt-5 grid max-w-2xl gap-3 rounded-[1.5rem] border border-emerald-100 bg-emerald-50 p-4 text-left">
              <input type="hidden" name="label" value={q} />
              <label className="text-xs font-black uppercase tracking-wide text-emerald-800">Optional source URL</label>
              <input name="source_url" placeholder="Paste product/ingredient source if you have one" className="rounded-2xl border border-emerald-100 bg-white px-4 py-3 text-sm font-bold outline-none ring-emerald-500 focus:ring-2" />
              <label className="text-xs font-black uppercase tracking-wide text-emerald-800">Notes</label>
              <textarea name="notes" placeholder="e.g. ZOE Daily 30+ has nuts; Double Gloucester is a hard cheese; syrup is sugar-free." className="min-h-20 rounded-2xl border border-emerald-100 bg-white px-4 py-3 text-sm font-bold outline-none ring-emerald-500 focus:ring-2" />
              <button className="rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-black text-white">Create ingredient intelligence</button>
            </form>
          </> : <p className="text-sm font-semibold text-slate-500">No ingredients/products have been captured yet. Search for a product or click ingredient Info from a card to start the database.</p>}
        </div> : null}
      </section>
    </main>
  </>;
}
