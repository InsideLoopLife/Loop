import { createClient } from "@/lib/supabase/server";

export default async function AdminMoneyDailyWatchPage() {
  const supabase = await createClient();

  const [{ data: runs }, { data: deals }, { data: sources }] = await Promise.all([
    supabase.from("loop_money_deal_daily_runs").select("*").order("started_at", { ascending: false }).limit(10),
    supabase
      .from("loop_money_savings_deals")
      .select("id, provider_name, product_name, rate_aer, status, availability_status, public_visibility, last_check_status, last_check_detail, rate_last_checked_at, source_url")
      .order("rate_last_checked_at", { ascending: false, nullsFirst: true })
      .limit(40),
    supabase.from("loop_money_deal_sources").select("*").order("created_at", { ascending: false }).limit(20),
  ]);

  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4">
      <section className="rounded-[2rem] bg-slate-950 p-6 text-white">
        <p className="text-xs font-black uppercase tracking-[0.25em] text-emerald-300">Admin money</p>
        <h1 className="mt-2 text-4xl font-black">Daily deal watch</h1>
        <p className="mt-3 max-w-3xl text-sm font-bold text-white/75">
          Runs every morning to re-check known savings deals, hide unavailable/blocked deals and notify affected users.
        </p>
      </section>

      <section className="rounded-[2rem] border border-amber-100 bg-amber-50 p-5">
        <h2 className="text-2xl font-black">8am setup</h2>
        <p className="mt-2 text-sm font-bold text-amber-950">
          The code includes <code>vercel.json</code> with <code>0 8 * * *</code>. Vercel cron schedules are UTC, so this is 8am UTC. For exact 8am UK local time all year, use an external scheduler that supports Europe/London time and calls the same endpoint.
        </p>
        <pre className="mt-4 overflow-auto rounded-3xl bg-slate-950 p-4 text-sm text-white">{`GET /api/cron/money-deals-daily
Authorization: Bearer $LOOP_CRON_SECRET

Env:
LOOP_CRON_SECRET=<long-random-secret>
LOOP_APP_URL=https://admin.insideloop.life
LOOP_MONEY_DAILY_LIMIT=75
LOOP_MONEY_DAILY_DELAY_MS=1000`}</pre>
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-2xl font-black">What the daily job can and cannot do</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-3xl bg-emerald-50 p-4">
            <p className="font-black text-emerald-900">It can</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm font-bold text-emerald-950">
              <li>Check deals already in the LOOP library.</li>
              <li>Hide suspected withdrawn/blocked deals from optimisation.</li>
              <li>Record observed rates and source evidence.</li>
              <li>Notify users if a watched deal becomes unavailable.</li>
              <li>Use configured provider/comparison/affiliate feeds later.</li>
            </ul>
          </div>
          <div className="rounded-3xl bg-rose-50 p-4">
            <p className="font-black text-rose-900">It cannot honestly</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm font-bold text-rose-950">
              <li>Guarantee every UK deal exists without a real source/feed.</li>
              <li>Bypass bot protection or blocked bank/comparison pages.</li>
              <li>Replace checking provider terms before the user acts.</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-black text-slate-400">Latest run</p>
          <p className="mt-1 text-xl font-black">{runs?.[0]?.status || "No runs"}</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-black text-slate-400">Checked</p>
          <p className="mt-1 text-xl font-black">{runs?.[0]?.checked_deals || 0}</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-black text-slate-400">Hidden/withdrawn</p>
          <p className="mt-1 text-xl font-black">{(runs?.[0]?.suspected_withdrawn_count || 0) + (runs?.[0]?.withdrawn_count || 0) + (runs?.[0]?.blocked_count || 0)}</p>
        </div>
        <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs font-black text-slate-400">Notifications</p>
          <p className="mt-1 text-xl font-black">{runs?.[0]?.notifications_created || 0}</p>
        </div>
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-2xl font-black">Recent runs</h2>
        <div className="mt-4 overflow-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead>
              <tr className="border-b text-xs font-black uppercase text-slate-400">
                <th className="py-2">Started</th>
                <th>Status</th>
                <th>Checked</th>
                <th>Available</th>
                <th>Suspected</th>
                <th>Withdrawn</th>
                <th>Blocked</th>
                <th>Failed</th>
              </tr>
            </thead>
            <tbody>
              {(runs || []).map((run) => (
                <tr key={run.id} className="border-b">
                  <td className="py-3 font-bold">{new Date(run.started_at).toLocaleString("en-GB")}</td>
                  <td className="font-black">{run.status}</td>
                  <td>{run.checked_deals}</td>
                  <td>{run.available_count}</td>
                  <td>{run.suspected_withdrawn_count}</td>
                  <td>{run.withdrawn_count}</td>
                  <td>{run.blocked_count}</td>
                  <td>{run.failed_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-2xl font-black">Deal availability</h2>
        <div className="mt-4 space-y-3">
          {(deals || []).map((deal) => (
            <article key={deal.id} className="rounded-3xl bg-slate-50 p-4">
              <div className="flex flex-wrap justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-700">{deal.provider_name}</p>
                  <h3 className="font-black">{deal.product_name}</h3>
                  <p className="text-sm font-bold text-slate-500">{deal.last_check_detail || "No check detail yet."}</p>
                </div>
                <div className="text-right">
                  <p className="font-black">{Number(deal.rate_aer || 0).toFixed(2)}% AER</p>
                  <p className="text-sm font-bold">{deal.status} · {deal.availability_status} · {deal.public_visibility}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-2xl font-black">Configured discovery/feed sources</h2>
        <p className="mt-2 text-sm font-bold text-slate-500">
          To capture new deals, add trusted source pages, affiliate feeds, comparison feeds or commercial APIs here. The daily checker can only discover what it has a source for.
        </p>
        <div className="mt-4 space-y-3">
          {(sources || []).length ? sources!.map((source) => (
            <article key={source.id} className="rounded-3xl bg-slate-50 p-4">
              <p className="font-black">{source.source_name}</p>
              <p className="text-sm text-slate-500">{source.source_kind} · {source.source_url}</p>
            </article>
          )) : (
            <p className="rounded-3xl bg-slate-50 p-4 font-bold text-slate-500">No discovery sources configured yet.</p>
          )}
        </div>
      </section>
    </main>
  );
}
