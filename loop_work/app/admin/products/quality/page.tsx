import Link from "next/link";
import { Search, Settings } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { runAdminChecks } from "../../notifications/actions";
import { archiveProductQualityItem, saveProductQualityOverride } from "./actions";

import { AdminTabs } from "@/components/admin/AdminTabs";
type ProductRow = {
  product_id: string;
  item_kind: string | null;
  display_name: string | null;
  brand_name: string | null;
  product_type: string | null;
  source_provider: string | null;
  source_url: string | null;
  source_image_url?: string | null;
  main_image_url: string | null;
  cached_main_image_url?: string | null;
  calories: number | null;
  protein_g?: number | null;
  carbs_g?: number | null;
  fat_g?: number | null;
  fibre_g?: number | null;
  sugar_g?: number | null;
  salt_g?: number | null;
  micronutrients?: string | null;
  confidence: number | null;
  has_image: boolean;
  has_nutrition: boolean;
  has_verified_source: boolean;
  has_macros?: boolean | null;
  has_micros?: boolean | null;
  quality_score: number;
  missing_fields: string[] | null;
  status: string | null;
  updated_at: string | null;
  hidden_by_admin?: boolean | null;
  admin_note?: string | null;
};

type SearchParams = Promise<{ q?: string; score?: string; sort?: string }>;

function Tick({ ok }: { ok: boolean }) {
  return <span className={`rounded-full px-2 py-1 text-xs font-black ${ok ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>{ok ? "✓" : "✕"}</span>;
}

function productMatches(product: ProductRow, q: string) {
  if (!q) return true;
  const haystack = [product.display_name, product.brand_name, product.product_type, product.source_provider, product.source_url, product.item_kind, product.micronutrients].filter(Boolean).join(" ").toLowerCase();
  return haystack.includes(q.toLowerCase());
}

function cleanKind(kind?: string | null) {
  const raw = String(kind || "product").toLowerCase();
  if (raw.includes("ingredient")) return "Ingredient";
  if (raw.includes("recipe")) return "Recipe";
  if (raw.includes("meal")) return "Meal card";
  return "Product";
}

function kindClass(kind?: string | null) {
  const label = cleanKind(kind);
  if (label === "Ingredient") return "bg-orange-100 text-orange-900 ring-orange-200";
  if (label === "Recipe") return "bg-violet-100 text-violet-900 ring-violet-200";
  if (label === "Meal card") return "bg-sky-100 text-sky-900 ring-sky-200";
  return "bg-slate-950 text-white ring-slate-950";
}

function imgSrc(product: ProductRow) {
  const cached = product.cached_main_image_url;
  const raw = cached || product.main_image_url;
  if (!raw) return null;
  if (!cached && raw.startsWith("http")) return `/api/image-proxy?url=${encodeURIComponent(raw)}`;
  return raw;
}

function ProductFixForm({ product }: { product: ProductRow }) {
  const input = "rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-950 placeholder:text-slate-400";
  const image = product.cached_main_image_url || product.main_image_url || "";
  return (
    <details className="mt-4 rounded-3xl border border-slate-200 bg-slate-50 p-3">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-black text-slate-800">
        <span className="inline-flex items-center gap-2"><Settings className="h-4 w-4" /> Edit quality, source and nutrients</span>
        <span className="rounded-full bg-white px-3 py-1 text-xs text-slate-500 ring-1 ring-slate-200">Cog/admin</span>
      </summary>
      <form action={saveProductQualityOverride} className="mt-3 grid gap-3 md:grid-cols-2">
        <input type="hidden" name="product_id" value={product.product_id} />
        <input type="hidden" name="cached_main_image_url" value={product.cached_main_image_url || ""} />
        <select name="item_kind" defaultValue={product.item_kind || "product"} className={input}>
          <option value="product">Product</option>
          <option value="ingredient">Ingredient</option>
          <option value="meal_card">Meal card</option>
          <option value="recipe">Recipe / profile-specific</option>
        </select>
        <input name="display_name" defaultValue={product.display_name || ""} placeholder="Product / ingredient name" className={input} />
        <input name="brand_name" defaultValue={product.brand_name || ""} placeholder="Brand / retailer" className={input} />
        <input name="product_type" defaultValue={product.product_type || ""} placeholder="Type/category e.g. drink, cereal, sauce" className={input} />
        <input name="source_provider" defaultValue={product.source_provider || ""} placeholder="Tesco, Aldi, brand site, Open Food Facts..." className={input} />
        <input name="source_url" defaultValue={product.source_url || ""} placeholder="Digested/verified product URL" className={input} />
        <input name="main_image_url" defaultValue={image} placeholder="Image URL to import/cache into product-images" className={input} />
        <input name="calories" type="number" step="0.01" defaultValue={product.calories ?? ""} placeholder="Calories per serving / 100g" className={input} />
        <input name="protein_g" type="number" step="0.01" defaultValue={product.protein_g ?? ""} placeholder="Protein g" className={input} />
        <input name="carbs_g" type="number" step="0.01" defaultValue={product.carbs_g ?? ""} placeholder="Carbs g" className={input} />
        <input name="fat_g" type="number" step="0.01" defaultValue={product.fat_g ?? ""} placeholder="Fat g" className={input} />
        <input name="fibre_g" type="number" step="0.01" defaultValue={product.fibre_g ?? ""} placeholder="Fibre g" className={input} />
        <input name="sugar_g" type="number" step="0.01" defaultValue={product.sugar_g ?? ""} placeholder="Sugar g" className={input} />
        <input name="salt_g" type="number" step="0.01" defaultValue={product.salt_g ?? ""} placeholder="Salt g" className={input} />
        <input name="confidence" type="number" step="1" defaultValue={product.confidence ?? 100} placeholder="Confidence 0-100" className={input} />
        <textarea name="micronutrients" rows={3} defaultValue={product.micronutrients || ""} placeholder="Micronutrients / ingredient detail e.g. calcium, iron, vitamin D, caffeine, sweeteners" className={`${input} md:col-span-2`} />
        <textarea name="admin_note" rows={2} defaultValue={product.admin_note || ""} placeholder="Admin note: checked source, image ownership, product/ingredient caveats" className={`${input} md:col-span-2`} />
        <button className="rounded-2xl bg-slate-950 px-5 py-3 font-black text-white md:col-span-2">Save quality override</button>
      </form>
      <form action={archiveProductQualityItem} className="mt-3">
        <input type="hidden" name="product_id" value={product.product_id} />
        <input type="hidden" name="display_name" value={product.display_name || "Archived product"} />
        <button className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm font-black text-rose-700">Remove from admin product database</button>
      </form>
    </details>
  );
}

export default async function ProductQualityPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("loop_admin_products_list", { p_limit: 5000 });
  let products = (data || []) as ProductRow[];
  const q = String(params.q || "").trim();
  const score = String(params.score || "all");
  const sort = String(params.sort || "score_asc");

  products = products.filter((product) => !product.hidden_by_admin && String(product.status || "") !== "archived");
  products = products.filter((product) => cleanKind(product.item_kind) !== "Recipe");
  products = products.filter((product) => productMatches(product, q));
  if (score === "incomplete") products = products.filter((product) => Number(product.quality_score || 0) < 100);
  if (score === "complete") products = products.filter((product) => Number(product.quality_score || 0) >= 100);
  if (score === "ingredients") products = products.filter((product) => cleanKind(product.item_kind) === "Ingredient");
  if (score === "products") products = products.filter((product) => cleanKind(product.item_kind) === "Product");
  products = [...products].sort((a, b) => {
    if (sort === "alpha") return String(a.display_name || "").localeCompare(String(b.display_name || ""));
    if (sort === "recent") return new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime();
    if (sort === "score_desc") return Number(b.quality_score || 0) - Number(a.quality_score || 0);
    return Number(a.quality_score || 0) - Number(b.quality_score || 0);
  });

  return (
    <main className="mx-auto w-[95vw] max-w-[2000px] space-y-6 p-4">
      
      <AdminTabs />
<section className="rounded-[2rem] bg-slate-950 p-6 text-white">
        <p className="text-xs font-black uppercase tracking-[0.25em] text-emerald-300">Admin products</p>
        <h1 className="mt-2 text-4xl font-black">Product quality tiles</h1>
        <p className="mt-3 max-w-3xl text-sm font-bold text-white/75">Shows products and ingredients returned by the shared product library. Recipe/profile cards are excluded by default. External images are imported into app storage when an admin saves the tile.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <form action={runAdminChecks}><button className="rounded-2xl bg-emerald-400 px-5 py-3 font-black text-slate-950">Refresh product checks</button></form>
          <Link href="/admin/product-imports" className="rounded-2xl bg-white/10 px-5 py-3 font-black text-white ring-1 ring-white/20">Open product imports</Link>
        </div>
      </section>

      {error ? <section className="rounded-[2rem] border border-rose-200 bg-rose-50 p-5 text-sm font-bold text-rose-900">{error.message}</section> : null}

      <form className="grid gap-3 rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_190px_190px_120px]">
        <label className="relative block"><Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input name="q" defaultValue={q} placeholder="Search product, ingredient, brand, source..." className="w-full rounded-2xl border border-slate-200 py-3 pl-11 pr-4 font-bold" /></label>
        <select name="score" defaultValue={score} className="rounded-2xl border border-slate-200 px-4 py-3 font-bold"><option value="all">All scores</option><option value="products">Products only</option><option value="ingredients">Ingredients only</option><option value="incomplete">Needs work</option><option value="complete">100% complete</option></select>
        <select name="sort" defaultValue={sort} className="rounded-2xl border border-slate-200 px-4 py-3 font-bold"><option value="score_asc">Lowest score first</option><option value="score_desc">Highest score first</option><option value="alpha">A-Z</option><option value="recent">Recently updated</option></select>
        <button className="rounded-2xl bg-slate-950 px-5 py-3 font-black text-white">Filter</button>
      </form>

      <p className="text-sm font-black text-slate-500">Showing {products.length} product/ingredient tile{products.length === 1 ? "" : "s"}.</p>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {products.map((product) => {
          const image = imgSrc(product);
          const kind = cleanKind(product.item_kind);
          return (
            <article key={product.product_id} className="relative rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm">
              <span className={`absolute right-4 top-4 rounded-full px-3 py-1 text-xs font-black ring-1 ${kindClass(product.item_kind)}`}>{kind}</span>
              <div className="flex gap-4 pr-24">
                <div className="h-24 w-24 shrink-0 overflow-hidden rounded-3xl bg-slate-100">{image ? <img src={image} alt="" className="h-full w-full object-cover" /> : null}</div>
                <div>
                  <p className="text-xs font-black uppercase text-emerald-700">{product.brand_name || product.source_provider || product.product_type || "Product"}</p>
                  <h2 className="font-black">{product.display_name || "Unnamed product"}</h2>
                  <p className="mt-1 text-sm font-bold text-slate-500">Score {product.quality_score || 0}/100</p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 text-sm font-bold">
                <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-3">Image <Tick ok={product.has_image} /></div>
                <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-3">Nutrition <Tick ok={product.has_nutrition} /></div>
                <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-3">Source <Tick ok={product.has_verified_source} /></div>
                <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-3">Confidence <Tick ok={Number(product.confidence || 0) >= 70} /></div>
                <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-3">Macros <Tick ok={Boolean(product.has_macros)} /></div>
                <div className="flex items-center justify-between rounded-2xl bg-slate-50 p-3">Micros <Tick ok={Boolean(product.has_micros)} /></div>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs font-black text-slate-600">
                <span className="rounded-2xl bg-slate-50 p-2">kcal {product.calories ?? "—"}</span>
                <span className="rounded-2xl bg-slate-50 p-2">protein {product.protein_g ?? "—"}g</span>
                <span className="rounded-2xl bg-slate-50 p-2">fibre {product.fibre_g ?? "—"}g</span>
              </div>
              {product.source_url ? <a href={product.source_url} target="_blank" rel="noreferrer" className="mt-3 block truncate rounded-2xl bg-blue-50 p-3 text-xs font-bold text-blue-900">Digested source retained: {product.source_url}</a> : null}
              {product.source_image_url ? <p className="mt-2 truncate rounded-2xl bg-orange-50 p-3 text-xs font-bold text-orange-900">External image source retained: {product.source_image_url}</p> : null}
              {product.missing_fields?.length ? <p className="mt-3 rounded-2xl bg-amber-50 p-3 text-sm font-bold text-amber-900">Missing: {product.missing_fields.join(", ")}</p> : null}
              <ProductFixForm product={product} />
            </article>
          );
        })}
        {!products.length ? <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white p-8 text-center text-sm font-bold text-slate-500 md:col-span-2 xl:col-span-3">No products matched this filter.</div> : null}
      </section>
    </main>
  );
}
