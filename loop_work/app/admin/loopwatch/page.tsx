import { Nav } from "@/components/Nav";
import { SectionCard } from "@/components/SectionCard";
import { createClient } from "@/lib/supabase/server";
import { requireAdminAccess } from "@/lib/admin/access";
import { upsertLoopWatchProviderRule } from "./actions";

function money(value: unknown) {
  const n = Number(value || 0);
  return Number.isFinite(n) && n > 0 ? `£${n.toFixed(2)}` : "—";
}

export default async function AdminLoopWatchPage() {
  await requireAdminAccess();
  const supabase = await createClient();

  const [{ data: rules }, { data: opportunities }, { data: settings }] = await Promise.all([
    supabase.from("loopwatch_provider_rules").select("*").order("provider_name").order("applies_to_item_type"),
    supabase.from("loopwatch_opportunities").select("opportunity_type,status,priority,title,created_at").order("created_at", { ascending: false }).limit(30),
    supabase.from("wealth_watch_settings").select("setting_key, setting_value, description").like("setting_key", "loopwatch_%").order("setting_key"),
  ]);

  const activeRules = (rules || []).filter((rule: any) => rule.status === "active").length;
  const reviewRules = (rules || []).filter((rule: any) => rule.status === "needs_review").length;

  return (
    <>
      <Nav />
      <main className="mx-auto w-[95vw] max-w-[1600px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <section className="rounded-[2rem] bg-slate-950 p-7 text-white">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-orange-200">Admin</p>
          <h1 className="mt-2 text-4xl font-black">LoopWatch rules and opportunities</h1>
          <p className="mt-2 max-w-3xl text-sm font-bold text-slate-300">
            Manage the rules that let confirmed documents update household costs, forecast mobile/broadband rises and create renewal/deal-watch prompts.
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-white/10 p-4"><p className="text-xs font-black uppercase tracking-wide text-slate-300">Active rules</p><p className="text-2xl font-black">{activeRules}</p></div>
            <div className="rounded-2xl bg-white/10 p-4"><p className="text-xs font-black uppercase tracking-wide text-slate-300">Need review</p><p className="text-2xl font-black">{reviewRules}</p></div>
            <div className="rounded-2xl bg-white/10 p-4"><p className="text-xs font-black uppercase tracking-wide text-slate-300">Open actions</p><p className="text-2xl font-black">{(opportunities || []).filter((o: any) => o.status === "open").length}</p></div>
          </div>
        </section>


        <SectionCard title="Add / update provider increase rule" description="Use this when a mobile or broadband provider discloses a fixed annual rise. Keep status as needs_review until the source has been checked.">
          <form action={upsertLoopWatchProviderRule} className="grid gap-3 md:grid-cols-6">
            <label className="md:col-span-2"><span className="text-xs font-black uppercase tracking-wide text-slate-400">Provider</span><input name="provider_name" placeholder="EE, O2, Vodafone" className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 font-bold" /></label>
            <label><span className="text-xs font-black uppercase tracking-wide text-slate-400">Type</span><select name="applies_to_item_type" className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 font-bold"><option value="mobile_contract">Mobile</option><option value="broadband_contract">Broadband</option></select></label>
            <label><span className="text-xs font-black uppercase tracking-wide text-slate-400">£/month rise</span><input name="increase_amount_monthly" inputMode="decimal" placeholder="3.00" className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 font-bold" /></label>
            <label><span className="text-xs font-black uppercase tracking-wide text-slate-400">Day</span><input name="increase_day" inputMode="numeric" defaultValue="1" className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 font-bold" /></label>
            <label><span className="text-xs font-black uppercase tracking-wide text-slate-400">Month</span><input name="increase_month" inputMode="numeric" defaultValue="4" className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 font-bold" /></label>
            <label><span className="text-xs font-black uppercase tracking-wide text-slate-400">Status</span><select name="status" defaultValue="needs_review" className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 font-bold"><option value="needs_review">Needs review</option><option value="active">Active</option><option value="paused">Paused</option></select></label>
            <label className="md:col-span-2"><span className="text-xs font-black uppercase tracking-wide text-slate-400">Source URL</span><input name="source_url" placeholder="Official provider/source page" className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 font-bold" /></label>
            <label className="md:col-span-3"><span className="text-xs font-black uppercase tracking-wide text-slate-400">Notes</span><input name="notes" placeholder="Which plans this applies to, exclusions, date checked" className="mt-1 w-full rounded-2xl border border-slate-200 px-3 py-2 font-bold" /></label>
            <div className="flex items-end"><button className="w-full rounded-2xl bg-slate-950 px-4 py-3 font-black text-white">Save rule</button></div>
          </form>
        </SectionCard>

        <SectionCard title="Provider annual increase rules" description="Mobile and broadband rules stay admin-controlled. Keep the current disclosed provider increases here before activating them.">
          <div className="overflow-auto rounded-2xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-black uppercase tracking-wide text-slate-500"><tr><th className="px-4 py-3">Provider</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Increase</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Notes</th></tr></thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {(rules || []).map((rule: any) => (
                  <tr key={rule.id}>
                    <td className="px-4 py-3 font-black text-slate-950">{rule.provider_name}</td>
                    <td className="px-4 py-3 font-bold text-slate-600">{String(rule.applies_to_item_type || "").replaceAll("_", " ")}</td>
                    <td className="px-4 py-3 font-bold text-slate-600">{money(rule.increase_amount_monthly)} {rule.increase_percent ? `or ${rule.increase_percent}%` : ""}</td>
                    <td className="px-4 py-3 font-bold text-slate-600">{rule.increase_day}/{rule.increase_month}</td>
                    <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-black ${rule.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{rule.status}</span></td>
                    <td className="px-4 py-3 text-xs font-bold text-slate-500">{rule.notes || rule.rule_label}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <SectionCard title="LoopWatch settings" description="Current rollout switches for document-derived renewal and household-cost logic.">
          <div className="grid gap-3 md:grid-cols-2">
            {(settings || []).map((setting: any) => (
              <div key={setting.setting_key} className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-100">
                <p className="font-black text-slate-950">{setting.setting_key}</p>
                <p className="mt-1 text-sm font-black text-orange-700">{setting.setting_value}</p>
                <p className="mt-1 text-sm font-bold text-slate-500">{setting.description}</p>
              </div>
            ))}
          </div>
        </SectionCard>
      </main>
    </>
  );
}
