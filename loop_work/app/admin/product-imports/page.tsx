import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, BrainCircuit, CheckCircle2, Database, FileSpreadsheet, RefreshCw, UploadCloud } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createBestAdminClient, getAdminAccess } from "@/lib/admin/access";
import { applyImportBatchToLibrary, createProductUrlImportBatch, enrichImportBatch, markProductUrlRowReviewed, reMatchImportBatch, skipImportRow, processReadyProductUrlBatch, stageNextProductUrlBatch, uploadProductImport } from "./actions";

import { AdminTabs } from "@/components/admin/AdminTabs";
const TEMPLATE = `product_name,brand,product_type,category,serving_size,serving_unit,prepared_volume_ml,pack_size,barcode,source_url,image_url,ingredients,allergens,may_contain,calories,protein_g,carbs_g,fat_g,fibre_g,sugar_g,added_sugar_g,saturated_fat_g,salt_g,sodium_mg,caffeine_mg,price,retailer,notes
GFuel Hype Sauce 2.0,G FUEL,drink,energy drink powder,6.2,g,500,40 servings,,https://example.com/product,,"Citric Acid, Pineapple Fruit Powder, Silicon Dioxide, Natural and Artificial Flavors, Acesulfame Potassium, Sucralose",,,5,0,2,0,0,0,0,0,0.2,80,140,34.99,G FUEL,Label verified`;

function inputClass() {
  return "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none ring-orange-500 focus:ring-2";
}

function statusClass(status: string) {
  if (["created", "updated", "ai_enriched", "matched_existing", "applied"].includes(status)) return "bg-emerald-100 text-emerald-800";
  if (["needs_review", "ready_to_create", "staged", "uploaded"].includes(status)) return "bg-amber-100 text-amber-800";
  if (["failed"].includes(status)) return "bg-rose-100 text-rose-700";
  return "bg-slate-100 text-slate-700";
}

async function safeSelect<T = any>(promise: PromiseLike<{ data: T | null; error?: any }>, fallback: T): Promise<T> {
  try {
    const result = await promise;
    return result.error ? fallback : (result.data || fallback);
  } catch {
    return fallback;
  }
}

function numeric(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

export default async function ProductImportsPage({ searchParams }: { searchParams?: Promise<{ batch?: string; linkBatch?: string }> }) {
  const access = await getAdminAccess();
  if (!access.user) redirect(`/login?next=${encodeURIComponent("/admin/product-imports")}`);
  if (!access.isAdmin) redirect("/dashboard");

  const params = await searchParams;
  const selectedBatchId = String(params?.batch || "");
  const selectedLinkBatchId = String(params?.linkBatch || "");
  const supabase = createBestAdminClient() || await createClient();

  const [batches, selectedBatch, selectedRows, health, linkBatches, selectedLinkRows] = await Promise.all([
    safeSelect<any[]>(supabase.from("loop_product_import_batches").select("*").order("created_at", { ascending: false }).limit(20), []),
    selectedBatchId ? safeSelect<any>(supabase.from("loop_product_import_batches").select("*").eq("id", selectedBatchId).maybeSingle(), null) : Promise.resolve(null),
    selectedBatchId ? safeSelect<any[]>(supabase.from("loop_product_import_rows").select("*").eq("batch_id", selectedBatchId).order("row_number", { ascending: true }).limit(250), []) : Promise.resolve([]),
    safeSelect<any[]>(supabase.rpc("loop_v2769_product_import_healthcheck"), []),
    safeSelect<any[]>(supabase.from("loop_product_link_import_batches").select("*").order("created_at", { ascending: false }).limit(10), []),
    selectedLinkBatchId ? safeSelect<any[]>(supabase.from("loop_product_link_import_rows").select("*").eq("batch_id", selectedLinkBatchId).order("row_number", { ascending: true }).limit(250), []) : Promise.resolve([]),
  ]);

  const rows = selectedRows || [];
  const readyCount = rows.filter((row) => ["ai_enriched", "ready_to_create", "matched_existing"].includes(row.status)).length;
  const reviewCount = rows.filter((row) => row.status === "needs_review").length;
  const failedCount = rows.filter((row) => row.status === "failed").length;

  return (
    <main className="mx-auto w-[95vw] max-w-none space-y-8 px-4 py-8 md:px-6">
      
      <AdminTabs />
<section className="relative overflow-hidden rounded-[2.5rem] bg-slate-950 p-7 text-white shadow-[0_30px_120px_-70px_rgba(15,23,42,.9)]">
        <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-emerald-500/25 blur-3xl" />
        <div className="relative flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <Link href="/admin" className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-wide text-white/80">
              <ArrowLeft className="h-4 w-4" /> Admin
            </Link>
            <p className="text-xs font-black uppercase tracking-[0.35em] text-emerald-300">Product library import</p>
            <h1 className="mt-3 text-4xl font-black tracking-tight md:text-5xl">CSV import + AI enrichment queue</h1>
            <p className="mt-3 max-w-4xl text-sm font-medium leading-6 text-white/72">
              Import products into a safe staging area first. Match duplicates, enrich missing values, then apply only missing/unverified data to the shared product library.
            </p>
          </div>
          <div className="grid gap-2 rounded-3xl border border-white/15 bg-white/10 p-5 text-sm font-bold text-white/75 md:min-w-72">
            <p>Signed in as <span className="text-white">{access.user.email}</span></p>
            <p>Health checks <span className="text-white">{health.filter((row) => row.ok).length}/{health.length || 0}</span></p>
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-[2rem] border border-blue-100 bg-blue-50 p-6 shadow-xl">
          <h2 className="text-2xl font-black text-blue-950">URL product import batches</h2>
          <p className="mt-1 text-sm font-bold text-blue-800">Paste product/category URLs. LOOP stages discovered links and only promotes 10 at a time for review, so imports stay controlled and confidence-led.</p>
          <form action={createProductUrlImportBatch} className="mt-5 space-y-4">
            <label className="block text-sm font-black text-slate-700">Import name
              <input name="import_name" className={inputClass()} placeholder="Tesco meal deal drinks, Aldi snacks, supplier catalogue..." />
            </label>
            <label className="block text-sm font-black text-slate-700">URLs / category links
              <textarea name="source_urls" className={`${inputClass()} min-h-40`} placeholder="Paste one or many URLs. For now, LOOP stages provided links and prepares batches of 10. Site crawling stays approval-based to avoid runaway work." required />
            </label>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm font-black text-slate-700">Discovery mode
                <select name="discovery_mode" className={inputClass()}><option value="provided_urls_only">Provided URLs only</option><option value="category_discovery_review">Category discovery · review first</option></select>
              </label>
              <label className="block text-sm font-black text-slate-700">Batch size
                <input name="batch_size" type="number" min="1" max="10" defaultValue="10" className={inputClass()} />
              </label>
            </div>
            <label className="block text-sm font-black text-slate-700">Notes
              <textarea name="notes" className={`${inputClass()} min-h-20`} placeholder="Only food/drink, labels verified, catalogue source, etc." />
            </label>
            <button className="rounded-2xl bg-slate-950 px-5 py-3 font-black text-white shadow-lg">Stage URL batch</button>
          </form>
        </div>
        <div className="rounded-[2rem] border border-slate-200 bg-white/90 p-6 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="text-2xl font-black">Recent URL batches</h2><p className="text-sm font-bold text-slate-500">Open a batch, then Process next 10 to fetch metadata and create a reviewable product import batch.</p></div>
            {selectedLinkBatchId ? <div className="flex flex-wrap gap-2">
              <form action={processReadyProductUrlBatch}><input type="hidden" name="batch_id" value={selectedLinkBatchId} /><input type="hidden" name="batch_size" value="10" /><button className="rounded-full bg-emerald-100 px-4 py-2 text-sm font-black text-emerald-800">Process next 10</button></form>
              <form action={stageNextProductUrlBatch}><input type="hidden" name="batch_id" value={selectedLinkBatchId} /><input type="hidden" name="batch_size" value="10" /><button className="rounded-full bg-slate-100 px-4 py-2 text-sm font-black text-slate-700">Promote only</button></form>
            </div> : null}
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {(linkBatches || []).map((batch) => <Link key={batch.id} href={`/admin/product-imports?linkBatch=${batch.id}`} className={`rounded-3xl border p-4 ${batch.id === selectedLinkBatchId ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-slate-50"}`}><p className="text-xs font-black uppercase text-blue-700">{batch.status} · {batch.discovered_count || 0} links</p><h3 className="mt-1 font-black text-slate-950">{batch.import_name}</h3><p className="text-xs font-bold text-slate-500">Batch size {batch.batch_size || 10}</p></Link>)}
            {(linkBatches || []).length === 0 ? <p className="rounded-3xl border border-dashed border-slate-300 p-5 text-sm font-bold text-slate-500">No URL batches yet.</p> : null}
          </div>
          {selectedLinkRows?.length ? <div className="mt-5 max-h-96 overflow-auto rounded-3xl border border-slate-200"><table className="w-full min-w-[820px] text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr><th className="p-3">#</th><th className="p-3">URL</th><th className="p-3">Host</th><th className="p-3">Detected product</th><th className="p-3">Status</th><th className="p-3">Action</th></tr></thead><tbody>{selectedLinkRows.map((row: any) => <tr key={row.id} className="border-t border-slate-100"><td className="p-3 font-black">{row.row_number}</td><td className="p-3 font-mono"><a href={row.source_url} target="_blank" rel="noreferrer" className="text-blue-700">{row.source_url}</a></td><td className="p-3">{row.source_host}</td><td className="p-3 font-bold text-slate-700">{row.staged_product_name || "—"}<p className="text-[10px] text-slate-400">Confidence {row.confidence || 0}%</p></td><td className="p-3"><span className={`rounded-full px-2 py-1 font-black ${statusClass(row.status)}`}>{row.status}</span></td><td className="p-3"><form action={markProductUrlRowReviewed}><input type="hidden" name="row_id" value={row.id} /><input type="hidden" name="status" value="reviewed" /><button className="rounded-full bg-slate-950 px-3 py-1 font-black text-white">Reviewed</button></form></td></tr>)}</tbody></table></div> : null}
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-[2rem] border border-slate-200 bg-white/90 p-6 shadow-xl">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-100 text-emerald-700"><UploadCloud className="h-5 w-5" /></span>
            <div>
              <h2 className="text-2xl font-black">Upload product spreadsheet</h2>
              <p className="text-sm font-bold text-slate-500">Save Excel as CSV, then upload here. Rows stay staged until you apply them.</p>
            </div>
          </div>
          <form action={uploadProductImport} className="mt-5 space-y-4">
            <label className="block text-sm font-black text-slate-700">Import name
              <input name="import_name" placeholder="Lidl drinks batch, Tesco snacks, manual fixes..." className={inputClass()} />
            </label>
            <label className="block text-sm font-black text-slate-700">CSV / ZIP file
              <input name="file" type="file" accept=".csv,.zip,text/csv,application/zip" required className={inputClass()} />
            </label>
            <label className="block text-sm font-black text-slate-700">Notes
              <textarea name="notes" placeholder="Where this came from, whether prices are live, whether labels were verified..." className={`${inputClass()} min-h-24`} />
            </label>
            <button className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 font-black text-white shadow-lg">
              <FileSpreadsheet className="h-4 w-4" /> Upload and stage rows
            </button>
          </form>
        </div>

        <div className="rounded-[2rem] border border-slate-200 bg-white/90 p-6 shadow-xl">
          <h2 className="text-2xl font-black">CSV template</h2>
          <p className="mt-1 text-sm font-bold text-slate-500">Minimum useful fields: product_name, brand, product_type, serving, source_url, ingredients and key nutrition values.</p>
          <textarea readOnly value={TEMPLATE} className="mt-4 h-64 w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 font-mono text-xs" />
          <p className="mt-3 rounded-2xl bg-emerald-50 p-3 text-sm font-bold text-emerald-900">
            Products and ingredients are shared database items. Recipes and takeaway/menu estimates should stay private to household/user flows, not this global import.
          </p>
        </div>
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white/90 p-6 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black">Recent import batches</h2>
            <p className="text-sm font-bold text-slate-500">Open a batch to enrich, review and apply rows.</p>
          </div>
          {selectedBatch ? (
            <div className="flex flex-wrap gap-2">
              <form action={reMatchImportBatch}><input type="hidden" name="batch_id" value={selectedBatch.id} /><button className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-sm font-black"><RefreshCw className="h-4 w-4" /> Re-match</button></form>
              <form action={enrichImportBatch}><input type="hidden" name="batch_id" value={selectedBatch.id} /><input type="hidden" name="limit" value="25" /><button className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-4 py-2 text-sm font-black text-emerald-800"><BrainCircuit className="h-4 w-4" /> Enrich next 25</button></form>
              <form action={applyImportBatchToLibrary}><input type="hidden" name="batch_id" value={selectedBatch.id} /><input type="hidden" name="mode" value="missing_only" /><button className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-4 py-2 text-sm font-black text-white"><Database className="h-4 w-4" /> Apply missing only</button></form>
              <form action={applyImportBatchToLibrary}><input type="hidden" name="batch_id" value={selectedBatch.id} /><input type="hidden" name="mode" value="replace_unverified" /><button className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-4 py-2 text-sm font-black text-amber-900">Replace unverified</button></form>
            </div>
          ) : null}
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          {batches.map((batch) => (
            <Link key={batch.id} href={`/admin/product-imports?batch=${batch.id}`} className={`rounded-3xl border p-5 shadow-sm ${batch.id === selectedBatchId ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white"}`}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-slate-400">{batch.file_name || "CSV"}</p>
                  <h3 className="mt-1 text-lg font-black">{batch.import_name || "Product import"}</h3>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-black ${statusClass(batch.status)}`}>{batch.status}</span>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-xs font-black text-slate-600">
                <span className="rounded-xl bg-slate-50 p-2">Rows {batch.total_rows}</span>
                <span className="rounded-xl bg-slate-50 p-2">Matched {batch.matched_count}</span>
                <span className="rounded-xl bg-slate-50 p-2">Review {batch.needs_review_count}</span>
              </div>
            </Link>
          ))}
          {!batches.length ? <p className="rounded-3xl border border-dashed border-slate-200 p-6 text-sm font-bold text-slate-500">No imports yet.</p> : null}
        </div>
      </section>

      {selectedBatch ? (
        <section className="rounded-[2rem] border border-slate-200 bg-white/90 p-6 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-600">Selected batch</p>
              <h2 className="text-2xl font-black">{selectedBatch.import_name}</h2>
              <p className="text-sm font-bold text-slate-500">{readyCount} ready/applicable · {reviewCount} needs review · {failedCount} failed</p>
            </div>
            <div className="grid grid-cols-4 gap-2 text-center text-xs font-black md:min-w-[420px]">
              <div className="rounded-2xl bg-slate-50 p-3"><p className="text-slate-400">Rows</p><p className="text-xl text-slate-950">{rows.length}</p></div>
              <div className="rounded-2xl bg-emerald-50 p-3"><p className="text-emerald-700">Ready</p><p className="text-xl text-slate-950">{readyCount}</p></div>
              <div className="rounded-2xl bg-amber-50 p-3"><p className="text-amber-700">Review</p><p className="text-xl text-slate-950">{reviewCount}</p></div>
              <div className="rounded-2xl bg-rose-50 p-3"><p className="text-rose-700">Failed</p><p className="text-xl text-slate-950">{failedCount}</p></div>
            </div>
          </div>

          <div className="mt-5 overflow-x-auto rounded-3xl border border-slate-200">
            <table className="min-w-[1300px] w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="p-3">Row</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Product</th>
                  <th className="p-3">Brand</th>
                  <th className="p-3">Type</th>
                  <th className="p-3">Serving</th>
                  <th className="p-3">Kcal</th>
                  <th className="p-3">Protein</th>
                  <th className="p-3">Source / match</th>
                  <th className="p-3">Warnings</th>
                  <th className="p-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {rows.map((row) => {
                  const enriched = row.enriched || {};
                  const norm = row.normalised || {};
                  const display = Object.keys(enriched).length ? enriched : norm;
                  return (
                    <tr key={row.id} className="align-top">
                      <td className="p-3 font-black">{row.row_number}</td>
                      <td className="p-3"><span className={`rounded-full px-3 py-1 text-xs font-black ${statusClass(row.status)}`}>{row.status}</span></td>
                      <td className="p-3">
                        <p className="font-black text-slate-950">{display.product_name || row.product_name}</p>
                        <p className="text-xs font-bold text-slate-500">{display.category || row.category || "—"}</p>
                      </td>
                      <td className="p-3 font-bold">{display.brand || row.brand || "—"}</td>
                      <td className="p-3 font-bold">{display.product_type || row.product_type || "—"}</td>
                      <td className="p-3 font-bold">{display.prepared_volume_ml ? `${display.prepared_volume_ml}ml` : display.serving_size ? `${display.serving_size}${display.serving_unit || ""}` : "—"}</td>
                      <td className="p-3 font-bold">{numeric(display.calories)}</td>
                      <td className="p-3 font-bold">{numeric(display.protein_g)}</td>
                      <td className="p-3 text-xs font-bold text-slate-500">
                        {row.existing_card_id ? <p className="text-emerald-700"><CheckCircle2 className="mr-1 inline h-3 w-3" />Matched {row.match_confidence}%</p> : <p>No existing match</p>}
                        {display.source_url ? <a href={display.source_url} target="_blank" rel="noreferrer" className="mt-1 block max-w-64 truncate text-blue-700 underline">{display.source_url}</a> : null}
                      </td>
                      <td className="max-w-md p-3 text-xs font-bold text-amber-800">
                        {(row.warnings || display.warnings || []).slice(0, 3).map((warning: string) => <p key={warning}>• {warning}</p>)}
                        {row.error_message ? <p className="text-rose-700">{row.error_message}</p> : null}
                      </td>
                      <td className="p-3">
                        <form action={skipImportRow}>
                          <input type="hidden" name="row_id" value={row.id} />
                          <input type="hidden" name="batch_id" value={selectedBatch.id} />
                          <button className="rounded-full bg-slate-100 px-3 py-2 text-xs font-black">Skip</button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </main>
  );
}
