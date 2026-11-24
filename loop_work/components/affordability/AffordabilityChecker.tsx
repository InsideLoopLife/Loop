"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CheckCircle2, CircleAlert, CircleX } from "lucide-react";
import { ConfirmSubmit } from "@/components/ui/ConfirmButton";
import { createSavingsPot } from "@/app/accounts/actions";
import { isLoopError } from "@/lib/actions/friendly";
import { checkMonthly, checkOneOff, type ForecastMonth, type Verdict } from "@/lib/planning/affordability";

const gbp = (v: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(v);

function monthLabel(month: string, style: "long" | "short" = "long") {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { month: style, year: "numeric" }).format(new Date(y, m - 1, 1));
}

function lastDay(month: string) {
  const [y, m] = month.split("-").map(Number);
  return `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
}

const VERDICT: Record<Verdict, { title: string; tone: string; icon: typeof CheckCircle2 }> = {
  yes: { title: "Yes, you can afford it", tone: "bg-emerald-50 text-emerald-900 ring-emerald-200", icon: CheckCircle2 },
  tight: { title: "Yes, but it's tight", tone: "bg-amber-50 text-amber-900 ring-amber-200", icon: CircleAlert },
  not_yet: { title: "Not yet", tone: "bg-rose-50 text-rose-900 ring-rose-200", icon: CircleX },
};

export function AffordabilityChecker({ months, forecast, savingsNow, buffer, bufferBasis, bufferMonthly }: {
  months: string[];
  forecast: ForecastMonth[];
  savingsNow: number;
  buffer: number;
  bufferBasis: "essential" | "all";
  bufferMonthly: number;
}) {
  const [what, setWhat] = useState("");
  const [cost, setCost] = useState("");
  const [mode, setMode] = useState<"one_off" | "monthly">("one_off");
  const [when, setWhen] = useState(months[Math.min(5, months.length - 1)]);
  const [length, setLength] = useState("36");
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const amount = Number(cost) || 0;
  const name = what.trim() || (mode === "one_off" ? "this purchase" : "this cost");

  const result = useMemo(() => {
    if (!(amount > 0)) return null;
    return mode === "one_off"
      ? checkOneOff({ cost: amount, when, savingsNow, forecast, buffer })
      : checkMonthly({ cost: amount, when, months: Number(length), forecast });
  }, [amount, mode, when, savingsNow, forecast, buffer, length]);

  const field = "mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-950";
  const label = "text-xs font-black text-slate-600";

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-2xl font-black text-slate-950">Can I afford it?</h1>
        <p className="mt-1 text-sm font-semibold text-slate-600">Tell LOOP what you&apos;re thinking of buying. It checks your own plan — savings now and what&apos;s left over each month — and answers straight away.</p>
        <div className="mt-5 space-y-4">
          <label className={label}>What is it?<input value={what} onChange={(e) => setWhat(e.target.value)} placeholder="e.g. New car, kitchen, holiday" maxLength={60} className={field} /></label>
          <div className="grid grid-cols-2 gap-2">
            {(["one_off", "monthly"] as const).map((m) => (
              <button key={m} type="button" onClick={() => setMode(m)} className={`rounded-2xl px-3 py-2.5 text-left text-sm font-black ring-1 ${mode === m ? "bg-slate-950 text-white ring-slate-950" : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"}`}>
                {m === "one_off" ? "Pay in one go" : "Pay monthly"}
                <span className={`block text-[11px] font-semibold ${mode === m ? "text-white/70" : "text-slate-500"}`}>{m === "one_off" ? "Cash, deposit, one-off" : "Finance, a new bill"}</span>
              </button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={label}>{mode === "one_off" ? "How much" : "How much a month"}<input type="number" min="0" step="1" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder={mode === "one_off" ? "8000" : "250"} className={field} /></label>
            <label className={label}>{mode === "one_off" ? "When" : "Starting"}
              <select value={when} onChange={(e) => setWhen(e.target.value)} className={field}>
                {months.map((m, i) => <option key={m} value={m}>{i === 0 ? `This month (${monthLabel(m, "short")})` : monthLabel(m)}</option>)}
              </select>
            </label>
            {mode === "monthly" ? (
              <label className={`${label} sm:col-span-2`}>For how long
                <select value={length} onChange={(e) => setLength(e.target.value)} className={field}>
                  {[["12", "1 year"], ["24", "2 years"], ["36", "3 years"], ["0", "Ongoing (checks the next 3 years)"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
            ) : null}
          </div>
        </div>
        <details className="mt-5 rounded-2xl bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-600">
          <summary className="cursor-pointer font-black text-slate-800">What LOOP counts</summary>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            <li>Savings now: <span className="font-black text-slate-900">{gbp(savingsNow)}</span> (savings accounts — not pensions or investments).</li>
            <li>What&apos;s left over each month after bills and saving, from your plan in Spending — assuming it&apos;s kept, not spent. If you usually spend some of it, the real answer is tighter.</li>
            <li>It keeps <span className="font-black text-slate-900">{gbp(buffer)}</span> back as a safety net — 3 months of {bufferBasis === "essential" ? "essential bills" : "bills"} ({gbp(bufferMonthly)} a month).</li>
          </ul>
        </details>
      </section>

      <section className="space-y-4">
        {!result ? (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white/70 p-8 text-center">
            <p className="text-lg font-black text-slate-950">Add a cost to see the answer</p>
            <p className="mx-auto mt-1 max-w-md text-sm font-semibold text-slate-600">For example: a £8,000 car next summer, or a £250 a month car lease from January.</p>
          </div>
        ) : (
          <>
            {(() => {
              const v = VERDICT[result.verdict];
              const Icon = v.icon;
              let line = "";
              if (result.mode === "one_off") {
                if (result.verdict === "yes") line = `In ${monthLabel(when)} you'd have about ${gbp(result.available)}. After ${gbp(amount)} on ${name}, ${gbp(result.afterPurchase)} is left — more than your ${gbp(result.buffer)} safety net.`;
                else if (result.verdict === "tight") line = `You'd have about ${gbp(result.available)} in ${monthLabel(when)}, so you could pay ${gbp(amount)} — but only ${gbp(result.afterPurchase)} would be left, less than your ${gbp(result.buffer)} safety net.`;
                else line = `In ${monthLabel(when)} you'd have about ${gbp(result.available)} — ${gbp(amount - result.available)} short of ${gbp(amount)}.`;
              } else {
                if (result.verdict === "yes") line = `After ${gbp(amount)} a month, your tightest month (${result.worstMonth ? monthLabel(result.worstMonth) : "—"}) still has ${gbp(result.worstLeft)} left over.`;
                else if (result.verdict === "tight") line = `It fits, but your tightest month (${result.worstMonth ? monthLabel(result.worstMonth) : "—"}) would only have ${gbp(result.worstLeft)} left over.`;
                else line = `In ${result.worstMonth ? monthLabel(result.worstMonth) : "at least one month"} you'd be ${gbp(-result.worstLeft)} short after paying ${gbp(amount)}.`;
              }
              return (
                <div className={`rounded-3xl p-5 ring-1 ${v.tone}`}>
                  <p className="flex items-center gap-2 text-xl font-black"><Icon className="h-6 w-6" /> {v.title}</p>
                  <p className="mt-2 text-sm font-semibold">{line}</p>
                  <p className="mt-1 text-xs font-semibold opacity-75">Based on your savings and what&apos;s left over each month in your plan, if you keep it.</p>
                  {result.mode === "one_off" && result.verdict !== "yes" ? (
                    <p className="mt-2 text-sm font-semibold">
                      {result.earliestMonth ? <>Keeping your safety net, the earliest it works is <span className="font-black">{monthLabel(result.earliestMonth)}</span>. </> : <>It doesn&apos;t work within the next three years on your current plan. </>}
                      {result.extraPerMonth ? <>To make {monthLabel(when)}, put aside about <span className="font-black">{gbp(result.extraPerMonth)} a month</span> more from now.</> : null}
                    </p>
                  ) : null}
                </div>
              );
            })()}

            {result.mode === "one_off" ? (
              <div className="rounded-3xl border border-slate-200 bg-white p-5">
                <p className="text-sm font-black text-slate-950">Money available each month</p>
                <p className="text-xs font-semibold text-slate-500">Savings now plus what&apos;s left over each month. The line is {gbp(amount)} plus your safety net.</p>
                {(() => {
                  const path = result.path.slice(0, Math.max(12, result.path.findIndex((p) => p.month === when) + 4));
                  const max = Math.max(amount + result.buffer, ...path.map((p) => p.available), 1);
                  const min = Math.min(0, ...path.map((p) => p.available));
                  const span = max - min;
                  const goal = amount + result.buffer;
                  return (
                    <div className="mt-4">
                      <div className="relative flex h-40 items-end gap-1">
                        <div className="absolute inset-x-0 border-t-2 border-dashed border-slate-400" style={{ bottom: `${((goal - min) / span) * 100}%` }} />
                        {path.map((p) => (
                          <div key={p.month} className="group relative flex-1" style={{ height: `${(Math.max(0, p.available - min) / span) * 100}%` }} title={`${monthLabel(p.month)}: ${gbp(p.available)}`}>
                            <div className={`h-full rounded-t-md ${p.month === when ? "bg-slate-950" : p.available >= goal ? "bg-emerald-400" : "bg-slate-200"}`} />
                          </div>
                        ))}
                      </div>
                      <div className="mt-1 flex gap-1 text-[10px] font-bold text-slate-400">
                        {path.map((p, i) => <span key={p.month} className="flex-1 text-center">{i % 3 === 0 || p.month === when ? monthLabel(p.month, "short").replace(" 20", " ’") : ""}</span>)}
                      </div>
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div className="rounded-3xl border border-slate-200 bg-white p-5">
                <p className="text-sm font-black text-slate-950">Left over each month, after {gbp(amount)}</p>
                <ul className="mt-3 grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
                  {result.rows.slice(0, 12).map((r) => (
                    <li key={r.month} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-xs font-bold">
                      <span className="text-slate-600">{monthLabel(r.month, "short")}</span>
                      <span className={`tabular-nums ${r.leftAfter < 0 ? "text-rose-700" : r.leftAfter < result.comfortable ? "text-amber-700" : "text-slate-900"}`}>{gbp(r.leftAfter)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {result.mode === "one_off" ? (
              <form
                action={async (fd) => { setError(null); const r = (await createSavingsPot(fd)) as unknown; if (isLoopError(r)) setError(r.__loopError); else setSaved(name); }}
                className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-slate-200 bg-white p-5"
              >
                <input type="hidden" name="name" value={what.trim() || "Savings goal"} />
                <input type="hidden" name="target_amount" value={amount} />
                <input type="hidden" name="target_date" value={lastDay(when)} />
                <input type="hidden" name="visibility_scope" value="household" />
                <div>
                  <p className="text-sm font-black text-slate-950">{saved ? `Saving for ${saved} — done` : "Make it a savings goal"}</p>
                  <p className="text-xs font-semibold text-slate-500">{saved ? <>It&apos;s in <Link href="/accounts?tab=savings" className="font-black underline">Savings &amp; pots</Link>. Link it to an account there, or from Accounts.</> : `A pot for ${gbp(amount)} by ${monthLabel(when)} — LOOP works out the monthly amount.`}</p>
                  {error ? <p role="alert" className="mt-1 text-xs font-bold text-rose-700">{error}</p> : null}
                </div>
                {saved ? null : (
                  <ConfirmSubmit question={`Create a savings pot for ${name}?`} detail={`Target ${gbp(amount)} by ${monthLabel(when)}. It shows in Savings & pots.`} confirmLabel="Yes, create it" className="rounded-full bg-slate-950 px-4 py-2 text-xs font-black text-white">Start saving for it</ConfirmSubmit>
                )}
              </form>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
