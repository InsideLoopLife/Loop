"use client";

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ModalFrame } from "@/components/ui/ModalFrame";
import { ConfirmSubmit } from "@/components/ui/ConfirmButton";
import { isLoopError } from "@/lib/actions/friendly";
import {
  shortDate, transferAmountInMonth, transferDatesInMonth, transferMonthlyAverage, transferScheduleLabel, WEEKDAYS,
  type StandingTransfer, type TransferFrequency,
} from "@/lib/accounts/standing-transfers";

type Person = { id: string; name: string; avatarUrl?: string | null };
type Account = { id: string; name: string; provider?: string | null; ownerPersonId?: string | null };
type Action = (formData: FormData) => Promise<void>;

const gbp = (value: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: value % 1 ? 2 : 0 }).format(value);

function monthName(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", { month: "long" }).format(new Date(y, m - 1, 1));
}

function Avatar({ person }: { person?: Person }) {
  // eslint-disable-next-line @next/next/no-img-element
  if (person?.avatarUrl) return <img src={person.avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover" />;
  return <span className="grid h-9 w-9 place-items-center rounded-full bg-sky-100 text-sm font-black text-sky-800">{(person?.name || "?").slice(0, 1).toUpperCase()}</span>;
}

export function JointPayIns({
  transfers, people, jointAccounts, personalAccounts, today, defaultPersonId, saveAction, removeAction,
}: {
  transfers: StandingTransfer[];
  people: Person[];
  jointAccounts: Account[];
  personalAccounts: Account[];
  today: string;
  defaultPersonId?: string | null;
  saveAction: Action;
  removeAction: Action;
}) {
  const [editing, setEditing] = useState<Partial<StandingTransfer> | null>(null);

  const month = today.slice(0, 7);
  const personById = new Map(people.map((p) => [p.id, p]));
  const accountName = (id: string | null | undefined) => [...jointAccounts, ...personalAccounts].find((a) => a.id === id)?.name;

  const byPerson = useMemo(() => {
    const groups = new Map<string, StandingTransfer[]>();
    for (const t of transfers) {
      const key = t.person_id || "none";
      groups.set(key, [...(groups.get(key) || []), t]);
    }
    return [...groups.entries()];
  }, [transfers]);
  const monthTotal = transfers.reduce((sum, t) => sum + transferAmountInMonth(t, month), 0);

  if (!jointAccounts.length) return null;

  return (
    <div className="mt-5 rounded-3xl border border-sky-100 bg-sky-50/50 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-base font-black text-slate-950">Who pays in</p>
          <p className="mt-0.5 text-sm font-semibold text-slate-600">
            {transfers.length
              ? `${gbp(monthTotal)} moves into joint accounts in ${monthName(month)}.`
              : "Add the regular transfers each of you makes into the joint account — like £150 every Friday."}
          </p>
        </div>
        <button type="button" onClick={() => setEditing({ person_id: defaultPersonId || people[0]?.id, to_account_id: jointAccounts[0]?.id, frequency: "weekly", weekday: 5, start_date: today })} className="rounded-full bg-slate-950 px-4 py-2 text-xs font-black text-white hover:bg-sky-700">
          ＋ Add a regular transfer
        </button>
      </div>

      {byPerson.length ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {byPerson.map(([personId, list]) => {
            const person = personById.get(personId);
            const thisMonth = list.reduce((sum, t) => sum + transferAmountInMonth(t, month), 0);
            const typical = list.reduce((sum, t) => sum + transferMonthlyAverage(t), 0);
            return (
              <div key={personId} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                <div className="flex items-center gap-3">
                  <Avatar person={person} />
                  <div className="min-w-0 flex-1">
                    <p className="font-black text-slate-950">{person?.name || "Someone"}</p>
                    <p className="text-xs font-bold text-slate-500">{gbp(thisMonth)} in {monthName(month)} · about {gbp(typical)} in a usual month</p>
                  </div>
                </div>
                <ul className="mt-3 space-y-2">
                  {list.map((t) => {
                    const dates = transferDatesInMonth(t, month);
                    const next = dates.find((d) => d >= today);
                    const from = accountName(t.from_account_id);
                    return (
                      <li key={t.id} className="rounded-xl bg-slate-50 p-3">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <p className="text-sm font-black text-slate-950">{gbp(t.amount)} {transferScheduleLabel(t)}</p>
                          <p className="text-xs font-bold text-slate-500">{from ? `${from} → ` : ""}{accountName(t.to_account_id) || "Joint account"}</p>
                        </div>
                        <p className="mt-1 text-xs font-semibold text-slate-600">
                          {dates.length ? `${monthName(month)}: ${dates.map(shortDate).join(", ")} · ${gbp(transferAmountInMonth(t, month))}` : `Nothing in ${monthName(month)}`}
                          {next ? ` · next ${shortDate(next)}` : ""}
                        </p>
                        {t.note ? <p className="mt-1 text-xs font-semibold text-slate-400">{t.note}</p> : null}
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <button type="button" onClick={() => setEditing(t)} className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100">Change</button>
                          <form action={removeAction}>
                            <input type="hidden" name="id" value={t.id} />
                            <ConfirmSubmit question="Stop this transfer?" detail="It comes out of Loop's plans from now on, including Spending → Split." confirmLabel="Yes, stop it" danger className="rounded-full px-3 py-1 text-xs font-black text-rose-600 hover:bg-rose-50">Stop</ConfirmSubmit>
                          </form>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      ) : null}

      {editing ? createPortal(
        <ModalFrame title={editing.id ? "Change regular transfer" : "Add a regular transfer"} description="Money one of you moves from your own leftover into a joint account." eyebrow="Joint account" maxWidth="max-w-xl" onClose={() => setEditing(null)}>
          <TransferForm
            initial={editing}
            people={people}
            jointAccounts={jointAccounts}
            personalAccounts={personalAccounts}
            today={today}
            onSubmit={async (fd) => {
              const result = (await saveAction(fd)) as unknown;
              if (!isLoopError(result)) setEditing(null);
            }}
          />
        </ModalFrame>,
        document.body,
      ) : null}
    </div>
  );
}

export function TransferForm({ initial, people, jointAccounts, personalAccounts, today, onSubmit }: {
  initial: Partial<StandingTransfer>;
  people: Person[];
  jointAccounts: Account[];
  personalAccounts: Account[];
  today: string;
  onSubmit: (fd: FormData) => Promise<void>;
}) {
  const [personId, setPersonId] = useState(initial.person_id || "");
  const [fromId, setFromId] = useState(initial.from_account_id || "");
  const [toId, setToId] = useState(initial.to_account_id || jointAccounts[0]?.id || "");
  const [amount, setAmount] = useState(initial.amount ? String(initial.amount) : "");
  const [frequency, setFrequency] = useState<TransferFrequency>(initial.frequency || "weekly");
  const [weekday, setWeekday] = useState(initial.weekday || 5);
  const [dayOfMonth, setDayOfMonth] = useState(initial.day_of_month || 1);
  const [startDate, setStartDate] = useState(initial.start_date || today);
  const [endDate, setEndDate] = useState(initial.end_date || "");
  const [note, setNote] = useState(initial.note || "");

  const ownAccounts = personalAccounts.filter((a) => a.ownerPersonId === personId);

  const preview: StandingTransfer = {
    id: "preview", person_id: personId, from_account_id: fromId || null, to_account_id: toId, amount: Number(amount || 0), frequency,
    weekday: frequency === "monthly" ? null : weekday, day_of_month: frequency === "monthly" ? dayOfMonth : null,
    start_date: startDate || today, end_date: endDate || null, note: null,
  };
  const month = today.slice(0, 7);
  const dates = transferDatesInMonth(preview, month);
  const personName = people.find((p) => p.id === personId)?.name || "They";
  const valid = personId && toId && Number(amount) > 0 && fromId !== toId;

  const field = "mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-950";
  const label = "text-xs font-black text-slate-600";

  return (
    <form action={onSubmit} className="space-y-4">
      {initial.id ? <input type="hidden" name="id" value={initial.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>Who
          <select name="person_id" value={personId} onChange={(e) => { const next = e.target.value; setPersonId(next); if (!personalAccounts.some((a) => a.id === fromId && a.ownerPersonId === next)) setFromId(""); }} className={field}>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className={label}>How much each time
          <input name="amount" type="number" step="0.01" min="0.01" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="150" className={field} />
        </label>
        <label className={label}>From
          <select name="from_account_id" value={fromId} onChange={(e) => setFromId(e.target.value)} className={field}>
            <option value="">Their own money (no account set)</option>
            {ownAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.provider ? ` · ${a.provider}` : ""}</option>)}
          </select>
        </label>
        <label className={label}>Into
          <select name="to_account_id" value={toId} onChange={(e) => setToId(e.target.value)} className={field}>
            {jointAccounts.map((a) => <option key={a.id} value={a.id}>{a.name}{a.provider ? ` · ${a.provider}` : ""}</option>)}
          </select>
        </label>
        <label className={label}>How often
          <select name="frequency" value={frequency} onChange={(e) => setFrequency(e.target.value as TransferFrequency)} className={field}>
            <option value="weekly">Every week</option>
            <option value="fortnightly">Every other week</option>
            <option value="four_weekly">Every 4 weeks</option>
            <option value="monthly">Once a month</option>
          </select>
        </label>
        {frequency === "monthly" ? (
          <label className={label}>Day of the month
            <input name="day_of_month" type="number" min="1" max="31" value={dayOfMonth} onChange={(e) => setDayOfMonth(Number(e.target.value))} className={field} />
          </label>
        ) : (
          <label className={label}>Day of the week
            <select name="weekday" value={weekday} onChange={(e) => setWeekday(Number(e.target.value))} className={field}>
              {WEEKDAYS.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}
            </select>
          </label>
        )}
        <label className={label}>{frequency === "fortnightly" || frequency === "four_weekly" ? "First transfer on or after" : "Starting"}
          <input name="start_date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={field} />
        </label>
        <label className={label}>Ending (optional)
          <input name="end_date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={field} />
        </label>
        <label className={`${label} sm:col-span-2`}>Note (optional)
          <input name="note" maxLength={140} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Household pot" className={field} />
        </label>
      </div>

      <div className="rounded-2xl bg-slate-950 p-4 text-white">
        <p className="text-sm font-black">{valid ? `${personName} moves ${gbp(Number(amount))} ${transferScheduleLabel(preview)}` : "Fill in who, how much and where"}</p>
        {valid ? (
          <p className="mt-1 text-xs font-semibold text-white/70">
            This month: {dates.length ? `${dates.map(shortDate).join(", ")} = ${gbp(transferAmountInMonth(preview, month))}` : "nothing yet"} · about {gbp(transferMonthlyAverage(preview))} in a usual month, out of {personName === "They" ? "their" : `${personName}'s`} leftover.
          </p>
        ) : null}
      </div>

      <div className="flex justify-end">
        <ConfirmSubmit
          disabled={!valid}
          question={initial.id ? "Save these changes?" : "Add this transfer?"}
          detail={`It changes what ${personName} has left each month and what Spending → Split shows as covered.`}
          confirmLabel="Yes, save it"
          className="rounded-full bg-slate-950 px-5 py-2.5 text-sm font-black text-white disabled:opacity-40"
        >
          Save transfer
        </ConfirmSubmit>
      </div>
    </form>
  );
}
