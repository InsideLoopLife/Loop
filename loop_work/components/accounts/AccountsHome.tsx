"use client";

import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowDownLeft, ArrowUpRight, ChevronLeft, ChevronRight, PiggyBank, Plus, Settings2 } from "lucide-react";
import { ModalFrame } from "@/components/ui/ModalFrame";
import { ConfirmSubmit } from "@/components/ui/ConfirmButton";
import { FinancialInstitutionLogo } from "@/components/savings/FinancialInstitutionLogo";
import { JointPayIns } from "@/components/accounts/JointPayIns";
import { isLoopError } from "@/lib/actions/friendly";
import type { AccountActivity, AccountLine } from "@/lib/accounts/account-activity";
import type { StandingTransfer } from "@/lib/accounts/standing-transfers";
import { balanceTimeline, type BalanceTimeline } from "@/lib/accounts/daily-balance";
import { deleteFinancialAccount, quickAddFinancialAccount, updateFinancialAccount } from "@/app/accounts/actions";
import { removeAccountTransfer, saveAccountTransfer } from "@/app/accounts/transfer-actions";
import { changeAccountOwner, renameAccount } from "@/app/bank-accounts/actions";

export type AccountsHomeAccount = {
  id: string;
  name: string;
  provider: string | null;
  providerSlug: string | null;
  kind: "everyday" | "savings";
  balance: number;
  balanceConfirmedAt: string | null;
  interestRate: number | null;
  rateEndsOn: string | null;
  monthlyTopUp: number;
  topUpDay: number | null;
  goalName: string | null;
  goalTarget: number | null;
  joint: boolean;
  ownerPersonId: string | null;
  shared: boolean;
  ownershipScope: string;
  activity: AccountActivity;
};

type Person = { id: string; name: string; avatarUrl: string | null };

const UK_BANKS = ["Barclays", "Chase", "First Direct", "Halifax", "HSBC", "Lloyds", "Monzo", "Nationwide", "NatWest", "Santander", "Starling", "TSB", "Revolut", "Virgin Money", "Co-operative Bank", "Metro Bank", "Kroo", "Chase UK"];

const gbp = (v: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: Math.abs(v % 1) > 0.001 ? 2 : 0, maximumFractionDigits: 2 }).format(v);

function monthLabel(month: string, style: "long" | "short" = "long") {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { month: style, year: style === "short" ? "numeric" : undefined }).format(new Date(y, m - 1, 1));
}

function shiftMonth(month: string, by: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function niceDate(iso: string | null) {
  if (!iso) return "This month";
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  return new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" }).format(d);
}

function checkedAgo(iso: string | null, today: string) {
  if (!iso) return "Balance not checked yet";
  const days = Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(iso)) / 86_400_000);
  if (days <= 0) return "Checked today";
  if (days === 1) return "Checked yesterday";
  if (days < 30) return `Checked ${days} days ago`;
  return `Checked ${Math.round(days / 30)} month${days >= 60 ? "s" : ""} ago`;
}

function Avatar({ person, size = "h-9 w-9" }: { person?: Person | null; size?: string }) {
  if (person?.avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={person.avatarUrl} alt="" className={`${size} rounded-full object-cover`} />;
  }
  return <span className={`grid ${size} place-items-center rounded-full bg-slate-900 text-sm font-black text-white`}>{(person?.name || "?").slice(0, 1).toUpperCase()}</span>;
}

export function AccountsHome({
  month, today, accounts, people, meId, hasHousehold, transfers, unassignedCount,
}: {
  month: string;
  today: string;
  accounts: AccountsHomeAccount[];
  people: Person[];
  meId: string | null;
  hasHousehold: boolean;
  transfers: StandingTransfer[];
  unassignedCount: number;
}) {
  const [adding, setAdding] = useState(false);
  const [settingsFor, setSettingsFor] = useState<AccountsHomeAccount | null>(null);
  const personById = new Map(people.map((p) => [p.id, p]));
  const isCurrentMonth = month === today.slice(0, 7);

  const joint = accounts.filter((a) => a.joint);
  const personal = people
    .map((person) => ({ person, accounts: accounts.filter((a) => !a.joint && a.ownerPersonId === person.id) }));
  const other = accounts.filter((a) => !a.joint && !personById.has(String(a.ownerPersonId)));
  const everydayTotal = accounts.filter((a) => a.kind === "everyday").reduce((s, a) => s + a.balance, 0);
  const savingsTotal = accounts.filter((a) => a.kind === "savings").reduce((s, a) => s + a.balance, 0);

  const grid = (list: AccountsHomeAccount[]) => {
    const everyday = list.filter((a) => a.kind === "everyday");
    const savings = list.filter((a) => a.kind === "savings");
    return (
      <div className="space-y-4">
        {everyday.length ? (
          <div className="grid items-start gap-4 xl:grid-cols-2">
            {everyday.map((account) => <AccountCard key={account.id} account={account} today={today} isCurrentMonth={isCurrentMonth} month={month} onSettings={() => setSettingsFor(account)} />)}
          </div>
        ) : null}
        {savings.length ? (
          <div>
            <p className="mb-2 text-xs font-black uppercase tracking-[0.14em] text-emerald-700">Savings · {gbp(savings.reduce((sum, a) => sum + a.balance, 0))}</p>
            <div className="grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {savings.map((account) => <SavingsCard key={account.id} account={account} today={today} onSettings={() => setSettingsFor(account)} />)}
            </div>
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-950">Your accounts</h1>
            <p className="mt-1 max-w-2xl text-sm font-semibold text-slate-600">Where your money sits, whose it is, and what goes in and out of each account.</p>
          </div>
          <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-2.5 text-sm font-black text-white hover:bg-sky-700">
            <Plus className="h-4 w-4" /> Add account
          </button>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-2xl bg-slate-50 px-4 py-2 font-bold text-slate-600">Everyday <span className="ml-1 font-black text-slate-950">{gbp(everydayTotal)}</span></span>
          {savingsTotal > 0 ? <span className="rounded-2xl bg-slate-50 px-4 py-2 font-bold text-slate-600">Savings <span className="ml-1 font-black text-slate-950">{gbp(savingsTotal)}</span></span> : null}
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-slate-50 p-1 text-xs font-black text-slate-700">
            <Link href={`/bank-accounts?month=${shiftMonth(month, -1)}`} className="rounded-full p-1.5 hover:bg-white" aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></Link>
            <span className="px-1">{monthLabel(month, "short")}</span>
            <Link href={`/bank-accounts?month=${shiftMonth(month, 1)}`} className="rounded-full p-1.5 hover:bg-white" aria-label="Next month"><ChevronRight className="h-4 w-4" /></Link>
          </span>
        </div>
        {unassignedCount > 0 ? (
          <p className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
            {unassignedCount} payment{unassignedCount === 1 ? "" : "s"} in {monthLabel(month)} {unassignedCount === 1 ? "doesn't" : "don't"} say which account {unassignedCount === 1 ? "it comes" : "they come"} from, so {unassignedCount === 1 ? "it isn't" : "they aren't"} counted below.{" "}
            <Link href={`/spending?month=${month}`} className="font-black underline">Set them in Spending</Link>
          </p>
        ) : null}
      </section>

      {!accounts.length ? (
        <section className="rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-lg font-black text-slate-950">No accounts yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm font-semibold text-slate-600">Add the accounts your pay goes into and your bills come out of — a joint account, and each of your own.</p>
          <button type="button" onClick={() => setAdding(true)} className="mt-4 rounded-full bg-slate-950 px-5 py-2.5 text-sm font-black text-white">Add your first account</button>
        </section>
      ) : null}

      {joint.length ? (
        <Group title="Joint" subtitle="Held together. Everyone in the household can see these." icon={<span className="grid h-9 w-9 place-items-center rounded-full bg-sky-100 text-sm font-black text-sky-800">J</span>}>
          {grid(joint)}
          <JointPayIns
            transfers={transfers}
            people={people}
            jointAccounts={joint.map((a) => ({ id: a.id, name: a.name, provider: a.provider }))}
            personalAccounts={accounts.filter((a) => !a.joint).map((a) => ({ id: a.id, name: a.name, provider: a.provider, ownerPersonId: a.ownerPersonId }))}
            today={today}
            defaultPersonId={meId}
            saveAction={saveAccountTransfer}
            removeAction={removeAccountTransfer}
          />
        </Group>
      ) : null}

      {personal.filter((g) => g.accounts.length).map(({ person, accounts: list }) => (
        <Group
          key={person.id}
          title={`${person.name}'s accounts`}
          subtitle={`In ${person.name}'s name. ${list.filter((a) => a.shared).length} of ${list.length} shared with the household.`}
          icon={<Avatar person={person} />}
        >
          {grid(list)}
        </Group>
      ))}

      {other.length ? (
        <Group title="Other accounts" subtitle="Belonging to someone not listed as an adult in your household." icon={<Avatar person={null} />}>
          {grid(other)}
        </Group>
      ) : null}

      {people.filter((p) => !personal.find((g) => g.person.id === p.id)?.accounts.length).length && accounts.length ? (
        <p className="text-sm font-semibold text-slate-500">
          No accounts yet for {people.filter((p) => !personal.find((g) => g.person.id === p.id)?.accounts.length).map((p) => p.name).join(" or ")}.{" "}
          <button type="button" onClick={() => setAdding(true)} className="font-black text-slate-800 underline">Add one</button>
        </p>
      ) : null}

      {adding ? createPortal(
        <ModalFrame title="Add an account" description="Three quick choices. You can change any of them later." eyebrow="Accounts" maxWidth="max-w-xl" onClose={() => setAdding(false)}>
          <AddAccountForm people={people} meId={meId} hasHousehold={hasHousehold} onDone={() => setAdding(false)} />
        </ModalFrame>,
        document.body,
      ) : null}

      {settingsFor ? createPortal(
        <ModalFrame title={settingsFor.name} description="Name, who it belongs to and who can see it." eyebrow="Account settings" maxWidth="max-w-xl" onClose={() => setSettingsFor(null)}>
          <AccountSettings account={settingsFor} people={people} hasHousehold={hasHousehold} onDone={() => setSettingsFor(null)} />
        </ModalFrame>,
        document.body,
      ) : null}
    </div>
  );
}

function Group({ title, subtitle, icon, children }: { title: string; subtitle: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-3">
        {icon}
        <div>
          <h2 className="text-lg font-black text-slate-950">{title}</h2>
          <p className="text-xs font-semibold text-slate-500">{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function ownershipChip(account: AccountsHomeAccount) {
  if (account.joint) return <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-black text-sky-800">Joint</span>;
  return account.shared
    ? <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-black text-emerald-800">Shared with household</span>
    : <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-700">Private</span>;
}

function LineRow({ line, after, scale, past }: { line: AccountLine; after: number | undefined; scale: number; past: boolean }) {
  const isIn = line.direction === "in";
  const negative = (after ?? 0) < 0;
  const width = after == null || scale <= 0 ? 0 : Math.min(100, (Math.abs(after) / scale) * 100);
  return (
    <li className={`grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-x-3 py-2 ${past ? "opacity-55" : ""}`}>
      <span className={`grid h-7 w-7 place-items-center rounded-full ${line.kind === "transfer" ? "bg-sky-50 text-sky-700" : isIn ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
        {isIn ? <ArrowDownLeft className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-bold text-slate-900">{line.label}</span>
        <span className="block text-[11px] font-semibold text-slate-500">{niceDate(line.date)}{line.kind === "transfer" ? " · transfer" : ""}{line.note ? ` · ${line.note}` : ""}</span>
      </span>
      <span className={`text-right text-sm font-black tabular-nums ${isIn ? "text-emerald-700" : "text-slate-900"}`}>{isIn ? "+" : "−"}{gbp(line.amount)}</span>
      {after != null ? (
        <span className="col-start-2 col-end-4 mt-1 flex items-center gap-2">
          <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
            <span className={`absolute inset-y-0 left-0 rounded-full ${negative ? "bg-rose-500" : "bg-sky-400"}`} style={{ width: `${width}%` }} />
          </span>
          <span className={`w-24 text-right text-[11px] font-black tabular-nums ${negative ? "text-rose-700" : "text-slate-500"}`}>{gbp(after)} after</span>
        </span>
      ) : null}
    </li>
  );
}

/** Balance at the end of each day: solid up to today, dashed after; hover a day to read it. */
function BalanceChart({ timeline, today, onPick, picked }: { timeline: BalanceTimeline; today: string; onPick: (date: string | null) => void; picked: string | null }) {
  const W = 320;
  const H = 96;
  const pad = 6;
  const values = timeline.days.map((d) => d.balance);
  const startOfMonth = timeline.days[0] ? timeline.days[0].balance - timeline.days[0].lines.reduce((s, l) => s + (l.direction === "in" ? l.amount : -l.amount), 0) : 0;
  const lo = Math.min(0, startOfMonth, ...values);
  const hi = Math.max(0, startOfMonth, ...values);
  const span = hi - lo || 1;
  const n = timeline.days.length;
  const x = (i: number) => pad + (i / Math.max(1, n - 1)) * (W - pad * 2);
  const y = (v: number) => pad + (1 - (v - lo) / span) * (H - pad * 2);
  const todayIndex = timeline.days.findIndex((d) => d.date === today);
  const point = (i: number) => `${x(i).toFixed(1)},${y(timeline.days[i].balance).toFixed(1)}`;
  const pathFor = (from: number, to: number) => {
    if (to < from) return "";
    let d = `M${point(from)}`;
    for (let i = from + 1; i <= to; i += 1) d += ` H${x(i).toFixed(1)} V${y(timeline.days[i].balance).toFixed(1)}`;
    return d;
  };
  const split = todayIndex >= 0 ? todayIndex : today < (timeline.days[0]?.date || "") ? 0 : n - 1;
  const zeroY = y(0);
  const pickedIndex = picked ? timeline.days.findIndex((d) => d.date === picked) : -1;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-24 w-full touch-none select-none"
      role="img"
      aria-label="Balance through the month"
      onPointerMove={(e) => {
        const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
        const ratio = (e.clientX - rect.left) / rect.width;
        const i = Math.max(0, Math.min(n - 1, Math.round(((ratio * W - pad) / (W - pad * 2)) * (n - 1))));
        onPick(timeline.days[i]?.date || null);
      }}
      onPointerLeave={() => onPick(null)}
    >
      <rect x={pad} y={zeroY} width={W - pad * 2} height={Math.max(0, H - pad - zeroY)} className="fill-rose-50" />
      <line x1={pad} x2={W - pad} y1={zeroY} y2={zeroY} className="stroke-rose-300" strokeWidth="1" strokeDasharray="2 3" />
      <path d={pathFor(0, split)} fill="none" className="stroke-slate-800" strokeWidth="2" />
      <path d={pathFor(split, n - 1)} fill="none" className="stroke-sky-500" strokeWidth="2" strokeDasharray="4 3" />
      {todayIndex >= 0 ? <line x1={x(todayIndex)} x2={x(todayIndex)} y1={pad} y2={H - pad} className="stroke-slate-300" strokeWidth="1" /> : null}
      {timeline.low && timeline.low.balance < 0 ? (() => {
        const i = timeline.days.findIndex((d) => d.date === timeline.low!.date);
        return i >= 0 ? <circle cx={x(i)} cy={y(timeline.low!.balance)} r="3.5" className="fill-rose-600" /> : null;
      })() : null}
      {pickedIndex >= 0 ? (
        <>
          <line x1={x(pickedIndex)} x2={x(pickedIndex)} y1={pad} y2={H - pad} className="stroke-slate-400" strokeWidth="1" />
          <circle cx={x(pickedIndex)} cy={y(timeline.days[pickedIndex].balance)} r="3.5" className="fill-slate-950" />
        </>
      ) : null}
    </svg>
  );
}

function AccountCard({ account, today, isCurrentMonth, month, onSettings }: { account: AccountsHomeAccount; today: string; isCurrentMonth: boolean; month: string; onSettings: () => void }) {
  const [showAll, setShowAll] = useState(false);
  const [editingBalance, setEditingBalance] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const { activity } = account;
  const timeline = useMemo(() => balanceTimeline({ month, balance: account.balance, checkedAt: account.balanceConfirmedAt, lines: activity.lines, today }), [month, account.balance, account.balanceConfirmedAt, activity.lines, today]);
  const allLines = timeline.days.flatMap((d) => d.lines);
  const upcoming = isCurrentMonth ? allLines.filter((l) => !l.date || l.date >= today) : allLines;
  const shown = showAll ? allLines : upcoming.slice(0, 5);
  const scale = Math.max(1, ...timeline.days.map((d) => Math.abs(d.balance)), ...allLines.map((l) => Math.abs(l.after)));
  const pickedDay = picked ? timeline.days.find((d) => d.date === picked) : null;
  const unset = account.balance === 0;
  const stale = account.balanceConfirmedAt ? Date.parse(`${today}T12:00:00Z`) - Date.parse(account.balanceConfirmedAt) > 7 * 86_400_000 : true;
  const nextIn = upcoming.find((l) => l.direction === "in");
  const low = timeline.low;
  const max = Math.max(activity.in, activity.out, 1);

  return (
    <article className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="p-5">
        <div className="flex items-start gap-3">
          <FinancialInstitutionLogo provider={account.providerSlug || account.provider} className="h-11 w-11 rounded-2xl" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-black text-slate-950">{account.name}</p>
            <p className="text-xs font-bold text-slate-500">{account.provider || "Bank"} · {account.joint ? "joint everyday account" : "everyday account"}</p>
          </div>
          <div className="flex items-center gap-1.5">
            {ownershipChip(account)}
            <button type="button" onClick={onSettings} className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900" aria-label={`Settings for ${account.name}`}><Settings2 className="h-4 w-4" /></button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">{isCurrentMonth && timeline.today != null && timeline.anchor !== today ? "Estimated today" : "Balance"}</p>
            <p className={`text-3xl font-black tabular-nums ${(isCurrentMonth && timeline.today != null ? timeline.today : account.balance) < 0 ? "text-rose-700" : "text-slate-950"}`}>{gbp(isCurrentMonth && timeline.today != null ? timeline.today : account.balance)}</p>
            <p className="text-[11px] font-semibold text-slate-500">
              {checkedAgo(account.balanceConfirmedAt, today)}{isCurrentMonth && timeline.today != null && timeline.anchor !== today ? ` at ${gbp(account.balance)}, plus what's gone in and out since` : ""}
            </p>
          </div>
          {editingBalance ? (
            <form action={async (fd) => { const r = (await updateFinancialAccount(fd)) as unknown; if (!isLoopError(r)) setEditingBalance(false); }} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="id" value={account.id} />
              <input type="hidden" name="owner_person_id" value={account.ownerPersonId || ""} />
              <input type="hidden" name="ownership_scope" value={account.ownershipScope} />
              <input type="hidden" name="visibility_scope" value={account.shared ? "household" : "private"} />
              <input type="hidden" name="savings_limit_scope" value={account.joint ? "joint" : "individual"} />
              <input name="current_balance" type="number" step="0.01" defaultValue={account.balance || ""} placeholder="Today's balance" autoFocus className="w-36 rounded-xl border border-slate-200 px-3 py-2 text-sm font-black" aria-label="Balance today" />
              <ConfirmSubmit question="Update the balance?" detail="Totals and the forecast start from this figure, as of today." confirmLabel="Yes, update" className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white">Save</ConfirmSubmit>
              <button type="button" onClick={() => setEditingBalance(false)} className="text-xs font-bold text-slate-500">Cancel</button>
            </form>
          ) : (
            <button type="button" onClick={() => setEditingBalance(true)} className={`rounded-full px-3 py-1.5 text-xs font-black ${unset || stale ? "bg-amber-100 text-amber-900 hover:bg-amber-200" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>Update balance</button>
          )}
        </div>

        {unset ? (
          <p className="mt-3 rounded-2xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900">This account&apos;s balance is £0 in Loop, so the line below starts from nothing. Add today&apos;s balance for a real picture.</p>
        ) : null}

        {activity.lines.length ? (
          <div className="mt-4 rounded-2xl bg-slate-50/80 p-3">
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <p className="font-black text-slate-700">{pickedDay ? niceDate(pickedDay.date) : `Balance each day · ${monthLabel(month)}`}</p>
              <p className={`font-black tabular-nums ${pickedDay && pickedDay.balance < 0 ? "text-rose-700" : "text-slate-900"}`}>{pickedDay ? gbp(pickedDay.balance) : `ends ${gbp(timeline.end)}`}</p>
            </div>
            <BalanceChart timeline={timeline} today={today} picked={picked} onPick={setPicked} />
            {pickedDay ? (
              <p className="text-[11px] font-semibold text-slate-500">{pickedDay.lines.length ? pickedDay.lines.map((l) => `${l.direction === "in" ? "+" : "−"}${gbp(l.amount)} ${l.label}`).join(" · ") : "Nothing in or out that day"}</p>
            ) : (
              <p className="flex flex-wrap gap-x-3 text-[11px] font-semibold text-slate-500">
                <span><span className="mr-1 inline-block h-0.5 w-3 bg-slate-800 align-middle" />so far</span>
                <span><span className="mr-1 inline-block h-0.5 w-3 border-t-2 border-dashed border-sky-500 align-middle" />expected</span>
                <span>hover or drag to see a day</span>
              </p>
            )}
          </div>
        ) : null}

        {activity.lines.length && low && low.balance < 0 ? (
          <p className="mt-3 rounded-2xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-800">
            Lowest point: <span className="font-black">{gbp(low.balance)}</span> on {niceDate(low.date)}{low.line ? `, after ${low.line.label} (−${gbp(low.line.amount)})` : ""}.
            {" "}{nextIn && nextIn.date && nextIn.date > low.date ? `Nothing comes in until ${nextIn.label} on ${niceDate(nextIn.date)}.` : !nextIn ? "Nothing is set to come into this account this month." : ""}
            {unset ? " The balance is £0 in Loop, which is probably why." : account.joint && !activity.lines.some((l) => l.kind === "transfer") ? " No regular transfers into it are set up yet — add them under Who pays in." : ""}
          </p>
        ) : activity.lines.length ? (
          <p className="mt-3 rounded-2xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700">
            {isCurrentMonth ? "On track to end" : "Ends"} {monthLabel(month)} with about <span className="font-black text-slate-950">{gbp(timeline.end)}</span>{low ? `; lowest ${gbp(low.balance)} on ${niceDate(low.date)}` : ""}.
          </p>
        ) : null}

        {activity.lines.length ? (
          <div className="mt-3 space-y-1">
            {([["In", activity.in, "bg-emerald-400"], ["Out", activity.out, "bg-slate-700"]] as const).map(([label, value, tone]) => (
              <div key={label} className="flex items-center gap-2 text-xs font-bold">
                <span className="w-10 text-slate-500">{label}</span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"><span className={`block h-full rounded-full ${tone}`} style={{ width: `${(value / max) * 100}%` }} /></span>
                <span className="w-20 text-right font-black tabular-nums text-slate-900">{gbp(value)}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-3">
        {activity.lines.length ? (
          <>
            <p className="text-xs font-black text-slate-500">{showAll ? `Everything in ${monthLabel(month)}, with the balance after each` : isCurrentMonth ? "Coming up, with the balance after each" : `In ${monthLabel(month)}`}</p>
            {shown.length ? <ul className="divide-y divide-slate-100">{shown.map((line) => <LineRow key={line.key} line={line} after={line.after} scale={scale} past={isCurrentMonth && Boolean(line.date && line.date < today)} />)}</ul> : <p className="py-2 text-xs font-semibold text-slate-500">Nothing else this month.</p>}
            {allLines.length > shown.length || showAll ? (
              <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-1 text-xs font-black text-sky-700">{showAll ? "Show less" : `See all ${allLines.length} for ${monthLabel(month)}`}</button>
            ) : null}
          </>
        ) : (
          <p className="text-xs font-semibold text-slate-500">Nothing planned in or out of this account yet. Choose it as the account when you add pay or a bill in <Link href="/spending" className="font-black text-slate-800 underline">Spending</Link>.</p>
        )}
      </div>
    </article>
  );
}

/** Savings work differently: no bills, just what's there, what it earns and what's going in. */
function SavingsCard({ account, today, onSettings }: { account: AccountsHomeAccount; today: string; onSettings: () => void }) {
  const monthlyInterest = account.interestRate ? (account.balance * account.interestRate) / 100 / 12 : 0;
  const goalPct = account.goalTarget && account.goalTarget > 0 ? Math.min(100, (account.balance / account.goalTarget) * 100) : null;
  const rateEnds = account.rateEndsOn ? new Date(`${account.rateEndsOn}T12:00:00Z`) : null;
  const rateEndsSoon = rateEnds ? rateEnds.getTime() - Date.parse(`${today}T12:00:00Z`) < 60 * 86_400_000 : false;
  return (
    <article className="rounded-3xl border border-emerald-100 bg-gradient-to-br from-emerald-50/80 via-white to-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="relative">
          <FinancialInstitutionLogo provider={account.providerSlug || account.provider} className="h-9 w-9 rounded-xl" />
          <PiggyBank className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-white p-0.5 text-emerald-700 ring-1 ring-emerald-100" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black text-slate-950">{account.name}</p>
          <p className="truncate text-[11px] font-bold text-slate-500">{account.provider || "Savings"}{account.joint ? " · joint" : account.shared ? "" : " · private"}</p>
        </div>
        <button type="button" onClick={onSettings} className="rounded-full p-1 text-slate-400 hover:bg-white hover:text-slate-900" aria-label={`Settings for ${account.name}`}><Settings2 className="h-4 w-4" /></button>
      </div>
      <p className="mt-3 text-2xl font-black tabular-nums text-slate-950">{gbp(account.balance)}</p>
      <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-black">
        {account.interestRate != null ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800">{account.interestRate.toFixed(2)}%</span> : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">No rate set</span>}
        {monthlyInterest > 0.005 ? <span className="rounded-full bg-white px-2 py-0.5 text-emerald-800 ring-1 ring-emerald-100">≈ {gbp(Math.round(monthlyInterest * 100) / 100)} a month</span> : null}
        {account.monthlyTopUp > 0 ? <span className="rounded-full bg-white px-2 py-0.5 text-slate-700 ring-1 ring-slate-200">+{gbp(account.monthlyTopUp)}{account.topUpDay ? ` on the ${account.topUpDay}${[, "st", "nd", "rd"][account.topUpDay % 10 > 3 || [11, 12, 13].includes(account.topUpDay) ? 0 : account.topUpDay % 10] || "th"}` : " a month"}</span> : null}
      </div>
      {goalPct != null ? (
        <div className="mt-3">
          <div className="flex justify-between text-[11px] font-bold text-slate-500"><span>{account.goalName || "Goal"}</span><span>{Math.round(goalPct)}% of {gbp(account.goalTarget || 0)}</span></div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-emerald-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${goalPct}%` }} /></div>
        </div>
      ) : null}
      {rateEnds ? <p className={`mt-2 text-[11px] font-bold ${rateEndsSoon ? "text-amber-800" : "text-slate-500"}`}>Rate ends {new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(rateEnds)}</p> : null}
      <div className="mt-3 flex items-center justify-between text-[11px] font-semibold text-slate-500">
        <span>{checkedAgo(account.balanceConfirmedAt, today)}</span>
        <Link href="/accounts?tab=accounts" className="font-black text-emerald-800 hover:underline">Manage →</Link>
      </div>
    </article>
  );
}

function Choice({ active, onClick, title, help, icon }: { active: boolean; onClick: () => void; title: string; help?: string; icon?: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`flex w-full items-start gap-3 rounded-2xl p-3 text-left ring-1 transition ${active ? "bg-sky-50 ring-2 ring-sky-500" : "bg-white ring-slate-200 hover:bg-slate-50"}`}>
      {icon}
      <span>
        <span className="block text-sm font-black text-slate-950">{title}</span>
        {help ? <span className="block text-xs font-semibold text-slate-500">{help}</span> : null}
      </span>
    </button>
  );
}

function AddAccountForm({ people, meId, hasHousehold, onDone }: { people: Person[]; meId: string | null; hasHousehold: boolean; onDone: () => void }) {
  const [owner, setOwner] = useState<string>(people.length > 1 ? "joint" : meId || people[0]?.id || "joint");
  const [kind, setKind] = useState<"everyday" | "savings">("everyday");
  const [bank, setBank] = useState("");
  const [name, setName] = useState("");
  const [balance, setBalance] = useState("");
  const [shared, setShared] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const ownerName = owner === "joint" ? null : people.find((p) => p.id === owner)?.name || null;
  const suggestedName = owner === "joint" ? `Joint account${bank ? ` (${bank})` : ""}` : `${ownerName ? `${ownerName}'s ` : ""}${bank || "current"} account`;
  const finalName = name.trim() || suggestedName;
  const label = "text-xs font-black uppercase tracking-wide text-slate-500";
  const field = "mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-950";

  return (
    <form
      action={async (fd) => {
        setError(null);
        const result = (await quickAddFinancialAccount(fd)) as unknown;
        if (isLoopError(result)) setError(result.__loopError);
        else onDone();
      }}
      className="space-y-5"
    >
      <div>
        <p className={label}>1 · Whose is it?</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {people.length > 1 || owner === "joint" ? <Choice active={owner === "joint"} onClick={() => setOwner("joint")} title="Joint" help="Held together" icon={<span className="grid h-8 w-8 place-items-center rounded-full bg-sky-100 text-xs font-black text-sky-800">J</span>} /> : null}
          {people.map((p) => <Choice key={p.id} active={owner === p.id} onClick={() => setOwner(p.id)} title={p.name} help="In their name" icon={<Avatar person={p} size="h-8 w-8" />} />)}
        </div>
      </div>

      <div>
        <p className={label}>2 · What kind?</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <Choice active={kind === "everyday"} onClick={() => setKind("everyday")} title="Everyday account" help="Pay goes in, bills come out" />
          <Choice active={kind === "savings"} onClick={() => setKind("savings")} title="Savings account" help="Interest, top-ups and goals" />
        </div>
      </div>

      {kind === "savings" ? (
        <div className="rounded-2xl bg-slate-50 p-4">
          <p className="text-sm font-bold text-slate-700">Savings accounts have a few more details — rate, when it ends, regular top-ups — so they&apos;re added in Savings &amp; pots.</p>
          <Link href="/accounts?tab=add" className="mt-3 inline-block rounded-full bg-slate-950 px-4 py-2 text-xs font-black text-white">Add a savings account →</Link>
        </div>
      ) : (
        <>
          <div>
            <p className={label}>3 · The details</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-black text-slate-600">Bank
                <input list="loop-uk-banks" value={bank} onChange={(e) => setBank(e.target.value)} placeholder="e.g. Monzo" className={field} />
                <datalist id="loop-uk-banks">{UK_BANKS.map((b) => <option key={b} value={b} />)}</datalist>
              </label>
              <label className="text-xs font-black text-slate-600">Balance today
                <input type="number" step="0.01" inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} placeholder="0" className={field} />
              </label>
              <label className="text-xs font-black text-slate-600 sm:col-span-2">Name (optional)
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder={suggestedName} maxLength={80} className={field} />
              </label>
            </div>
          </div>

          {owner !== "joint" && hasHousehold ? (
            <div>
              <p className={label}>Who can see it?</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <Choice active={shared} onClick={() => setShared(true)} title="The household" help="Counts in household totals" />
                <Choice active={!shared} onClick={() => setShared(false)} title={`Only ${ownerName || "them"}`} help="Kept out of others' totals" />
              </div>
            </div>
          ) : null}

          <input type="hidden" name="account_type" value="current_account" />
          <input type="hidden" name="owner_person_id" value={owner === "joint" ? "" : owner} />
          <input type="hidden" name="ownership_scope" value={owner === "joint" ? "joint" : "personal"} />
          <input type="hidden" name="savings_limit_scope" value={owner === "joint" ? "joint" : "individual"} />
          <input type="hidden" name="visibility_scope" value={owner === "joint" || shared ? "household" : "private"} />
          <input type="hidden" name="name" value={finalName} />
          <input type="hidden" name="provider" value={bank.trim()} />
          <input type="hidden" name="current_balance" value={balance || "0"} />

          <div className="rounded-2xl bg-slate-950 p-4 text-white">
            <p className="text-sm font-black">{finalName}</p>
            <p className="mt-0.5 text-xs font-semibold text-white/70">
              {owner === "joint" ? "Joint · everyone in the household sees it" : `${ownerName}'s · ${shared || !hasHousehold ? "shared with the household" : `only ${ownerName} sees it`}`} · {gbp(Number(balance || 0))} today
            </p>
          </div>
          {error ? <p role="alert" className="rounded-2xl bg-rose-50 px-4 py-2 text-sm font-bold text-rose-800">{error}</p> : null}
          <div className="flex justify-end">
            <ConfirmSubmit disabled={!bank.trim()} question="Add this account?" detail="It counts in your totals straight away." confirmLabel="Yes, add it" className="rounded-full bg-slate-950 px-5 py-2.5 text-sm font-black text-white disabled:opacity-40">Add account</ConfirmSubmit>
          </div>
        </>
      )}
    </form>
  );
}

function AccountSettings({ account, people, hasHousehold, onDone }: { account: AccountsHomeAccount; people: Person[]; hasHousehold: boolean; onDone: () => void }) {
  const [owner, setOwner] = useState(account.joint ? "joint" : account.ownerPersonId || "joint");
  const [shared, setShared] = useState(account.shared);
  const [error, setError] = useState<string | null>(null);
  const ownerName = owner === "joint" ? null : people.find((p) => p.id === owner)?.name || "them";
  const ownerChanged = owner !== (account.joint ? "joint" : account.ownerPersonId) || (owner !== "joint" && shared !== account.shared);
  const field = "mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-950";
  const run = (action: (fd: FormData) => Promise<void>) => async (fd: FormData) => {
    setError(null);
    const result = (await action(fd)) as unknown;
    if (isLoopError(result)) setError(result.__loopError);
    else onDone();
  };

  return (
    <div className="space-y-6">
      {error ? <p role="alert" className="rounded-2xl bg-rose-50 px-4 py-2 text-sm font-bold text-rose-800">{error}</p> : null}

      <form action={run(renameAccount)} className="space-y-3">
        <p className="text-xs font-black uppercase tracking-wide text-slate-500">Name</p>
        <input type="hidden" name="id" value={account.id} />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-black text-slate-600">Account name<input name="name" defaultValue={account.name} maxLength={80} className={field} /></label>
          <label className="text-xs font-black text-slate-600">Bank<input name="provider" list="loop-uk-banks-settings" defaultValue={account.provider || ""} maxLength={80} className={field} /></label>
          <datalist id="loop-uk-banks-settings">{UK_BANKS.map((b) => <option key={b} value={b} />)}</datalist>
        </div>
        <div className="flex justify-end"><button className="rounded-full bg-slate-100 px-4 py-2 text-xs font-black text-slate-800 hover:bg-slate-200">Save name</button></div>
      </form>

      <form action={run(changeAccountOwner)} className="space-y-3 border-t border-slate-100 pt-5">
        <p className="text-xs font-black uppercase tracking-wide text-slate-500">Whose is it?</p>
        <input type="hidden" name="id" value={account.id} />
        <input type="hidden" name="owner" value={owner} />
        <input type="hidden" name="visibility_scope" value={owner === "joint" || shared ? "household" : "private"} />
        <div className="grid gap-2 sm:grid-cols-2">
          <Choice active={owner === "joint"} onClick={() => setOwner("joint")} title="Joint" help="Held together · everyone sees it" />
          {people.map((p) => <Choice key={p.id} active={owner === p.id} onClick={() => setOwner(p.id)} title={p.name} help="In their name" />)}
        </div>
        {owner !== "joint" && hasHousehold ? (
          <>
            <p className="pt-2 text-xs font-black uppercase tracking-wide text-slate-500">Who can see it?</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Choice active={shared} onClick={() => setShared(true)} title="The household" help="Counts in household totals" />
              <Choice active={!shared} onClick={() => setShared(false)} title={`Only ${ownerName}`} help="Kept out of others' totals" />
            </div>
          </>
        ) : null}
        <div className="flex justify-end">
          <ConfirmSubmit
            disabled={!ownerChanged}
            question="Change who it belongs to?"
            detail="Household totals, Split and who can see this account (and its history) change."
            confirmLabel="Yes, change it"
            className="rounded-full bg-slate-950 px-4 py-2 text-xs font-black text-white disabled:opacity-40"
          >
            Save
          </ConfirmSubmit>
        </div>
      </form>

      <form action={run(deleteFinancialAccount)} className="flex items-center justify-between gap-3 border-t border-slate-100 pt-5">
        <input type="hidden" name="id" value={account.id} />
        <p className="text-xs font-semibold text-slate-500">Closed this account?</p>
        <ConfirmSubmit question="Delete this account?" detail="Its balance and history go, regular transfers into it stop, and payments that used it lose their account. This can't be undone." confirmLabel="Delete it" danger className="rounded-full bg-rose-50 px-4 py-2 text-xs font-black text-rose-700 hover:bg-rose-100">Delete account</ConfirmSubmit>
      </form>
    </div>
  );
}
