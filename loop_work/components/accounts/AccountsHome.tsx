"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowDownLeft, ArrowUpRight, ChevronLeft, ChevronRight, Plus, Settings2 } from "lucide-react";
import { ModalFrame } from "@/components/ui/ModalFrame";
import { ConfirmSubmit } from "@/components/ui/ConfirmButton";
import { FinancialInstitutionLogo } from "@/components/savings/FinancialInstitutionLogo";
import { JointPayIns } from "@/components/accounts/JointPayIns";
import { isLoopError } from "@/lib/actions/friendly";
import type { AccountActivity, AccountLine } from "@/lib/accounts/account-activity";
import type { StandingTransfer } from "@/lib/accounts/standing-transfers";
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

/** Where the balance is heading for the rest of the month, and the lowest point on the way. */
function forecast(account: AccountsHomeAccount, today: string, isCurrentMonth: boolean) {
  if (!isCurrentMonth) return null;
  let running = account.balance;
  let low = running;
  let lowDate: string | null = null;
  for (const line of account.activity.lines) {
    if (line.date && line.date < today) continue;
    running += line.direction === "in" ? line.amount : -line.amount;
    if (running < low) { low = running; lowDate = line.date; }
  }
  return { end: Math.round(running * 100) / 100, low: Math.round(low * 100) / 100, lowDate };
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

  const card = (account: AccountsHomeAccount) => (
    <AccountCard key={account.id} account={account} today={today} isCurrentMonth={isCurrentMonth} month={month} onSettings={() => setSettingsFor(account)} />
  );

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
          <div className="grid items-start gap-4 lg:grid-cols-2">{joint.map(card)}</div>
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
          <div className="grid items-start gap-4 lg:grid-cols-2">{list.map(card)}</div>
        </Group>
      ))}

      {other.length ? (
        <Group title="Other accounts" subtitle="Belonging to someone not listed as an adult in your household." icon={<Avatar person={null} />}>
          <div className="grid items-start gap-4 lg:grid-cols-2">{other.map(card)}</div>
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

function LineRow({ line }: { line: AccountLine }) {
  const isIn = line.direction === "in";
  return (
    <li className="flex items-center gap-3 py-2">
      <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${isIn ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
        {isIn ? <ArrowDownLeft className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-slate-900">{line.label}</span>
        <span className="block text-[11px] font-semibold text-slate-500">{niceDate(line.date)}{line.note ? ` · ${line.note}` : ""}</span>
      </span>
      <span className={`text-sm font-black tabular-nums ${isIn ? "text-emerald-700" : "text-slate-900"}`}>{isIn ? "+" : "−"}{gbp(line.amount)}</span>
    </li>
  );
}

function AccountCard({ account, today, isCurrentMonth, month, onSettings }: { account: AccountsHomeAccount; today: string; isCurrentMonth: boolean; month: string; onSettings: () => void }) {
  const [showAll, setShowAll] = useState(false);
  const [editingBalance, setEditingBalance] = useState(false);
  const { activity } = account;
  const ahead = forecast(account, today, isCurrentMonth);
  const upcoming = isCurrentMonth ? activity.lines.filter((l) => !l.date || l.date >= today) : activity.lines;
  const shown = showAll ? activity.lines : upcoming.slice(0, 4);
  const max = Math.max(activity.in, activity.out, 1);

  return (
    <article className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="p-5">
        <div className="flex items-start gap-3">
          <FinancialInstitutionLogo provider={account.providerSlug || account.provider} className="h-11 w-11 rounded-2xl" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-black text-slate-950">{account.name}</p>
            <p className="text-xs font-bold text-slate-500">{account.provider || "Bank"} · {account.kind === "everyday" ? "everyday account" : `savings${account.interestRate != null ? ` · ${account.interestRate.toFixed(2)}%` : ""}`}</p>
          </div>
          <div className="flex items-center gap-1.5">
            {ownershipChip(account)}
            <button type="button" onClick={onSettings} className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900" aria-label={`Settings for ${account.name}`}><Settings2 className="h-4 w-4" /></button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-3xl font-black tabular-nums text-slate-950">{gbp(account.balance)}</p>
            <p className="text-[11px] font-semibold text-slate-500">{checkedAgo(account.balanceConfirmedAt, today)}</p>
          </div>
          {account.kind === "everyday" ? (
            editingBalance ? (
              <form action={async (fd) => { const r = (await updateFinancialAccount(fd)) as unknown; if (!isLoopError(r)) setEditingBalance(false); }} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="id" value={account.id} />
                <input type="hidden" name="owner_person_id" value={account.ownerPersonId || ""} />
                <input type="hidden" name="ownership_scope" value={account.ownershipScope} />
                <input type="hidden" name="visibility_scope" value={account.shared ? "household" : "private"} />
                <input type="hidden" name="savings_limit_scope" value={account.joint ? "joint" : "individual"} />
                <input name="current_balance" type="number" step="0.01" defaultValue={account.balance} autoFocus className="w-32 rounded-xl border border-slate-200 px-3 py-2 text-sm font-black" aria-label="Balance today" />
                <ConfirmSubmit question="Update the balance?" detail="Totals and forecasts use the new figure." confirmLabel="Yes, update" className="rounded-xl bg-slate-950 px-3 py-2 text-xs font-black text-white">Save</ConfirmSubmit>
                <button type="button" onClick={() => setEditingBalance(false)} className="text-xs font-bold text-slate-500">Cancel</button>
              </form>
            ) : (
              <button type="button" onClick={() => setEditingBalance(true)} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-200">Update balance</button>
            )
          ) : (
            <Link href="/accounts?tab=accounts" className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-200">Rates & top-ups →</Link>
          )}
        </div>

        {activity.lines.length ? (
          <div className="mt-4 space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-bold">
              <span className="w-16 text-slate-500">In</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full bg-emerald-400" style={{ width: `${(activity.in / max) * 100}%` }} /></span>
              <span className="w-20 text-right font-black tabular-nums text-slate-900">{gbp(activity.in)}</span>
            </div>
            <div className="flex items-center gap-2 text-xs font-bold">
              <span className="w-16 text-slate-500">Out</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full bg-slate-700" style={{ width: `${(activity.out / max) * 100}%` }} /></span>
              <span className="w-20 text-right font-black tabular-nums text-slate-900">{gbp(activity.out)}</span>
            </div>
            <p className="pt-1 text-[11px] font-semibold text-slate-500">Planned for {monthLabel(month)}</p>
          </div>
        ) : null}

        {ahead && activity.lines.length ? (
          ahead.low < 0 ? (
            <p className="mt-3 rounded-2xl bg-rose-50 px-3 py-2 text-xs font-bold text-rose-800">Could go {gbp(-ahead.low)} overdrawn around {niceDate(ahead.lowDate)} unless more goes in first.</p>
          ) : (
            <p className="mt-3 rounded-2xl bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700">On track to end {monthLabel(month)} with about <span className="font-black text-slate-950">{gbp(ahead.end)}</span>.</p>
          )
        ) : null}
      </div>

      <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-3">
        {activity.lines.length ? (
          <>
            <p className="text-xs font-black text-slate-500">{showAll ? `Everything in ${monthLabel(month)}` : isCurrentMonth ? "Coming up" : `In ${monthLabel(month)}`}</p>
            {shown.length ? <ul className="divide-y divide-slate-100">{shown.map((line) => <LineRow key={line.key} line={line} />)}</ul> : <p className="py-2 text-xs font-semibold text-slate-500">Nothing else this month.</p>}
            {activity.lines.length > shown.length || showAll ? (
              <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-1 text-xs font-black text-sky-700">{showAll ? "Show less" : `See all ${activity.lines.length} for ${monthLabel(month)}`}</button>
            ) : null}
          </>
        ) : (
          <p className="text-xs font-semibold text-slate-500">Nothing planned in or out of this account yet. Choose it as the account when you add pay or a bill in <Link href="/spending" className="font-black text-slate-800 underline">Spending</Link>.</p>
        )}
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
