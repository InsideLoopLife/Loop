import { createClient } from "@/lib/supabase/server";
import { penceToPounds } from "@/lib/money/dealMath";
import { generateMoneyOpportunities, saveMoneyProfile } from "./actions";

function Percent({ value }: { value: number | null | undefined }) {
  return <>{Number(value || 0).toFixed(2)}%</>;
}

export default async function MoneyStrategyPage() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  if (!user) {
    return <main className="p-6">Please sign in.</main>;
  }

  const { data: profile } = await supabase
    .from("loop_money_profiles")
    .select("*")
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  const { data: candidates } = profile?.id
    ? await supabase.rpc("loop_money_deal_candidates", { p_profile_id: profile.id })
    : { data: [] as any[] };

  const { data: notifications } = await supabase
    .from("loop_money_notifications")
    .select("*")
    .eq("user_id", user.id)
    .eq("status", "unread")
    .order("created_at", { ascending: false })
    .limit(6);

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4">
      <section className="rounded-[2rem] bg-slate-950 p-6 text-white">
        <p className="text-xs font-black uppercase tracking-[0.25em] text-emerald-300">LoopWealth</p>
        <h1 className="mt-2 text-4xl font-black">Money strategy and savings deal watch</h1>
        <p className="mt-3 max-w-3xl text-sm font-bold text-white/75">
          Set your monthly savings agenda, current cash rate and preferences. LOOP can then flag better deals, conditions and estimated gross benefit.
        </p>
      </section>

      <section className="rounded-[2rem] border border-amber-100 bg-amber-50 p-5">
        <h2 className="text-xl font-black">Important note</h2>
        <p className="mt-2 text-sm font-bold text-amber-950">
          This is comparison and organisation support, not regulated financial advice. Check provider terms, FSCS protection, tax position, access restrictions and whether the account is suitable before acting.
        </p>
      </section>

      {notifications?.length ? (
        <section className="space-y-3">
          {notifications.map((note) => (
            <article key={note.id} className="rounded-3xl border border-emerald-100 bg-emerald-50 p-4">
              <p className="font-black text-emerald-950">{note.title}</p>
              <p className="mt-1 text-sm font-bold text-emerald-900">{note.body}</p>
            </article>
          ))}
        </section>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-[420px_1fr]">
        <form action={saveMoneyProfile} className="space-y-4 rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
          <input type="hidden" name="profile_id" value={profile?.id || ""} />
          <h2 className="text-2xl font-black">Your money agenda</h2>

          <label className="block">
            <span className="text-sm font-black">Plan name</span>
            <input name="profile_name" defaultValue={profile?.profile_name || "My money plan"} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-bold" />
          </label>

          <label className="block">
            <span className="text-sm font-black">Monthly money available for savings</span>
            <input name="monthly_available_savings" defaultValue={profile ? (profile.monthly_available_savings_pence / 100).toFixed(2) : "500.00"} inputMode="decimal" className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-bold" />
          </label>

          <label className="block">
            <span className="text-sm font-black">Current cash savings balance</span>
            <input name="current_cash_savings" defaultValue={profile ? (profile.current_cash_savings_pence / 100).toFixed(2) : "0.00"} inputMode="decimal" className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-bold" />
          </label>

          <label className="block">
            <span className="text-sm font-black">Emergency fund target</span>
            <input name="emergency_fund_target" defaultValue={profile ? (profile.emergency_fund_target_pence / 100).toFixed(2) : "0.00"} inputMode="decimal" className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-bold" />
          </label>

          <label className="block">
            <span className="text-sm font-black">Current average cash rate AER</span>
            <input name="existing_average_cash_rate_aer" defaultValue={profile?.existing_average_cash_rate_aer || "0"} inputMode="decimal" className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-bold" />
          </label>

          <label className="block">
            <span className="text-sm font-black">Assumed investment return AER/APR</span>
            <input name="expected_investment_return_aer" defaultValue={profile?.expected_investment_return_aer || "0"} inputMode="decimal" className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-bold" />
            <span className="mt-1 block text-xs font-bold text-slate-500">For now this is manual. Later it can come from a paid data/API source.</span>
          </label>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="block">
              <span className="text-sm font-black">Risk approach</span>
              <select name="risk_preference" defaultValue={profile?.risk_preference || "cash_first"} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-bold">
                <option value="cash_first">Cash first</option>
                <option value="balanced">Balanced</option>
                <option value="investment_focused">Investment focused</option>
                <option value="custom">Custom</option>
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-black">Access preference</span>
              <select name="liquidity_preference" defaultValue={profile?.liquidity_preference || "easy_access_first"} className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-3 font-bold">
                <option value="easy_access_first">Easy access first</option>
                <option value="regular_saver_ok">Regular savers OK</option>
                <option value="fixed_term_ok">Fixed terms OK</option>
                <option value="custom">Custom</option>
              </select>
            </label>
          </div>

          <textarea name="notes" defaultValue={profile?.notes || ""} placeholder="Anything specific: mortgage goal, holiday fund, nursery fees, emergency fund..." className="min-h-28 w-full rounded-2xl border border-slate-200 px-4 py-3 font-bold" />

          <button className="w-full rounded-2xl bg-slate-950 px-5 py-3 font-black text-white">Save money agenda</button>
        </form>

        <section className="space-y-4">
          {profile ? (
            <form action={generateMoneyOpportunities} className="rounded-[2rem] border border-emerald-100 bg-emerald-50 p-5">
              <input type="hidden" name="profile_id" value={profile.id} />
              <h2 className="text-2xl font-black">Deal checks</h2>
              <p className="mt-2 text-sm font-bold text-emerald-900">
                LOOP checks how much of your monthly savings fits each deal, estimates gross interest, flags conditions, and tells you where the rest of your money would still need to go.
              </p>
              <button className="mt-4 rounded-2xl bg-slate-950 px-5 py-3 font-black text-white">Generate opportunities</button>
            </form>
          ) : (
            <div className="rounded-[2rem] border border-slate-200 bg-white p-5 font-bold text-slate-500">Save your money agenda first to see opportunities.</div>
          )}

          {(candidates || []).map((deal: any) => (
            <article key={deal.deal_id} className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-700">{deal.provider_name}</p>
                  <h3 className="mt-1 text-2xl font-black">{deal.product_name}</h3>
                  <p className="mt-1 text-sm font-bold text-slate-500">{deal.reason}</p>
                </div>
                <div className="rounded-2xl bg-emerald-50 p-4 text-right">
                  <p className="text-xs font-black uppercase text-emerald-700">Rate AER</p>
                  <p className="text-2xl font-black"><Percent value={deal.rate_aer} /></p>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-4">
                <div className="rounded-2xl bg-slate-50 p-3">
                  <p className="text-xs font-black text-slate-400">Use monthly</p>
                  <p className="font-black">{penceToPounds(deal.recommended_monthly_pence)}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <p className="text-xs font-black text-slate-400">Remaining monthly</p>
                  <p className="font-black">{penceToPounds(deal.remaining_monthly_pence)}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <p className="text-xs font-black text-slate-400">Estimated gross interest</p>
                  <p className="font-black">{penceToPounds(deal.estimated_gross_interest_pence)}</p>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <p className="text-xs font-black text-slate-400">Potential uplift</p>
                  <p className="font-black">{penceToPounds(deal.estimated_incremental_gross_interest_pence)}</p>
                </div>
              </div>

              {deal.condition_warnings?.length ? (
                <div className="mt-4 rounded-2xl bg-amber-50 p-4">
                  <p className="text-sm font-black text-amber-900">Check conditions</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm font-bold text-amber-950">
                    {deal.condition_warnings.map((warning: string) => <li key={warning}>{warning}</li>)}
                  </ul>
                </div>
              ) : null}

              {deal.opening_url || deal.source_url ? (
                <a href={deal.opening_url || deal.source_url} target="_blank" rel="noreferrer" className="mt-4 inline-block rounded-full bg-slate-950 px-4 py-2 text-sm font-black text-white">
                  View source / provider
                </a>
              ) : null}
            </article>
          ))}
        </section>
      </section>
    </main>
  );
}
