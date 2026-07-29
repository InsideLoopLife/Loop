import { createClient } from "@/lib/supabase/server";
import { saveCouncilTaxRate, updatePropertySourceStatus } from "./actions";

export default async function PropertySourcesPage() {
  const supabase = await createClient();
  const [{ data: sources }, { data: rates }] = await Promise.all([
    supabase.from("loop_property_data_sources").select("*").order("sort_order", { ascending: true }),
    supabase.from("loop_council_tax_rate_estimates").select("*").not("local_authority_code", "is", null).order("updated_at", { ascending: false }).limit(20),
  ]);

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4">
      <section className="rounded-[2rem] bg-slate-950 p-6 text-white">
        <p className="text-xs font-black uppercase tracking-[0.25em] text-emerald-300">Admin property</p>
        <h1 className="mt-2 text-4xl font-black">Property sources and API accounts</h1>
        <p className="mt-3 max-w-3xl text-sm font-bold text-white/75">Track which APIs/accounts are needed. Beta runs estimate-first now; exact verification comes source by source.</p>
      </section>

      <section className="rounded-[2rem] border border-emerald-100 bg-emerald-50 p-5">
        <h2 className="text-2xl font-black">Priority order</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm font-bold text-emerald-950">
          <li>Postcodes.io for postcode/local authority.</li>
          <li>HM Land Registry Price Paid Data for comparables.</li>
          <li>Manual council-tax charge override where you know the council/band.</li>
          <li>EPC, Maps, schools and insurance sources can follow.</li>
        </ol>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {(sources || []).map((source) => (
          <article key={source.source_key} className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-700">{source.source_area}</p>
                <h2 className="mt-1 text-xl font-black">{source.source_name}</h2>
                <p className="mt-1 text-sm font-bold text-slate-500">{source.use_in_beta}</p>
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black">{source.status}</span>
            </div>
            <p className="mt-4 rounded-2xl bg-slate-50 p-3 text-sm font-bold text-slate-700">{source.setup_notes}</p>
            {source.limitations ? <p className="mt-3 rounded-2xl bg-amber-50 p-3 text-sm font-bold text-amber-900">{source.limitations}</p> : null}
            {source.env_keys?.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {source.env_keys.map((key: string) => <code key={key} className="rounded-full bg-slate-950 px-3 py-1 text-xs font-black text-white">{key}</code>)}
              </div>
            ) : null}
            <form action={updatePropertySourceStatus} className="mt-4 flex gap-2">
              <input type="hidden" name="source_key" value={source.source_key} />
              <select name="status" defaultValue={source.status} className="rounded-2xl border border-slate-200 px-3 py-2 text-sm font-black">
                <option value="not_started">Not started</option><option value="planned">Planned</option><option value="configured">Configured</option><option value="blocked">Blocked</option><option value="not_needed_yet">Not needed yet</option>
              </select>
              <button className="rounded-2xl bg-slate-950 px-4 py-2 text-sm font-black text-white">Save</button>
            </form>
          </article>
        ))}
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-2xl font-black">Add local council-tax charge override</h2>
        <form action={saveCouncilTaxRate} className="mt-4 grid gap-3 md:grid-cols-4">
          <input name="local_authority_code" placeholder="LA code" className="rounded-2xl border border-slate-200 px-4 py-3 font-bold" />
          <input name="local_authority_name" placeholder="Council name" className="rounded-2xl border border-slate-200 px-4 py-3 font-bold" />
          <select name="country_code" className="rounded-2xl border border-slate-200 px-4 py-3 font-bold"><option value="ENG">England</option><option value="WLS">Wales</option><option value="SCT">Scotland</option></select>
          <select name="band" className="rounded-2xl border border-slate-200 px-4 py-3 font-bold">{"ABCDEFGHI".split("").map((band) => <option key={band} value={band}>Band {band}</option>)}</select>
          <input name="annual_charge" placeholder="Annual charge £" inputMode="decimal" className="rounded-2xl border border-slate-200 px-4 py-3 font-bold" />
          <input name="charge_year" placeholder="2026/27" defaultValue="2026/27" className="rounded-2xl border border-slate-200 px-4 py-3 font-bold" />
          <input name="source_url" placeholder="Council charge table URL" className="rounded-2xl border border-slate-200 px-4 py-3 font-bold md:col-span-2" />
          <button className="rounded-2xl bg-slate-950 px-5 py-3 font-black text-white md:col-span-4">Save rate</button>
        </form>
        <div className="mt-5 space-y-2">
          {(rates || []).map((rate) => <div key={rate.id} className="rounded-2xl bg-slate-50 p-3 text-sm font-bold">{rate.local_authority_name} · Band {rate.band} · £{(rate.annual_charge_pence / 100).toFixed(2)} · {rate.charge_year}</div>)}
        </div>
      </section>
    </main>
  );
}
