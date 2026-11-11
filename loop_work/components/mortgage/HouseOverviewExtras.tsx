"use client";

// Pieces of the House overview: when to lock in the next deal and what it
// would cost, what the home costs to run, how prices in the area are moving,
// and the mortgage's history.
import { useState } from "react";
import { calculateMonthlyMortgagePayment, calculateProjectedMortgageBalance } from "@/lib/calculations/mortgage";
import { effectiveMortgageStart, getMortgageTermPosition, wholeMonthsBetween } from "@/lib/calculations/mortgage-term";
import { LENDER_SVRS, svrOn } from "@/lib/wealth/lender-svr-reference";
import type { AreaPrices } from "@/lib/property/house-price-index";
import type { HomeMortgageDeal } from "@/components/mortgage/MortgagePlannerClient";
import type { MortgageDealSearchRow } from "@/components/mortgage/WeeklyDealSearch";

const pounds = (value: number) => `£${Math.round(value).toLocaleString("en-GB")}`;
const monthYear = (date: Date) => date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
const sameLender = (a: string, b: string) => a.toLowerCase().replace(/[^a-z]/g, "").replace(/buildingsociety|bank/g, "") === b.toLowerCase().replace(/[^a-z]/g, "").replace(/buildingsociety|bank/g, "");
const card = "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm";

/** Most lenders let you secure a new deal about six months before the current one ends. */
const LOCK_IN_MONTHS = 6;

export function RenewalCountdown({ deal, searchRows, onCompare }: { deal: HomeMortgageDeal | undefined; searchRows: MortgageDealSearchRow[]; onCompare: () => void }) {
  const endIso = deal?.initial_period_end;
  if (!deal || !endIso) return null;
  const end = new Date(`${endIso}T00:00:00`);
  if (Number.isNaN(end.getTime())) return null;
  const lockFrom = new Date(end);
  lockFrom.setMonth(lockFrom.getMonth() - LOCK_IN_MONTHS);
  const now = new Date();
  const daysLeft = Math.ceil((end.getTime() - now.getTime()) / 86400000);
  if (daysLeft < -60) return null;
  const canLock = now >= lockFrom;

  // Balance and term left on the day the deal ends: that's what the next deal repays.
  const start = effectiveMortgageStart(deal as any).date;
  const balanceAtEnd = calculateProjectedMortgageBalance({
    openingBalance: Number(deal.balance || 0),
    annualInterestRate: Number(deal.interest_rate || 0),
    termYears: Number(deal.term_years || 25),
    balanceAsOfDate: deal.balance_as_of_date ?? deal.start_date,
    asOfDate: end,
    monthlyPayment: deal.monthly_payment_override,
    repaymentType: deal.repayment_type ?? "repayment",
    termStartDate: start,
  }).projectedBalance;
  const monthsLeftAtEnd = Math.max(12, Math.round(Number(deal.term_years || 25) * 12) - (start ? wholeMonthsBetween(start, end) : 0));
  const paymentAt = (rate: number) => calculateMonthlyMortgagePayment({ balance: balanceAtEnd, annualInterestRate: rate, termYears: monthsLeftAtEnd / 12 });
  const currentPayment = paymentAt(Number(deal.interest_rate || 0));

  const latest = searchRows.length ? searchRows.map((row) => row.searched_on).sort().reverse()[0] : null;
  // Same ranking as the Renewal tab: yearly cost on this home's balance and term.
  const yearly = (row: MortgageDealSearchRow) => paymentAt(Number(row.rate_percent)) * 12 + Number(row.fee_amount || 0) / Math.max(1, Number(row.initial_term_months || 24) / 12);
  const rows = searchRows.filter((row) => row.searched_on === latest).sort((a, b) => yearly(a) - yearly(b));
  const best = rows[0];
  const own = deal.lender ? rows.find((row) => row.is_current_lender || sameLender(row.lender_name, deal.lender || "")) : undefined;
  const svrEntry = deal.lender ? LENDER_SVRS.find((entry) => sameLender(entry.lender, deal.lender || "")) : undefined;
  const svr = svrEntry ? svrOn(svrEntry, endIso) : null;

  const options = [
    best ? { label: `Cheapest: ${best.lender_name}`, rate: Number(best.rate_percent), note: `${Math.round(Number(best.initial_term_months || 24) / 12)}-year ${best.rate_type || ""}, ${Number(best.fee_amount) > 0 ? `${pounds(Number(best.fee_amount))} fee` : "no fee"}` } : null,
    own && own !== best ? { label: `Best from ${own.lender_name}`, rate: Number(own.rate_percent), note: "No need to change lender" } : null,
    svr != null ? { label: "If you do nothing", rate: svr, note: `${deal.lender}'s standard variable rate` } : null,
  ].filter(Boolean) as Array<{ label: string; rate: number; note: string }>;

  return (
    <section className={`${card} ${canLock ? "border-violet-200 bg-violet-50/40" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-violet-700">Your deal ends {monthYear(end)}{daysLeft > 0 ? ` · ${daysLeft} days` : ""}</p>
          <h2 className="mt-1 text-xl font-bold text-slate-950">
            {daysLeft <= 0 ? "Your deal has ended" : canLock ? "You can lock in your next deal now" : `You can lock in your next deal from ${monthYear(lockFrom)}`}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            Most lenders let you secure a new rate up to {LOCK_IN_MONTHS} months before your deal ends, and you can usually switch to a cheaper one if rates fall before then. Today you pay {Number(deal.interest_rate).toFixed(2)}% (about {pounds(currentPayment)} a month at that point).
          </p>
        </div>
        <button type="button" onClick={onCompare} className="rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-bold text-white">See this week&apos;s deals</button>
      </div>
      {options.length ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {options.map((option) => {
            const payment = paymentAt(option.rate);
            return (
              <div key={option.label} className="rounded-xl bg-white p-3 ring-1 ring-slate-200">
                <p className="text-xs font-semibold text-slate-500">{option.label}</p>
                <p className="mt-0.5 text-lg font-bold text-slate-950">{option.rate.toFixed(2)}% · {pounds(payment)}/mo</p>
                <p className="text-xs text-slate-500">{payment > currentPayment ? `+${pounds(payment - currentPayment)} a month` : `${pounds(currentPayment - payment)} less a month`} · {option.note}</p>
              </div>
            );
          })}
        </div>
      ) : null}
      <p className="mt-3 text-xs text-slate-500">Payments use the balance LOOP expects when the deal ends ({pounds(balanceAtEnd)}) over the {Math.floor(monthsLeftAtEnd / 12)} years left.</p>
    </section>
  );
}

export function TermNote({ deal, onEdit }: { deal: HomeMortgageDeal | undefined; onEdit: () => void }) {
  if (!deal) return null;
  const position = getMortgageTermPosition(deal as any);
  if (!position.note) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <span>{position.note}</span>
      <button type="button" onClick={onEdit} className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 ring-1 ring-amber-200">Add the date</button>
    </div>
  );
}

export function MortgageFacts({ deal }: { deal: HomeMortgageDeal | undefined }) {
  if (!deal) return null;
  const position = getMortgageTermPosition(deal as any);
  const start = effectiveMortgageStart(deal as any).date;
  const payoff = start ? new Date(`${start}T00:00:00`) : null;
  if (payoff) payoff.setMonth(payoff.getMonth() + Math.round(Number(deal.term_years || 25) * 12));
  const years = Math.floor(position.remainingMonths / 12);
  const months = position.remainingMonths % 12;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Mortgage-free</p><p className="font-semibold">{payoff ? payoff.toLocaleDateString("en-GB", { month: "long", year: "numeric" }) : "—"}</p></div>
      <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Time left</p><p className="font-semibold">{years}y {months}m</p></div>
      <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Payments began</p><p className="font-semibold">{start ? new Date(`${start}T00:00:00`).toLocaleDateString("en-GB", { month: "short", year: "numeric" }) : "—"}</p></div>
    </div>
  );
}

const RUNNING = /council tax|insurance|electric|gas\b|energy|water|broadband|internet|service charge|ground rent|tv licen|boiler|home emergency|maintenance|octopus|british gas|edf|e\.on|ovo|united utilities|severn trent|thames water/i;

export function RunningCosts({ items, children }: { items: Array<{ label: string; value: number }>; children?: React.ReactNode }) {
  const rows = items
    .filter((item) => RUNNING.test(item.label) && !/mortgage/i.test(item.label) && Number(item.value) > 0)
    .sort((a, b) => Number(b.value) - Number(a.value));
  const total = rows.reduce((sum, item) => sum + Number(item.value), 0);
  return (
    <section className={card}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-bold">What the home costs to run</h2>
        {rows.length ? <p className="text-sm font-semibold text-slate-900">{pounds(total)}/mo · {pounds(total * 12)}/yr</p> : null}
      </div>
      <p className="mt-1 text-sm text-slate-500">Bills from Money in &amp; out that belong to the home, on top of the mortgage.</p>
      {rows.length ? (
        <ul className="mt-3 divide-y divide-slate-100">
          {rows.map((item) => (
            <li key={item.label} className="flex justify-between py-2 text-sm"><span className="text-slate-700">{item.label.replace(/^unassigned\s*·\s*/i, "")}</span><span className="font-semibold">{pounds(Number(item.value))}/mo</span></li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-slate-500">No council tax, energy, water or insurance bills found in Money in &amp; out yet.</p>
      )}
      {!rows.some((item) => /insurance/i.test(item.label)) ? <p className="mt-2 text-xs text-amber-700">No buildings or contents insurance found. Add it in Money in &amp; out if you pay it.</p> : null}
      {children}
    </section>
  );
}

export function AreaPriceCard({ data, homeValue, valuationLabel }: { data: AreaPrices | null; homeValue: number; valuationLabel: string | null }) {
  if (!data) return null;
  const monthLabel = new Date(`${data.month}-15T12:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
  const change = data.typeAnnualChange ?? data.annualChange;
  return (
    <section className={card}>
      <h2 className="text-lg font-bold">Prices in {data.region}</h2>
      <p className="mt-1 text-sm text-slate-500">HM Land Registry house price index, {monthLabel}.</p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Average {data.typeLabel ?? "home"}</p><p className="font-semibold">{pounds(data.typeAveragePrice ?? data.averagePrice)}</p></div>
        <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Over the last year</p><p className={`font-semibold ${change != null && change < 0 ? "text-rose-600" : "text-emerald-700"}`}>{change != null ? `${change > 0 ? "+" : ""}${change.toFixed(1)}%` : "—"}</p></div>
        {data.indexValue ? (
          <div className="rounded-xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Your home by the index</p><p className="font-semibold">{pounds(data.indexValue)}</p></div>
        ) : null}
      </div>
      {data.indexValue && homeValue > 0 ? (
        <p className="mt-2 text-xs text-slate-500">
          Your purchase price grown in line with {data.typeLabel ?? "home"} prices in {data.region}. {valuationLabel ? `${valuationLabel} says ${pounds(homeValue)}` : `LOOP uses ${pounds(homeValue)}`}, {`${Math.abs(Math.round(((homeValue - data.indexValue) / data.indexValue) * 100))}% ${homeValue >= data.indexValue ? "above" : "below"} the index figure.`} Extensions or work you&apos;ve done aren&apos;t in the index.
        </p>
      ) : null}
      <a href={data.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs font-semibold text-violet-700 underline">Land Registry figures ↗</a>
    </section>
  );
}

export function DealHistory({ deals, onEdit }: { deals: HomeMortgageDeal[]; onEdit: (deal: HomeMortgageDeal) => void }) {
  if (!deals.length) return null;
  const sorted = [...deals].sort((a, b) => String(b.initial_period_end || b.start_date || "").localeCompare(String(a.initial_period_end || a.start_date || "")));
  return (
    <section className={card}>
      <h2 className="text-lg font-bold">Mortgage history</h2>
      <p className="mt-1 text-sm text-slate-500">Each deal on this home. When you switch, add the new deal and the old one stays here.</p>
      <ul className="mt-3 divide-y divide-slate-100">
        {sorted.map((deal) => {
          const start = effectiveMortgageStart(deal as any).date;
          return (
            <li key={deal.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
              <div>
                <p className="text-sm font-semibold">{[deal.lender, deal.product_name].filter(Boolean).join(" · ") || "Mortgage"}</p>
                <p className="text-xs text-slate-500">
                  {start ? new Date(`${start}T00:00:00`).toLocaleDateString("en-GB", { month: "short", year: "numeric" }) : "?"} to {deal.initial_period_end ? new Date(`${deal.initial_period_end}T00:00:00`).toLocaleDateString("en-GB", { month: "short", year: "numeric" }) : "end of term"} · {pounds(Number(deal.balance || 0))} at {deal.balance_as_of_date ? new Date(`${deal.balance_as_of_date}T00:00:00`).toLocaleDateString("en-GB", { month: "short", year: "numeric" }) : "start"}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold">{Number(deal.interest_rate).toFixed(2)}%</span>
                <button type="button" onClick={() => onEdit(deal)} className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600">Edit</button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export type CouncilTaxBandQuote = { band: string; annual: number; source: "council_table" | "national_average"; authority: string | null; chargeYear: string };

/**
 * Checks the council tax bill in Money in & out against what the band should
 * cost in this council area (MHCLG Band D figures × the legal band ratios).
 */
export function CouncilTaxCheck({ homeId, band, quotes, monthlyBill, onSave }: {
  homeId: string | null;
  band: string | null;
  quotes: CouncilTaxBandQuote[];
  monthlyBill: number | null;
  onSave: (band: string) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  if (!homeId || !quotes.length) return null;
  const yearlyBill = monthlyBill != null ? monthlyBill * 12 : null;
  // Bills are often paid over 10 months; check against both.
  const nearest = yearlyBill
    ? [...quotes].sort((a, b) => Math.min(Math.abs(a.annual - yearlyBill), Math.abs(a.annual - yearlyBill * 10 / 12)) - Math.min(Math.abs(b.annual - yearlyBill), Math.abs(b.annual - yearlyBill * 10 / 12)))[0]
    : null;
  const chosen = band ? quotes.find((quote) => quote.band === band) : null;
  const local = quotes[0]?.source === "council_table";
  const area = quotes[0]?.authority;
  return (
    <div className="mt-4 rounded-xl bg-slate-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-800">Council tax band</p>
        <select
          value={band ?? ""}
          disabled={saving}
          onChange={async (event) => { setSaving(true); try { await onSave(event.target.value); } finally { setSaving(false); } }}
          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm"
        >
          <option value="">Not set</option>
          {quotes.map((quote) => <option key={quote.band} value={quote.band}>Band {quote.band}</option>)}
        </select>
      </div>
      {chosen ? (
        <p className="mt-1 text-xs text-slate-600">
          Band {chosen.band} {local && area ? `in ${area}` : "(England average, as your council's figures aren't loaded)"} is about {pounds(chosen.annual)} a year for {chosen.chargeYear}.
          {yearlyBill ? (Math.abs(chosen.annual - yearlyBill) / chosen.annual < 0.08 || Math.abs(chosen.annual - yearlyBill * 10 / 12) / chosen.annual < 0.08
            ? " That matches your bill."
            : ` Your bill comes to ${pounds(yearlyBill)} a year, which is ${yearlyBill > chosen.annual ? "more" : "less"} than that: worth checking your band or any discount.`) : null}
        </p>
      ) : (
        <p className="mt-1 text-xs text-slate-600">
          {nearest && local ? `Your bill of ${pounds(yearlyBill!)} a year looks like Band ${nearest.band} in ${area}. ` : ""}
          Check your band on{" "}
          <a href="https://www.gov.uk/council-tax-bands" target="_blank" rel="noreferrer" className="underline">GOV.UK</a> and set it here.
        </p>
      )}
    </div>
  );
}
