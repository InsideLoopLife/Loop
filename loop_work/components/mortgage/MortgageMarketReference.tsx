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
  fixedTwoYear,
  fixedFiveYear,
  ltv,
  liveDealCount,
  news,
}: {
  bankRate: number | null;
  /** Bank of England average quoted 2- and 5-year fixed rates for this LTV band. */
  fixedTwoYear: number | null;
  fixedFiveYear: number | null;
  ltv: number | null;
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
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,.9fr)]">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-bold">Where rates are</h2>
        <p className="mt-1 text-sm text-slate-500">
          {liveDealCount < 10
            ? "Some lenders' deal pages couldn't be read today, so here's the picture from the Bank of England and lenders' own pages."
            : "The picture from the Bank of England and lenders' own pages."}
        </p>

        {(() => {
          const tiles = [
            { label: "Bank Rate", value: bankRate, href: BANK_RATE_URL, tone: "bg-violet-50 text-violet-700" },
            { label: "Typical 2-year fix", value: fixedTwoYear, tone: "bg-emerald-50 text-emerald-800" },
            { label: "Typical 5-year fix", value: fixedFiveYear, tone: "bg-emerald-50 text-emerald-800" },
          ].filter((tile) => tile.value != null);
          return (
            <div className={`mt-4 grid gap-2 ${tiles.length === 3 ? "grid-cols-3" : tiles.length === 2 ? "grid-cols-2" : "grid-cols-1 sm:max-w-[12rem]"}`}>
              {tiles.map((tile) => {
                const body = (
                  <>
                    <span className={`block text-xs font-semibold ${tile.tone.split(" ")[1]}`}>{tile.label}</span>
                    <span className="block text-xl font-bold text-slate-950">{Number(tile.value).toFixed(2)}%</span>
                  </>
                );
                return tile.href ? (
                  <a key={tile.label} href={tile.href} target="_blank" rel="noreferrer" className={`rounded-xl px-3 py-3 ${tile.tone.split(" ")[0]}`}>{body}</a>
                ) : (
                  <div key={tile.label} className={`rounded-xl px-3 py-3 ${tile.tone.split(" ")[0]}`}>{body}</div>
                );
              })}
            </div>
          );
        })()}
        <p className="mt-1.5 text-xs text-slate-500">
          {fixedTwoYear != null || fixedFiveYear != null
            ? `Typical fixes are Bank of England averages${ltv != null ? ` for around ${Math.round(ltv)}% loan-to-value` : ""}. The best deals on lenders' sites are often lower.`
            : "New fixed and tracker deals are priced by each lender and are usually well below their variable rates. Check each lender's current deals below."}
        </p>

        <div className="mt-5 flex items-end justify-between gap-3 border-b border-slate-100 pb-2">
          <div>
            <p className="text-sm font-semibold text-slate-700">Lenders</p>
            <p className="text-xs text-slate-500">
              Current deals are what you could switch to. The rate on the right is their standard variable rate: what you pay if a deal ends and you don&apos;t switch{low != null && high != null ? ` (${low.toFixed(2)}% to ${high.toFixed(2)}% at the moment)` : ""}.
            </p>
          </div>
          <span className="shrink-0 text-xs font-semibold text-slate-500">If you don&apos;t switch</span>
        </div>
        <ul className="mt-3 divide-y divide-slate-100">
          {rows.map(({ entry, rate }) => (
            <li key={entry.lender} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <span className="block truncate text-sm font-semibold text-slate-900">{entry.lender}</span>
                <span className="block truncate text-xs text-slate-500">
                  <a href={entry.dealsUrl || entry.url} target="_blank" rel="noreferrer" className="font-semibold text-emerald-700 hover:underline">
                    {entry.dealsUrl ? "Current deals ↗" : "Rates ↗"}
                  </a>
                  {entry.nextFrom && entry.nextSvrPercent != null && today < entry.nextFrom ? ` · SVR ${entry.nextSvrPercent.toFixed(2)}% from ${shortDate(entry.nextFrom)}` : null}
                  {entry.note ? ` · ${entry.note}` : null}
                </span>
              </div>
              <a href={entry.url} target="_blank" rel="noreferrer" className="shrink-0 text-right text-sm font-bold text-slate-700 hover:underline">
                {rate != null ? `${entry.svrPercent == null && entry.nextFrom && today < entry.nextFrom ? "→ " : ""}${rate.toFixed(2)}%` : "—"}
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-slate-500">
          Variable rates checked {shortDate(SVR_REFERENCE_CHECKED_ON)}, after Bank Rate rose to 4% on 5 Nov; → marks a new rate that hasn&apos;t started yet. Each rate links to the lender&apos;s page, or where a lender doesn&apos;t publish it, to{" "}
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
