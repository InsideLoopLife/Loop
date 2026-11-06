import { boeDownloadUrl } from "@/lib/rates/boe-csv";
import { createWorkerDatabaseClient } from "@/platform/database/worker-client";
import { uploadBoeBenchmarks } from "./actions";

export default async function BoeBenchmarksPage({ searchParams }: { searchParams?: Promise<{ saved?: string; skipped?: string; error?: string }> }) {
  const params = (await searchParams) || {};
  const ratesDb = createWorkerDatabaseClient("rates");
  const { data } = await ratesDb
    .from("mortgage_market_rate_benchmarks")
    .select("series_code, term_type, ltv_tier, rate_percent, effective_month, source, fetched_at")
    .order("effective_month", { ascending: false })
    .limit(40);
  const latestMortgageMonth = (data || []).find((r: any) => r.term_type !== "bank_rate")?.effective_month || null;
  const bankRate = (data || []).find((r: any) => r.term_type === "bank_rate");

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-4">
      <section className="rounded-[2rem] bg-slate-950 p-6 text-white">
        <p className="text-xs font-black uppercase tracking-[0.25em] text-emerald-300">Admin rates</p>
        <h1 className="mt-2 text-4xl font-black">Bank of England mortgage averages</h1>
        <p className="mt-3 text-sm font-bold text-white/75">
          Bank Rate updates itself every morning. The monthly mortgage averages (2, 3, 5 and 10-year fixes by LTV, SVR) need one upload a month:
          the Bank doesn&apos;t allow automated downloads of this data, but you can download it yourself.
        </p>
      </section>

      {params.error ? <p className="rounded-2xl bg-rose-50 p-4 text-sm font-bold text-rose-800">{params.error}</p> : null}
      {params.saved ? <p className="rounded-2xl bg-emerald-50 p-4 text-sm font-bold text-emerald-800">Saved {params.saved} rates.{params.skipped ? ` Not recognised: ${params.skipped}.` : ""}</p> : null}

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-[2rem] border border-slate-200 p-5">
          <p className="text-xs font-black uppercase tracking-widest text-slate-500">Bank Rate</p>
          <p className="mt-2 text-3xl font-black">{bankRate ? `${Number(bankRate.rate_percent).toFixed(2)}%` : "Not loaded yet"}</p>
          <p className="mt-1 text-xs font-bold text-slate-500">{bankRate ? `Checked ${String(bankRate.fetched_at).slice(0, 16).replace("T", " ")}` : "Loads at 07:00 each day."}</p>
        </div>
        <div className="rounded-[2rem] border border-slate-200 p-5">
          <p className="text-xs font-black uppercase tracking-widest text-slate-500">Mortgage averages</p>
          <p className="mt-2 text-3xl font-black">{latestMortgageMonth ? new Date(latestMortgageMonth).toLocaleDateString("en-GB", { month: "long", year: "numeric" }) : "None yet"}</p>
          <p className="mt-1 text-xs font-bold text-slate-500">The Bank publishes on the 5th working day of each month, for the month before.</p>
        </div>
      </section>

      <section className="space-y-4 rounded-[2rem] border border-slate-200 p-5">
        <h2 className="text-xl font-black">Monthly update (2 minutes)</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm font-bold text-slate-700">
          <li>
            <a href={boeDownloadUrl()} target="_blank" rel="noreferrer" className="text-emerald-700 underline">Open this Bank of England link</a> — your browser downloads a CSV of the last few months.
          </li>
          <li>Choose that file below and press Upload.</li>
        </ol>
        <form action={uploadBoeBenchmarks} className="flex flex-wrap items-center gap-3">
          <input type="file" name="file" accept=".csv,text/csv" className="text-sm font-bold" />
          <button className="rounded-full bg-slate-950 px-5 py-2 text-sm font-black text-white">Upload</button>
        </form>
      </section>

      <section className="rounded-[2rem] border border-slate-200 p-5">
        <h2 className="text-xl font-black">Latest rows</h2>
        <table className="mt-3 w-full text-left text-sm">
          <thead className="text-xs uppercase text-slate-500"><tr><th>Month</th><th>Type</th><th>LTV</th><th>Rate</th><th>Source</th></tr></thead>
          <tbody>
            {(data || []).map((r: any) => (
              <tr key={`${r.series_code}-${r.effective_month}`} className="border-t border-slate-100">
                <td className="py-1">{String(r.effective_month).slice(0, 7)}</td><td>{r.term_type}</td><td>{r.ltv_tier ? `${r.ltv_tier}%` : "—"}</td><td>{Number(r.rate_percent).toFixed(2)}%</td><td className="text-xs text-slate-500">{r.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
