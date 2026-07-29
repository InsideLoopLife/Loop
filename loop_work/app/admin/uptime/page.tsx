import { createClient } from "@/lib/supabase/server";
import { addUptimeTarget } from "./actions";
import { AdminTabs } from "@/components/admin/AdminTabs";

export default async function UptimePage() {
  const supabase = await createClient();
  const { data: targets } = await supabase.from("loop_uptime_targets").select("*").order("created_at", { ascending: false });

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4">
      <section className="rounded-[2rem] bg-slate-950 p-6 text-white">
        <p className="text-xs font-black uppercase tracking-[0.25em] text-emerald-300">Admin uptime</p>
        <h1 className="mt-2 text-4xl font-black">Uptime checker</h1>
        <p className="mt-3 max-w-3xl text-sm font-bold text-white/75">
          Track key pages, API routes and external checks. Failures create admin alerts.
        </p>
      </section>

      <AdminTabs />

      <form action={addUptimeTarget} className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-2xl font-black">Add target</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-5">
          <input name="target_name" placeholder="Nutrition page" required className="rounded-2xl border border-slate-200 px-4 py-3 font-bold" />
          <input name="target_url" placeholder="https://..." required className="rounded-2xl border border-slate-200 px-4 py-3 font-bold md:col-span-2" />
          <select name="area" className="rounded-2xl border border-slate-200 px-4 py-3 font-bold">
            <option value="system_continuity">System</option>
            <option value="products">Products</option>
            <option value="deals">Deals</option>
            <option value="investment_manual">Investments</option>
            <option value="assets">Assets</option>
          </select>
          <input name="check_frequency_minutes" placeholder="15" defaultValue="15" inputMode="numeric" className="rounded-2xl border border-slate-200 px-4 py-3 font-bold" />
        </div>
        <button className="mt-3 rounded-2xl bg-slate-950 px-5 py-3 font-black text-white">Add uptime target</button>
      </form>

      <section className="space-y-3">
        {(targets || []).map((target) => (
          <article key={target.id} className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-700">{target.area}</p>
                <h2 className="text-xl font-black">{target.target_name}</h2>
                <p className="text-sm font-bold text-slate-500">{target.target_url}</p>
              </div>
              <div className="text-right">
                <p className="font-black">{target.last_status || "not checked"}</p>
                <p className="text-sm text-slate-500">{target.last_latency_ms ? `${target.last_latency_ms}ms` : ""}</p>
              </div>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
