"use client";

// Heads-ups on bills about to change price, with a one-tap way to put the new
// price into the plan, say it doesn't apply, or answer a quick question.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { applyPriceChange, respondPriceWatch } from "@/app/financial-flow/price-watch-actions";
import type { PriceAlert } from "@/lib/bills/price-watch";

const STATUS: Record<PriceAlert["status"], [string, string]> = {
  confirmed: ["Confirmed", "bg-rose-50 text-rose-700"],
  forecast: ["Forecast", "bg-amber-50 text-amber-800"],
  expected: ["Usually happens", "bg-slate-100 text-slate-600"],
  question: ["Quick question", "bg-violet-50 text-violet-700"],
  missing: ["Missing bill", "bg-sky-50 text-sky-700"],
};
const pounds = (n: number) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function Alert({ alert }: { alert: PriceAlert }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [askDate, setAskDate] = useState(false);
  const [date, setDate] = useState("");
  const [amount, setAmount] = useState(alert.next != null ? String(alert.next) : "");
  const run = (fn: () => Promise<void>) => start(async () => { setError(null); try { await fn(); router.refresh(); } catch (e: any) { setError(e?.message || "That didn't save."); } });
  const [label, tone] = STATUS[alert.status];
  const up = alert.next != null && alert.current != null ? alert.next - alert.current : null;

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone}`}>{label}</span>
          <p className="mt-1.5 text-sm font-semibold text-slate-900">{alert.headline}</p>
          <p className="mt-1 text-sm text-slate-600">{alert.detail}</p>
          {alert.source ? <a href={alert.source.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-slate-400 underline">{alert.source.name}</a> : null}
        </div>
        {up != null && up !== 0 ? (
          <div className="shrink-0 text-right">
            <p className={`text-lg font-bold ${up > 0 ? "text-rose-700" : "text-emerald-700"}`}>{up > 0 ? "+" : "−"}{pounds(Math.abs(up))}</p>
            <p className="text-[11px] text-slate-500">a month</p>
          </div>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {alert.canApply && alert.itemId && alert.effective ? (
          <>
            <label className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-sm">
              <span className="text-slate-400">£</span>
              <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" className="w-20 font-semibold outline-none" aria-label="New monthly amount" />
            </label>
            <button type="button" disabled={pending} onClick={() => run(() => applyPriceChange({ key: alert.key, itemId: alert.itemId!, newAmount: Number(amount), effective: alert.effective! }))}
              className="rounded-lg bg-slate-950 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">
              {pending ? "Saving…" : `Add to my plan from ${new Date(`${alert.effective}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`}
            </button>
          </>
        ) : null}
        {alert.question
          ? alert.question.options.map((option) => (
            <button key={option.label} type="button" disabled={pending}
              onClick={() => (option.askDate ? setAskDate(true) : run(() => respondPriceWatch({ key: alert.key, itemId: alert.itemId, response: option.response, value: option.value ?? null })))}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              {option.label}
            </button>
          ))
          : null}
        {askDate ? (
          <span className="flex items-center gap-2">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1 text-sm" aria-label="Fixed until" />
            <button type="button" disabled={!date || pending} onClick={() => run(() => respondPriceWatch({ key: alert.key, itemId: alert.itemId, response: "fixed", fixedUntil: date }))}
              className="rounded-lg bg-slate-950 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">Save</button>
          </span>
        ) : null}
        {alert.addHref ? <Link href={alert.addHref} className="rounded-lg bg-slate-950 px-3 py-1.5 text-xs font-bold text-white">Add it</Link> : null}
        {alert.status !== "question" ? (
          <button type="button" disabled={pending} onClick={() => run(() => respondPriceWatch({ key: alert.key, itemId: alert.itemId, response: "dismissed" }))}
            className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-50 disabled:opacity-50">
            {alert.status === "missing" ? "I don't have this" : alert.canApply ? "Doesn't apply to me" : "Got it"}
          </button>
        ) : null}
        {error ? <span className="text-xs text-rose-600">{error}</span> : null}
      </div>
    </li>
  );
}

export function PriceWatchPanel({ alerts }: { alerts: PriceAlert[] }) {
  const [showAll, setShowAll] = useState(false);
  if (!alerts.length) return null;
  const yearly = alerts.reduce((sum, a) => sum + (a.next != null && a.current != null ? (a.next - a.current) * 12 : 0), 0);
  const shown = showAll ? alerts : alerts.slice(0, 4);
  return (
    <section className="rounded-[1.25rem] border border-slate-200 bg-slate-50/60 p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-950">Heads up on your bills</h2>
          <p className="mt-0.5 text-sm text-slate-500">
            Price changes coming up and gaps in your plan.{yearly > 0 ? ` The confirmed and forecast rises add up to about £${Math.round(yearly).toLocaleString("en-GB")} a year.` : ""}
          </p>
        </div>
      </div>
      <ul className="mt-4 grid gap-3 lg:grid-cols-2">
        {shown.map((alert) => <Alert key={alert.key} alert={alert} />)}
      </ul>
      {alerts.length > 4 ? (
        <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-3 text-xs font-semibold text-slate-600 underline">
          {showAll ? "Show fewer" : `Show all ${alerts.length}`}
        </button>
      ) : null}
    </section>
  );
}
