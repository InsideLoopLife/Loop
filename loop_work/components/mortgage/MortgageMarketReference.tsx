// The market picture without live lender deals: Bank Rate, what each big
// lender charges on its standard variable rate (with a link to check it),
// and recent headlines to read before choosing a new mortgage.
import {
  BANK_RATE_URL,
  LENDER_SVRS,
  SVR_REFERENCE_CHECKED_ON,
  SVR_ROUNDUP_URL,
  svrOn,
} from "@/lib/wealth/lender-svr-reference";
import type { MortgageNewsItem } from "@/lib/wealth/mortgage-news";

const shortDate = (iso: string) =>
  new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

export function MortgageMarketReference({
  bankRate,
  liveDealCount,
  news,
}: {
  bankRate: number | null;
  liveDealCount: number;
  news: MortgageNewsItem[];
}) {
  const today = new Date().toISOString().slice(0, 10);
  const rows = LENDER_SVRS.map((entry) => ({ entry, rate: svrOn(entry, today) }))
    .sort((a, b) => (a.rate ?? 99) - (b.rate ?? 99));
  const known = rows.filter((row) => row.rate != null).map((row) => row.rate as number);
  const low = known.length ? Math.min(...known) : null;
  const high = known.length ? Math.max(...known) : null;

  return (
    <section className="grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold">Where rates are</h2>
            <p className="mt-1 text-sm text-slate-500">
              {liveDealCount < 10
                ? "Some lenders' deal pages couldn't be read today, so here are Bank Rate and lenders' standard variable rates as a guide."
                : "Bank Rate and what each lender charges when a deal ends."}
            </p>
          </div>
          <a href={BANK_RATE_URL} target="_blank" rel="noreferrer" className="rounded-xl bg-violet-50 px-4 py-3 text-right">
            <span className="block text-xs font-semibold text-violet-700">Bank Rate</span>
            <span className="block text-2xl font-bold text-slate-950">{bankRate != null ? `${bankRate.toFixed(2)}%` : "—"}</span>
          </a>
        </div>

        <p className="mt-5 text-sm font-semibold text-slate-700">
          Standard variable rates{low != null && high != null ? ` · ${low.toFixed(2)}% to ${high.toFixed(2)}%` : ""}
        </p>
        <p className="mt-0.5 text-xs text-slate-500">
          What you move onto if a fixed deal ends and you don&apos;t switch. You can&apos;t apply for these; they&apos;re the rate to avoid. → marks a new rate that hasn&apos;t started yet.
        </p>
        <ul className="mt-3 divide-y divide-slate-100">
          {rows.map(({ entry, rate }) => (
            <li key={entry.lender} className="flex items-center justify-between gap-3 py-2">
              <a href={entry.url} target="_blank" rel="noreferrer" className="min-w-0">
                <span className="block truncate text-sm font-semibold text-slate-900 hover:underline">{entry.lender} ↗</span>
                {entry.note || (entry.nextFrom && entry.nextSvrPercent != null && today < entry.nextFrom) ? (
                  <span className="block truncate text-xs text-slate-500">
                    {entry.nextFrom && entry.nextSvrPercent != null && today < entry.nextFrom
                      ? `${entry.nextSvrPercent.toFixed(2)}% from ${shortDate(entry.nextFrom)}`
                      : null}
                    {entry.nextFrom && entry.nextSvrPercent != null && today < entry.nextFrom && entry.note ? " · " : null}
                    {entry.note}
                  </span>
                ) : null}
              </a>
              <span className="shrink-0 text-right text-sm font-bold text-slate-950">
                {rate != null ? `${entry.svrPercent == null && entry.nextFrom && today < entry.nextFrom ? "→ " : ""}${rate.toFixed(2)}%` : "—"}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-slate-500">
          Checked {shortDate(SVR_REFERENCE_CHECKED_ON)} after Bank Rate rose to 4% on 5 Nov. Each name links to the lender&apos;s page;
          where a lender doesn&apos;t publish it, the link goes to{" "}
          <a href={SVR_ROUNDUP_URL} target="_blank" rel="noreferrer" className="underline">MoneySavingExpert&apos;s round-up</a>.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold">Worth reading</h2>
        <p className="mt-1 text-sm text-slate-500">Recent mortgage and interest rate news, if you&apos;re looking at a new deal.</p>
        {news.length ? (
          <ul className="mt-3 divide-y divide-slate-100">
            {news.map((item) => (
              <li key={item.url} className="py-2.5">
                <a href={item.url} target="_blank" rel="noreferrer" className="block text-sm font-semibold text-slate-900 hover:underline">
                  {item.title}
                </a>
                <span className="text-xs text-slate-500">
                  {item.source}
                  {item.publishedAt ? ` · ${shortDate(item.publishedAt)}` : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-slate-500">No headlines could be loaded just now. Try again later.</p>
        )}
      </div>
    </section>
  );
}
