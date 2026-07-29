import { createClient } from "@/lib/supabase/server";
import { penceToPounds } from "@/lib/property/estimate";

export default async function PropertyEstimatePage() {
  const supabase = await createClient();
  const { data: runs } = await supabase.from("loop_property_estimate_runs").select("*").order("created_at", { ascending: false }).limit(8);

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4">
      <section className="rounded-[2rem] bg-slate-950 p-6 text-white">
        <p className="text-xs font-black uppercase tracking-[0.25em] text-emerald-300">Home affordability</p>
        <h1 className="mt-2 text-4xl font-black">Property bill estimator</h1>
        <p className="mt-3 max-w-3xl text-sm font-bold text-white/75">Estimate likely council tax and supporting bill signals before committing to a bigger home.</p>
      </section>

      <section className="rounded-[2rem] border border-amber-100 bg-amber-50 p-5">
        <h2 className="text-xl font-black">Estimate-first beta mode</h2>
        <p className="mt-2 text-sm font-bold text-amber-950">This is an affordability indicator, not an official band check. Exact EPC, council-tax and schools verification can be connected later.</p>
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-2xl font-black">API example</h2>
        <pre className="mt-4 overflow-auto rounded-3xl bg-slate-950 p-4 text-sm text-white">{`POST /api/property/estimate
{
  "postcode": "WA1 1AA",
  "address_line1": "Example Road",
  "estimated_value": "350000",
  "bedrooms": 4,
  "property_type": "Detached"
}`}</pre>
      </section>

      <section className="space-y-3">
        <h2 className="text-2xl font-black">Recent estimates</h2>
        {(runs || []).map((run) => {
          const r = run.result || {};
          const band = r.estimated_council_tax_band_low !== r.estimated_council_tax_band_high ? `${r.estimated_council_tax_band_low}-${r.estimated_council_tax_band_high}` : r.estimated_council_tax_band;
          return (
            <article key={run.id} className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-700">{run.postcode}</p>
                  <h3 className="mt-1 text-2xl font-black">Estimated band {band || "—"}</h3>
                  <p className="mt-1 text-sm font-bold text-slate-500">{r.council_tax_estimate_reason}</p>
                </div>
                <div className="rounded-2xl bg-emerald-50 p-4 text-right">
                  <p className="text-xs font-black uppercase text-emerald-700">Annual estimate</p>
                  <p className="text-2xl font-black">{penceToPounds(r.estimated_council_tax_annual_mid_pence)}</p>
                </div>
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}
