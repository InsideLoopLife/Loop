// The month in plain words: why the money left over moved since last month,
// what's coming in the months ahead, and how long savings would last.
import Link from "next/link";
import type { MoneyDriver, OutlookItem } from "@/lib/planning/plain-money";

const pounds = (n: number) => `£${Math.round(Math.abs(n)).toLocaleString("en-GB")}`;

function Effect({ value }: { value: number }) {
  const good = value >= 0;
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${good ? "bg-emerald-50 text-[var(--pine)]" : "bg-rose-50 text-[var(--brick)]"}`}>
      {good ? "+" : "−"}{pounds(value)}
    </span>
  );
}

export function PlainMonthPanel({
  monthLabel,
  previousLabel,
  change,
  drivers,
  ahead,
  savingsBalance,
  monthlyCost,
  essentialsOnly,
}: {
  monthLabel: string;
  previousLabel: string;
  change: number;
  drivers: MoneyDriver[];
  ahead: OutlookItem[];
  savingsBalance: number;
  monthlyCost: number;
  essentialsOnly: boolean;
}) {
  const months = monthlyCost > 0 ? savingsBalance / monthlyCost : 0;
  const shortMonth = ahead.find((item) => item.surplus < 0);
  const short = (label: string) => label.split(" ")[0];
  return (
    <section className="grid gap-3 lg:grid-cols-3">
      <div className="rounded-[14px] border border-[var(--line)] bg-white p-5">
        <p className="text-sm font-semibold text-[var(--ink)]">Why {short(monthLabel)} is different</p>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {Math.abs(change) < 5
            ? `About the same as ${short(previousLabel)}.`
            : `${pounds(change)} ${change > 0 ? "more" : "less"} left over than ${short(previousLabel)}.`}
        </p>
        {drivers.length ? (
          <ul className="mt-3 space-y-2">
            {drivers.map((driver) => (
              <li key={driver.key} className="flex items-start justify-between gap-3 text-sm">
                <span className="min-w-0 text-[var(--ink)]">
                  {driver.text}
                  {driver.yearly != null && Math.abs(driver.yearly) >= 60 ? <span className="block text-xs text-[var(--muted)]">{pounds(driver.yearly)} a year if it stays</span> : null}
                </span>
                <Effect value={driver.effect} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-[var(--muted)]">Same bills and pay as last month.</p>
        )}
      </div>

      <div className="rounded-[14px] border border-[var(--line)] bg-white p-5">
        <p className="text-sm font-semibold text-[var(--ink)]">Coming up</p>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {shortMonth
            ? `${short(shortMonth.label)} looks ${pounds(shortMonth.surplus)} short. Worth planning for now.`
            : ahead.length
              ? "Changes in the next six months, so nothing's a surprise."
              : "The next six months look steady."}
        </p>
        {ahead.length ? (
          <ul className="mt-3 space-y-2">
            {ahead.map((item) => (
              <li key={item.month} className="flex items-start justify-between gap-3 text-sm">
                <span className="min-w-0 text-[var(--ink)]">
                  <span className="font-semibold">{item.lasting ? `From ${short(item.label)}` : `In ${short(item.label)}`}:</span> {item.text}
                  <span className="block text-xs text-[var(--muted)]">{item.surplus >= 0 ? `${pounds(item.surplus)} left over that month` : `${pounds(item.surplus)} short that month`}</span>
                </span>
                <Effect value={item.effect} />
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="rounded-[14px] border border-[var(--line)] bg-white p-5">
        <p className="text-sm font-semibold text-[var(--ink)]">If money stopped coming in</p>
        {monthlyCost > 0 && savingsBalance > 0 ? (
          <>
            <p className="mt-2 text-[28px] font-semibold leading-none tracking-tight text-[var(--ink)]">{months >= 1 ? `${months.toFixed(1)} months` : `${Math.round(months * 30)} days`}</p>
            <p className="mt-2 text-sm text-[var(--muted)]">
              Your savings of {pounds(savingsBalance)} would cover {essentialsOnly ? "essential bills" : "bills and spending"} of {pounds(monthlyCost)} a month for that long.
              {months < 3 ? " Building this towards three months is a good first goal." : months >= 6 ? " That's a strong safety net." : ""}
            </p>
          </>
        ) : (
          <p className="mt-2 text-sm text-[var(--muted)]">Add your savings accounts to see how long they&apos;d cover your bills.</p>
        )}
        {!essentialsOnly && monthlyCost > 0 ? (
          <Link href="/spending/categories" className="mt-3 inline-block text-xs font-semibold text-[var(--muted)] underline">Mark which bills are essential for a truer figure</Link>
        ) : null}
      </div>
    </section>
  );
}
