"use client";

// The weekly search: the five lenders with the lowest yearly cost (rate plus
// fee) at this home's loan-to-value, and the current lender's best deal even
// when it isn't in the five, so staying put is always on the table. Checks
// the saved quote against what's on offer now and offers to replace it.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export type MortgageDealSearchRow = {
  id: string;
  home_id: string;
  searched_on: string;
  rank: number;
  lender_name: string;
  product_name: string | null;
  rate_type: string | null;
  rate_percent: number;
  fee_amount: number;
  ltv_max_percent: number | null;
  initial_term_months: number | null;
  monthly_payment: number | null;
  yearly_cost: number | null;
  is_current_lender: boolean;
  customer_type: string | null;
  source_name: string | null;
  source_url: string | null;
};

type SavedQuote = {
  lender_name: string;
  product_name: string | null;
  rate_percent: number;
  fee_amount: number | null;
  created_at: string;
};

const sameLender = (a: string, b: string) =>
  a.toLowerCase().replace(/building society|bank|plc|\bbs\b|[^a-z]/g, "") === b.toLowerCase().replace(/building society|bank|plc|\bbs\b|[^a-z]/g, "");
const pounds = (value: number) => `£${Math.round(value).toLocaleString("en-GB")}`;
const longDate = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const term = (months: number | null) => (months ? `${Math.round(months / 12)}-year` : "");

export function WeeklyDealSearch({ homeId, rows, currentLender, balance, monthsLeft }: {
  homeId: string | null;
  rows: MortgageDealSearchRow[];
  currentLender: string | null;
  /** Balance and months left when the next deal starts, so payments match the rest of the page. */
  balance?: number;
  monthsLeft?: number;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState<SavedQuote | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!homeId) return;
    fetch(`/api/house/mortgage/user-quotes?homeId=${encodeURIComponent(homeId)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => setSaved(json?.quote ?? null))
      .catch(() => setSaved(null));
  }, [homeId]);

  const latest = rows.length ? rows.map((row) => row.searched_on).sort().reverse()[0] : null;
  const monthlyAt = (rate: number) => {
    if (!balance || !monthsLeft) return null;
    const i = rate / 1200;
    return i === 0 ? balance / monthsLeft : (balance * i) / (1 - Math.pow(1 + i, -monthsLeft));
  };
  // Re-rank on this home's own balance and term rather than the search's estimate.
  const list = rows
    .filter((row) => row.searched_on === latest)
    .map((row) => {
      const monthly = monthlyAt(Number(row.rate_percent));
      if (monthly == null) return row;
      const years = Math.max(1, Number(row.initial_term_months || 24) / 12);
      return { ...row, monthly_payment: monthly, yearly_cost: monthly * 12 + Number(row.fee_amount || 0) / years };
    })
    .sort((a, b) => Number(a.yearly_cost ?? 0) - Number(b.yearly_cost ?? 0) || a.rank - b.rank)
    .map((row, index) => ({ ...row, rank: index + 1 }));
  if (!homeId || !list.length) return null;

  const ownLender = currentLender ? list.find((row) => row.is_current_lender || sameLender(row.lender_name, currentLender)) : undefined;
  const best = list[0];
  // A saved quote is "still on offer" when this week's results have the same
  // lender at that rate. The search only sees the best deal per lender, so a
  // lower saved rate than the lender's best means it has gone.
  const savedLenderRow = saved ? list.find((row) => sameLender(row.lender_name, saved.lender_name)) : undefined;
  const savedGone = Boolean(saved && savedLenderRow && Number(saved.rate_percent) < Number(savedLenderRow.rate_percent) - 0.005);
  const savedIsBest = Boolean(saved && sameLender(saved.lender_name, best.lender_name) && Math.abs(Number(saved.rate_percent) - Number(best.rate_percent)) < 0.005);

  async function useAsQuote(row: MortgageDealSearchRow) {
    setSavingId(row.id);
    setError(null);
    try {
      const res = await fetch("/api/house/mortgage/user-quotes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          homeId,
          lenderName: row.lender_name,
          productName: row.product_name,
          ratePercent: Number(row.rate_percent),
          rateType: row.rate_type,
          ltvMaxPercent: row.ltv_max_percent,
          initialTermMonths: row.initial_term_months,
          feeAmount: Number(row.fee_amount || 0),
          sourceMethod: "url",
          sourceUrl: row.source_url,
          evidenceStatus: "extracted_reviewed",
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || "That didn't save.");
      setSaved({ lender_name: row.lender_name, product_name: row.product_name, rate_percent: Number(row.rate_percent), fee_amount: Number(row.fee_amount || 0), created_at: new Date().toISOString() });
      router.refresh();
    } catch (caught: any) {
      setError(caught?.message || "That didn't save.");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Cheapest deals for you</h2>
          <p className="mt-1 text-sm text-slate-500">
            Searched {longDate(latest!)} for up to {Math.round(Number(best.ltv_max_percent || 60))}% loan-to-value. Ranked by yearly cost: payments plus the fee spread over the deal.
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">Updated every Monday</span>
      </div>

      {saved && savedGone && savedLenderRow ? (
        <div className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
          Your saved quote, {saved.lender_name} at {Number(saved.rate_percent).toFixed(2)}% (added {longDate(saved.created_at)}), isn&apos;t on offer any more.
          The best {savedLenderRow.lender_name} deal now is {Number(savedLenderRow.rate_percent).toFixed(2)}%{best.id !== savedLenderRow.id ? `, and the cheapest overall is ${best.lender_name} at ${Number(best.rate_percent).toFixed(2)}%` : ""}.
        </div>
      ) : saved && !savedIsBest ? (
        <p className="mt-3 text-sm text-slate-600">
          Your saved quote is {saved.lender_name} at {Number(saved.rate_percent).toFixed(2)}%. The cheapest this week is {best.lender_name} at {Number(best.rate_percent).toFixed(2)}%.
        </p>
      ) : null}

      <ul className="mt-4 divide-y divide-slate-100">
        {[...list, ...(ownLender && !list.includes(ownLender) ? [ownLender] : [])].map((row) => {
          const isOwn = Boolean(ownLender && row.id === ownLender.id);
          const isSaved = Boolean(saved && sameLender(saved.lender_name, row.lender_name) && Math.abs(Number(saved.rate_percent) - Number(row.rate_percent)) < 0.005);
          return (
            <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900">
                  <span className="mr-2 text-slate-400">{row.rank}</span>
                  {row.lender_name}
                  {isOwn ? <span className="ml-2 rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-700">Your lender</span> : null}
                </p>
                <p className="text-xs text-slate-500">
                  {term(row.initial_term_months)} {row.rate_type || ""} · {Number(row.fee_amount) > 0 ? `${pounds(Number(row.fee_amount))} fee` : "no fee"}
                  {row.monthly_payment ? ` · about ${pounds(Number(row.monthly_payment))}/month` : ""}
                  {row.source_url ? (
                    <>
                      {" · "}
                      <a href={row.source_url} target="_blank" rel="noreferrer" className="underline">{row.source_name || "source"}</a>
                    </>
                  ) : null}
                </p>
                {isOwn ? <p className="text-xs text-slate-500">Rates for new customers. As a {row.lender_name} customer, your switch deals may be lower: check them in your online account.</p> : null}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-right">
                  <span className="block text-base font-bold text-slate-950">{Number(row.rate_percent).toFixed(2)}%</span>
                  {row.yearly_cost ? <span className="block text-[11px] text-slate-500">{pounds(Number(row.yearly_cost))}/yr</span> : null}
                </span>
                {isSaved ? (
                  <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">Your quote</span>
                ) : (
                  <button type="button" disabled={savingId !== null} onClick={() => useAsQuote(row)} className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                    {savingId === row.id ? "Saving…" : "Use as my quote"}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {error ? <p className="mt-2 text-sm text-rose-600">{error}</p> : null}
    </section>
  );
}
