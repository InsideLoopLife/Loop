import { createClient } from "@/lib/supabase/server";
import { PRODUCT_IMPORT_BRIEF } from "@/lib/admin/productImportBrief";
import { createProductImportJob } from "./actions";

import { AdminTabs } from "@/components/admin/AdminTabs";
export default async function AdminProductImportPage() {
  const supabase = await createClient();
  const { data: jobs } = await supabase
    .from("loop_product_import_scan_jobs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(20);

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4">
      
      <AdminTabs />
<section className="rounded-[2rem] bg-slate-950 p-6 text-white">
        <p className="text-xs font-black uppercase tracking-[0.25em] text-emerald-300">Admin products</p>
        <h1 className="mt-2 text-4xl font-black">Import products</h1>
        <p className="mt-3 max-w-3xl text-sm font-bold text-white/75">
          Import from CSV/ZIP, single product URLs, category pages, barcode batches or future official feeds. Everything stages for review before becoming live.
        </p>
      </section>

      <section className="rounded-[2rem] border border-emerald-100 bg-emerald-50 p-5">
        <h2 className="text-2xl font-black">Import principle</h2>
        <p className="mt-2 text-sm font-bold text-emerald-950">{PRODUCT_IMPORT_BRIEF.principle}</p>
      </section>

      <form action={createProductImportJob} className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-2xl font-black">Create source scan/import job</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <input name="retailer_key" placeholder="tesco, aldi, lidl" defaultValue="tesco" className="rounded-2xl border border-slate-200 px-4 py-3 font-bold" />
          <select name="source_kind" className="rounded-2xl border border-slate-200 px-4 py-3 font-bold">
            <option value="category_url">Category URL</option>
            <option value="product_url">Product URL</option>
            <option value="csv_zip">CSV / ZIP</option>
            <option value="feed_api">Feed / API</option>
            <option value="barcode_batch">Barcode batch</option>
          </select>
          <select name="import_scope" defaultValue="food_drink" className="rounded-2xl border border-slate-200 px-4 py-3 font-bold">
            <option value="food_drink">Food & drink only</option>
            <option value="alcohol">Alcohol</option>
            <option value="meal_deals">Meal deals</option>
            <option value="all_retail_food">All retail food</option>
          </select>
          <input name="max_pages" placeholder="Max pages" defaultValue="50" inputMode="numeric" className="rounded-2xl border border-slate-200 px-4 py-3 font-bold" />
          <input name="source_url" placeholder="https://www.tesco.com/..." className="rounded-2xl border border-slate-200 px-4 py-3 font-bold md:col-span-4" />
        </div>
        <input type="hidden" name="scan_mode" value="discover_and_review" />
        <button className="mt-4 rounded-2xl bg-slate-950 px-5 py-3 font-black text-white">Queue import job</button>
      </form>

      <section className="grid gap-4 lg:grid-cols-2">
        {PRODUCT_IMPORT_BRIEF.importModes.map((mode) => (
          <article key={mode.key} className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-700">{mode.key}</p>
            <h3 className="mt-1 text-xl font-black">{mode.label}</h3>
            <p className="mt-1 text-sm font-bold text-slate-500">{mode.use}</p>
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm font-bold text-slate-700">
              {mode.steps.map((step) => <li key={step}>{step}</li>)}
            </ol>
          </article>
        ))}
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-2xl font-black">Tesco meal-deal example</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm font-bold text-slate-700">
          {PRODUCT_IMPORT_BRIEF.tescoMealDealExample.map((step) => <li key={step}>{step}</li>)}
        </ol>
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-2xl font-black">Fields LOOP should try to collect</h2>
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          {PRODUCT_IMPORT_BRIEF.productFields.map((field) => (
            <div key={field} className="rounded-2xl bg-slate-50 p-3 text-sm font-black">{field}</div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-black">Recent jobs</h2>
        {(jobs || []).map((job:any) => (
          <article key={job.id} className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-700">{job.retailer_key} · {job.source_kind}</p>
                <h3 className="font-black break-all">{job.source_url}</h3>
                <p className="mt-1 text-sm font-bold text-slate-500">Found {job.products_found} · Ready {job.products_ready} · Review {job.products_needing_review}</p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black">{job.status}</span>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
