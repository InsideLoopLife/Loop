import { createClient } from "@/lib/supabase/server";
import { penceToPounds } from "@/lib/money/dealMath";
import { queueDealRefresh, saveSavingsDeal } from "./actions";

export default async function AdminMoneyDealsPage() {
  const supabase = await createClient();
  const { data: deals } = await supabase
    .from("loop_money_savings_deals")
    .select("*")
    .order("rate_aer", { ascending: false });

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4">
      <section className="rounded-[2rem] bg-slate-950 p-6 text-white">
        <p className="text-xs font-black uppercase tracking-[0.25em] text-emerald-300">Admin</p>
        <h1 className="mt-2 text-4xl font-black">Savings deal library</h1>
        <p className="mt-3 max-w-3xl text-sm font-bold text-white/75">
          Add savings deals manually for beta. Later this can be fed by official APIs, affiliate/comparison feeds or commercial money data providers.
        </p>
      </section>

      <section className="rounded-[2rem] border border-amber-100 bg-amber-50 p-5">
        <h2 className="text-xl font-black">Admin workflow</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm font-bold text-amber-950">
          <li>Add deal facts: provider, rate, monthly cap, term and conditions.</li>
          <li>Use source URL for evidence; cron can politely check changes but must not bypass bot protection.</li>
          <li>Keep low-confidence or unclear deals in needs_review.</li>
          <li>Users see estimated benefit and conditions, not “you must do this” advice.</li>
        </ol>
      </section>

      <form action={saveSavingsDeal} className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-2xl font-black">Add / update deal</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <input name="provider_name" placeholder="Provider, e.g. Santander" className="rounded-2xl border border-slate-200 px-4 py-3 font-bold" />
          <input name="product_name" placeholder="Product name" className="rounded-2xl border border-slate-200 px-4 py-3 font-bold" />
          <select name="product_type" className="rounded-2xl border border-slate-200 px-4 py-3 font-bold">
            <option value="regular_saver">Regular saver</option>
            <option value="easy_access">Easy access</option>
            <option value="fixed_saver">Fixed saver</option>
            <option value="cash_isa">Cash ISA</option>
            <option value="notice_account">Notice account</option>
            <option value="current_account_linked">Current account linked</option>
            <option value="other">Other</option>
          </select>
          <input name="rate_aer" placeholder="AER %, e.g. 8" inputMode="decimal" className="rounded-2xl border border-slate-200 px-4 py-3 font-bold" />
          <input name="max_monthly" placeholder="Max monthly £, e.g. 200" inputMode="decimal" className="rounded-2xl border border-slate-200 px-4 py-3 font-bold" />
          <input name="term_months" placeholder="Term months, e.g. 12" inputMode="numeric" className="rounded-2xl border border-slate-200 px-4 py-3 font-bold" />
          <select name="rate_type" className="rounded-2xl border border-slate-200 px-4 py-3 font-bold">
            <option value="variable">Variable</option>
            <option value="fixed">Fixed</option>
            <option value="bonus">Bonus</option>
            <option value="introductory">Introductory</option>
            <option value="unknown">Unknown</option>
          </select>
          <select name="access_type" className="rounded-2xl border border-slate-200 px-4 py-3 font-bold">
            <option value="restricted">Restricted</option>
            <option value="easy_access">Easy access</option>
            <option value="notice">Notice</option>
            <option value="fixed_term">Fixed term</option>
            <option value="unknown">Unknown</option>
          </select>
          <select name="status" className="rounded-2xl border border-slate-200 px-4 py-3 font-bold">
            <option value="active">Active</option>
            <option value="draft">Draft</option>
            <option value="needs_review">Needs review</option>
            <option value="expired">Expired</option>
            <option value="withdrawn">Withdrawn</option>
          </select>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <label className="rounded-2xl bg-slate-50 p-3 font-bold"><input type="checkbox" name="fscs_covered" className="mr-2" /> FSCS covered</label>
          <label className="rounded-2xl bg-slate-50 p-3 font-bold"><input type="checkbox" name="requires_current_account" className="mr-2" /> Current account required</label>
          <label className="rounded-2xl bg-slate-50 p-3 font-bold"><input type="checkbox" name="requires_switch" className="mr-2" /> Switch required</label>
          <label className="rounded-2xl bg-slate-50 p-3 font-bold"><input type="checkbox" name="requires_direct_debits" className="mr-2" /> Direct debits</label>
          <label className="rounded-2xl bg-slate-50 p-3 font-bold"><input type="checkbox" name="requires_min_monthly_pay_in" className="mr-2" /> Min pay-in</label>
          <label className="rounded-2xl bg-slate-50 p-3 font-bold"><input type="checkbox" name="new_customers_only" className="mr-2" /> New customers only</label>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <input name="opening_url" placeholder="Opening URL" className="rounded-2xl border border-slate-200 px-4 py-3 font-bold" />
          <input name="source_url" placeholder="Source/evidence URL" className="rounded-2xl border border-slate-200 px-4 py-3 font-bold" />
        </div>

        <textarea name="eligibility_notes" placeholder="Eligibility and conditions notes" className="mt-4 min-h-28 w-full rounded-2xl border border-slate-200 px-4 py-3 font-bold" />

        <button className="mt-4 rounded-2xl bg-slate-950 px-5 py-3 font-black text-white">Save deal</button>
      </form>

      <section className="space-y-3">
        {(deals || []).map((deal) => (
          <article key={deal.id} className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-700">{deal.provider_name}</p>
                <h3 className="mt-1 text-2xl font-black">{deal.product_name}</h3>
                <p className="mt-1 text-sm font-bold text-slate-500">{deal.eligibility_notes || "No notes."}</p>
              </div>
              <div className="rounded-2xl bg-emerald-50 p-4 text-right">
                <p className="text-xs font-black uppercase text-emerald-700">AER</p>
                <p className="text-2xl font-black">{Number(deal.rate_aer || 0).toFixed(2)}%</p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs font-black text-slate-400">Max monthly</p><p className="font-black">{deal.max_monthly_pence ? penceToPounds(deal.max_monthly_pence) : "—"}</p></div>
              <div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs font-black text-slate-400">Term</p><p className="font-black">{deal.term_months || "—"} months</p></div>
              <div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs font-black text-slate-400">Status</p><p className="font-black">{deal.status}</p></div>
              <div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs font-black text-slate-400">Checked</p><p className="font-black">{deal.rate_last_checked_at ? new Date(deal.rate_last_checked_at).toLocaleDateString("en-GB") : "Never"}</p></div>
            </div>

            {deal.source_url ? (
              <form action={queueDealRefresh} className="mt-4">
                <input type="hidden" name="deal_id" value={deal.id} />
                <input type="hidden" name="source_url" value={deal.source_url} />
                <button className="rounded-full bg-slate-950 px-4 py-2 text-sm font-black text-white">Queue source refresh</button>
              </form>
            ) : null}
          </article>
        ))}
      </section>
    </main>
  );
}
