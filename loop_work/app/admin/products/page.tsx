import { createClient } from "@/lib/supabase/server";

import { AdminTabs } from "@/components/admin/AdminTabs";
function cleanProductType(value?: string | null) {
  const raw = String(value || "product").toLowerCase();
  if (raw.includes("ingredient")) return "Ingredient";
  if (raw.includes("meal")) return "Meal";
  if (raw.includes("drink")) return "Drink";
  if (raw.includes("recipe")) return "Recipe";
  return "Product";
}

function typePillClass(value?: string | null) {
  const raw = String(value || "").toLowerCase();
  if (raw.includes("ingredient")) return "bg-orange-100 text-orange-950 ring-orange-200";
  if (raw.includes("drink")) return "bg-sky-100 text-sky-950 ring-sky-200";
  if (raw.includes("meal") || raw.includes("recipe")) return "bg-emerald-100 text-emerald-950 ring-emerald-200";
  return "bg-slate-100 text-slate-800 ring-slate-200";
}

export default async function AdminProductsPage({ searchParams }: { searchParams?: Promise<{ q?: string; sort?: string }> }) {
  const params = await searchParams;
  const q = params?.q || "";
  const sort = params?.sort || "added_desc";
  const supabase = await createClient();

  const { data: products, error } = await supabase.rpc("loop_admin_product_library", {
    p_search: q,
    p_sort: sort,
    p_limit: 200,
    p_offset: 0,
  });

  return (
    <main className="mx-auto w-[95vw] max-w-[2000px] space-y-6 p-4">
      
      <AdminTabs />
<section className="rounded-[2rem] bg-slate-950 p-6 text-white">
        <p className="text-xs font-black uppercase tracking-[0.25em] text-emerald-300">Admin products</p>
        <h1 className="mt-2 text-4xl font-black">Product library</h1>
        <p className="mt-3 max-w-3xl text-sm font-bold text-white/75">
          Search, sort and review products. Import tools sit here so product work is in one admin area.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <a href="/admin/products/import" className="rounded-2xl bg-emerald-400 px-5 py-3 font-black text-slate-950">Open import tool</a>
          <a href="/admin/products/quality" className="rounded-2xl bg-white/10 px-5 py-3 font-black text-white">Quality tiles</a>
        </div>
      </section>

      <form className="grid gap-3 rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm md:grid-cols-[1fr_220px_auto]">
        <input name="q" defaultValue={q} placeholder="Search products, brands, source URLs..." className="rounded-2xl border border-slate-200 px-4 py-3 font-bold" />
        <select name="sort" defaultValue={sort} className="rounded-2xl border border-slate-200 px-4 py-3 font-bold">
          <option value="added_desc">Newest first</option>
          <option value="added_asc">Oldest first</option>
          <option value="alpha">A-Z</option>
          <option value="alpha_desc">Z-A</option>
          <option value="confidence_low">Lowest confidence</option>
          <option value="confidence_high">Highest confidence</option>
        </select>
        <button className="rounded-2xl bg-slate-950 px-5 py-3 font-black text-white">Apply</button>
      </form>

      {error ? <div className="rounded-3xl bg-rose-50 p-4 font-bold text-rose-900">{error.message}</div> : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(products || []).map((product:any) => (
          <article key={product.product_id} className="relative rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm">
            <span className={`absolute right-4 top-4 rounded-full px-3 py-1 text-xs font-black ring-1 ${typePillClass(product.card_kind)}`}>{cleanProductType(product.card_kind)}</span>
            <div className="flex gap-4 pr-28">
              <div className="h-24 w-24 shrink-0 overflow-hidden rounded-3xl bg-slate-100">
                {product.main_image_url ? <img src={product.main_image_url} alt="" className="h-full w-full object-cover" /> : null}
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-700">{product.brand_name || "Product"}</p>
                <h2 className="font-black">{product.display_name || "Unnamed product"}</h2>
                <p className="mt-1 text-sm font-bold text-slate-500">Confidence {product.confidence ?? "—"} · {product.status || "active"}</p>
              </div>
            </div>
            {product.missing_fields?.length ? (
              <p className="mt-3 rounded-2xl bg-amber-50 p-3 text-sm font-bold text-amber-900">Missing: {product.missing_fields.join(", ")}</p>
            ) : null}
            <code className="mt-3 block break-all rounded-2xl bg-slate-50 p-3 text-xs">{product.product_id}</code>
          </article>
        ))}
      </section>
    </main>
  );
}
