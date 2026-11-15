"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CakeSlice, CalendarDays, ChevronLeft, ChevronRight, Flag, Landmark, Loader2, Plus, School, Tag, Trash2, Utensils, Wallet, X } from "lucide-react";
import type { CalendarDateItem, CalendarDay, CalendarMonth } from "@/lib/calendar/month-view";
import { addCalendarEvent, deleteCalendarEvent } from "@/app/calendar/actions";

type Layer = "money" | "food" | "dates" | "events";
const LAYERS: Array<{ key: Layer; label: string; icon: typeof Wallet }> = [
  { key: "money", label: "Money", icon: Wallet },
  { key: "food", label: "Food", icon: Utensils },
  { key: "dates", label: "Big dates", icon: Flag },
  { key: "events", label: "Events", icon: CalendarDays },
];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function gbp(value: number, opts: { sign?: boolean; whole?: boolean } = {}) {
  const abs = Math.abs(value);
  const text = abs.toLocaleString("en-GB", { style: "currency", currency: "GBP", minimumFractionDigits: opts.whole ? 0 : 2, maximumFractionDigits: opts.whole ? 0 : 2 });
  if (opts.sign) return `${value < 0 ? "−" : "+"}${text}`;
  return value < 0 ? `−${text}` : text;
}

function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

function dayHeading(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

function scoreTone(score: number) {
  return score >= 75 ? "bg-emerald-500" : score >= 55 ? "bg-amber-400" : "bg-rose-500";
}

const DATE_STYLE: Record<CalendarDateItem["kind"], { icon: typeof Flag; tone: string }> = {
  birthday: { icon: CakeSlice, tone: "bg-pink-100 text-pink-800" },
  school_holiday: { icon: School, tone: "bg-sky-100 text-sky-800" },
  bank_holiday: { icon: Landmark, tone: "bg-violet-100 text-violet-800" },
  price_change: { icon: Tag, tone: "bg-amber-100 text-amber-900" },
  ending: { icon: Flag, tone: "bg-slate-200 text-slate-800" },
  deal_end: { icon: AlertTriangle, tone: "bg-orange-100 text-orange-900" },
  childcare: { icon: School, tone: "bg-emerald-100 text-emerald-800" },
};

/** Filters one day down to the chosen person and layers. */
function viewDay(day: CalendarDay, person: string, layers: Set<Layer>, children: Set<string>) {
  const forPerson = (personId: string | null | undefined) => person === "__all__" || !personId || personId === person;
  return {
    ...day,
    money: layers.has("money") ? day.money.filter((item) => forPerson(item.personId)) : [],
    food: layers.has("food") ? day.food.filter((item) => person === "__all__" || item.personId === person) : [],
    dates: layers.has("dates") ? day.dates.filter((item) => (item.kind === "school_holiday" ? person === "__all__" || children.has(person) : forPerson(item.personId))) : [],
    events: layers.has("events") ? day.events.filter((item) => forPerson(item.personId)) : [],
  };
}

export function LoopCalendar({ data, initialPerson, initialDay }: { data: CalendarMonth; initialPerson: string; initialDay: string | null }) {
  const [person, setPerson] = useState(initialPerson);
  const [layers, setLayers] = useState<Set<Layer>>(new Set(["money", "food", "dates", "events"]));
  const [openDay, setOpenDay] = useState<string | null>(initialDay);
  const [showEmpty, setShowEmpty] = useState(false);
  const children = useMemo(() => new Set(data.people.filter((p) => p.isChild).map((p) => p.id)), [data.people]);
  const days = useMemo(() => data.days.map((day) => viewDay(day, person, layers, children)), [data.days, person, layers, children]);
  const leadingBlanks = (new Date(`${data.days[0].date}T12:00:00Z`).getUTCDay() + 6) % 7;
  const personName = (id: string | null) => data.people.find((p) => p.id === id)?.name || null;
  const active = openDay ? days.find((day) => day.date === openDay) || null : null;
  const lowestDay = days.reduce<CalendarDay | null>((low, day) => (low == null || day.runningNet < low.runningNet ? day : low), null);

  function toggleLayer(key: Layer) {
    setLayers((current) => {
      const next = new Set(current);
      if (next.has(key) && next.size > 1) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const hasContent = (day: ReturnType<typeof viewDay>) => day.money.length + day.food.length + day.dates.length + day.events.length > 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <section className="rounded-[1.75rem] border border-white/70 bg-white/85 p-4 shadow-xl sm:rounded-[2.5rem] sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-600">Calendar</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">{data.label}</h1>
          </div>
          <div className="flex items-center gap-2">
            <Link href={`/calendar?month=${shiftMonth(data.month, -1)}&person=${encodeURIComponent(person)}`} className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200" aria-label="Previous month"><ChevronLeft className="h-5 w-5" /></Link>
            <Link href={`/calendar?person=${encodeURIComponent(person)}`} className="rounded-full bg-slate-100 px-4 py-2 text-sm font-black text-slate-700 hover:bg-slate-200">Today</Link>
            <Link href={`/calendar?month=${shiftMonth(data.month, 1)}&person=${encodeURIComponent(person)}`} className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200" aria-label="Next month"><ChevronRight className="h-5 w-5" /></Link>
          </div>
        </div>

        {/* Month money summary — same numbers as Summary */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: "Money in", value: data.totals.income, tone: "text-emerald-700" },
            { label: "Bills & spending", value: data.totals.spending, tone: "text-slate-900" },
            { label: "Saved", value: data.totals.saved, tone: "text-sky-700" },
            { label: "Left over", value: data.totals.leftOver, tone: data.totals.leftOver < 0 ? "text-rose-700" : "text-emerald-700" },
          ].map((tile) => (
            <div key={tile.label} className="rounded-2xl bg-slate-50 p-3">
              <p className="text-[11px] font-black uppercase tracking-wide text-slate-500">{tile.label}</p>
              <p className={`mt-1 text-lg font-black sm:text-xl ${tile.tone}`}>{gbp(tile.value, { whole: true })}</p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs font-semibold text-slate-500">
          Same plan as your Summary.{data.totals.budgets > 0 ? ` ${gbp(data.totals.budgets, { whole: true })} of spending budgets (${data.budgets.slice(0, 3).map((b) => b.label).join(", ")}${data.budgets.length > 3 ? "…" : ""}) isn't tied to a day, so it's not on the calendar.` : ""}
          {lowestDay && lowestDay.runningNet < 0 ? ` Tightest point: ${dayHeading(lowestDay.date)}, when bills are ${gbp(Math.abs(lowestDay.runningNet), { whole: true })} ahead of pay.` : ""}
        </p>

        {/* Filters */}
        <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            <button type="button" onClick={() => setPerson("__all__")} className={`shrink-0 rounded-full px-4 py-2 text-sm font-black ${person === "__all__" ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-700"}`}>Everyone</button>
            {data.people.map((p) => (
              <button key={p.id} type="button" onClick={() => setPerson(p.id)} className={`flex shrink-0 items-center gap-2 rounded-full py-1.5 pl-1.5 pr-4 text-sm font-black ${person === p.id ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-700"}`}>
                {p.avatarUrl ? <img src={p.avatarUrl} alt="" className="h-7 w-7 rounded-full object-cover" /> : <span className="grid h-7 w-7 place-items-center rounded-full bg-white/80 text-[11px] text-slate-700">{p.name.slice(0, 2).toUpperCase()}</span>}
                {p.name}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {LAYERS.map((layer) => {
              const Icon = layer.icon;
              const on = layers.has(layer.key);
              return <button key={layer.key} type="button" onClick={() => toggleLayer(layer.key)} aria-pressed={on} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-black ring-1 ${on ? "bg-emerald-50 text-emerald-900 ring-emerald-200" : "bg-white text-slate-400 ring-slate-200"}`}><Icon className="h-3.5 w-3.5" /> {layer.label}</button>;
            })}
          </div>
        </div>
      </section>

      {/* Desktop: month grid */}
      <section className="hidden rounded-[2.5rem] border border-white/70 bg-white/85 p-4 shadow-xl md:block">
        <div className="grid grid-cols-7 gap-2">
          {WEEKDAYS.map((name) => <p key={name} className="px-2 pb-1 text-xs font-black uppercase tracking-wide text-slate-400">{name}</p>)}
          {Array.from({ length: leadingBlanks }, (_, i) => <div key={`blank-${i}`} />)}
          {days.map((day) => {
            const isToday = day.date === data.today;
            const weekend = [0, 6].includes(new Date(`${day.date}T12:00:00Z`).getUTCDay());
            const holiday = day.dates.find((item) => item.kind === "school_holiday" || item.kind === "bank_holiday");
            const otherDates = day.dates.filter((item) => item.kind !== "school_holiday");
            const moneyIn = day.money.filter((m) => m.direction === "in").reduce((s, m) => s + m.amount, 0);
            const moneyOut = day.money.filter((m) => m.direction === "out").reduce((s, m) => s + m.amount, 0);
            return (
              <button key={day.date} type="button" onClick={() => setOpenDay(day.date)} className={`group flex min-h-[132px] flex-col rounded-2xl p-2 text-left ring-1 transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${isToday ? "bg-emerald-50 ring-2 ring-emerald-500" : weekend ? "bg-slate-50 ring-slate-100" : "bg-white ring-slate-100"}`}>
                <div className="flex items-start justify-between gap-1">
                  <span className={`grid h-7 w-7 place-items-center rounded-full text-sm font-black ${isToday ? "bg-emerald-600 text-white" : "text-slate-800"}`}>{Number(day.date.slice(8, 10))}</span>
                  {holiday?.kind === "school_holiday" ? <span className="truncate rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-black text-sky-800" title={holiday.label}>School off</span> : null}
                </div>
                <div className="mt-1 space-y-1">
                  {otherDates.slice(0, 2).map((item) => {
                    const style = DATE_STYLE[item.kind];
                    const Icon = style.icon;
                    return <span key={item.id} className={`flex items-center gap-1 truncate rounded-lg px-1.5 py-0.5 text-[11px] font-black ${style.tone}`} title={item.label}><Icon className="h-3 w-3 shrink-0" /><span className="truncate">{item.label}</span></span>;
                  })}
                  {otherDates.length > 2 ? <span className="block text-[11px] font-black text-slate-400">+{otherDates.length - 2} more</span> : null}
                  {day.events.slice(0, 1).map((event) => <span key={event.id} className="flex items-center gap-1 truncate rounded-lg bg-indigo-50 px-1.5 py-0.5 text-[11px] font-black text-indigo-800"><CalendarDays className="h-3 w-3 shrink-0" /><span className="truncate">{event.title}</span></span>)}
                  {day.events.length > 1 ? <span className="block text-[11px] font-black text-slate-400">+{day.events.length - 1} event{day.events.length > 2 ? "s" : ""}</span> : null}
                </div>
                <div className="mt-auto space-y-1 pt-1">
                  {moneyIn > 0 ? <p className="truncate text-xs font-black text-emerald-700">{gbp(moneyIn, { sign: true, whole: true })}</p> : null}
                  {moneyOut > 0 ? <p className="truncate text-xs font-black text-slate-700" title={day.money.filter((m) => m.direction === "out").map((m) => m.label).join(", ")}>{gbp(-moneyOut, { sign: true, whole: true })} <span className="font-semibold text-slate-400">· {day.money.filter((m) => m.direction === "out").length}</span></p> : null}
                  {day.food.length ? (
                    <div className="flex flex-wrap items-center gap-1">
                      {day.food.map((food) => <span key={`${food.personId}`} className={`grid h-5 min-w-5 place-items-center rounded-full px-1 text-[10px] font-black text-white ${scoreTone(food.score)}`} title={`${food.personName}: ${food.score}/100 · ${food.kcal} kcal${food.flags.length ? ` · over on ${food.flags.join(", ").toLowerCase()}` : ""}`}>{food.personName.slice(0, 1)}</span>)}
                      {day.food.some((food) => food.flags.length) ? <AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> : null}
                    </div>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-3 text-[11px] font-bold text-slate-500">
          <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-emerald-500" /> Food score 75+</span>
          <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-amber-400" /> 55–74</span>
          <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded-full bg-rose-500" /> Under 55</span>
          <span className="inline-flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-amber-500" /> Over a limit (caffeine, sugar or salt)</span>
        </div>
      </section>

      {/* Mobile: day list */}
      <section className="space-y-2 md:hidden">
        <div className="flex justify-end">
          <button type="button" onClick={() => setShowEmpty((v) => !v)} className="rounded-full bg-white px-3 py-1.5 text-xs font-black text-slate-600 ring-1 ring-slate-200">{showEmpty ? "Hide quiet days" : "Show every day"}</button>
        </div>
        {days.filter((day) => showEmpty || hasContent(day) || day.date === data.today).map((day) => {
          const isToday = day.date === data.today;
          const moneyIn = day.money.filter((m) => m.direction === "in").reduce((s, m) => s + m.amount, 0);
          const moneyOut = day.money.filter((m) => m.direction === "out").reduce((s, m) => s + m.amount, 0);
          return (
            <button key={day.date} type="button" onClick={() => setOpenDay(day.date)} className={`flex w-full gap-3 rounded-[1.5rem] p-3 text-left shadow-sm ring-1 ${isToday ? "bg-emerald-50 ring-2 ring-emerald-500" : "bg-white ring-slate-100"}`}>
              <div className={`flex w-12 shrink-0 flex-col items-center rounded-2xl py-1.5 ${isToday ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-800"}`}>
                <span className="text-[10px] font-black uppercase">{new Date(`${day.date}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short" })}</span>
                <span className="text-lg font-black leading-none">{Number(day.date.slice(8, 10))}</span>
              </div>
              <div className="min-w-0 flex-1 space-y-1.5">
                {day.dates.length ? <div className="flex flex-wrap gap-1">{day.dates.slice(0, 3).map((item) => { const style = DATE_STYLE[item.kind]; const Icon = style.icon; return <span key={item.id} className={`inline-flex max-w-full items-center gap-1 rounded-lg px-1.5 py-0.5 text-[11px] font-black ${style.tone}`}><Icon className="h-3 w-3 shrink-0" /><span className="truncate">{item.label}</span></span>; })}</div> : null}
                {day.events.map((event) => <p key={event.id} className="truncate text-sm font-black text-indigo-800">{event.title}</p>)}
                {(moneyIn > 0 || moneyOut > 0) ? (
                  <p className="text-sm font-black">
                    {moneyIn > 0 ? <span className="text-emerald-700">{gbp(moneyIn, { sign: true, whole: true })} </span> : null}
                    {moneyOut > 0 ? <span className="text-slate-700">{gbp(-moneyOut, { sign: true, whole: true })}</span> : null}
                    <span className="ml-1 text-xs font-semibold text-slate-400">{day.money.slice(0, 2).map((m) => m.label).join(", ")}{day.money.length > 2 ? ` +${day.money.length - 2}` : ""}</span>
                  </p>
                ) : null}
                {day.food.length ? <div className="flex flex-wrap gap-1.5">{day.food.map((food) => <span key={`${food.personId}`} className="inline-flex items-center gap-1 rounded-full bg-slate-50 py-0.5 pl-0.5 pr-2 text-[11px] font-black text-slate-700 ring-1 ring-slate-100"><span className={`h-4 w-4 rounded-full ${scoreTone(food.score)}`} />{food.personName} {food.score}{food.flags.length ? <AlertTriangle className="h-3 w-3 text-amber-500" /> : null}</span>)}</div> : null}
                {!hasContent(day) ? <p className="text-sm font-semibold text-slate-400">Nothing planned</p> : null}
              </div>
            </button>
          );
        })}
      </section>

      {active ? <DayPanel day={active} month={data.month} person={person} people={data.people} personName={personName} onClose={() => setOpenDay(null)} /> : null}
    </div>
  );
}

function DayPanel({ day, month, person, people, personName, onClose }: { day: ReturnType<typeof viewDay>; month: string; person: string; people: CalendarMonth["people"]; personName: (id: string | null) => string | null; onClose: () => void }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [title, setTitle] = useState("");
  const [who, setWho] = useState(person === "__all__" ? "" : person);
  const [error, setError] = useState<string | null>(null);
  const moneyIn = day.money.filter((m) => m.direction === "in");
  const moneyOut = day.money.filter((m) => m.direction === "out");

  function add() {
    setError(null);
    startTransition(async () => {
      try {
        await addCalendarEvent({ date: day.date, title, personId: who || null });
        setTitle("");
        router.refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Couldn't add that. Try again.");
      }
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      try {
        await deleteCalendarEvent(id);
        router.refresh();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Couldn't remove that.");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/50 backdrop-blur-sm sm:items-center sm:p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={dayHeading(day.date)} onClick={(event) => event.stopPropagation()} className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto overscroll-contain rounded-t-[1.75rem] bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-[2rem] sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-600">Day</p>
            <h2 className="mt-1 text-xl font-black text-slate-950 sm:text-2xl">{dayHeading(day.date)}</h2>
          </div>
          <button type="button" onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>

        {day.dates.length ? (
          <section className="mt-5">
            <h3 className="text-xs font-black uppercase tracking-wide text-slate-500">Big dates</h3>
            <ul className="mt-2 space-y-2">
              {day.dates.map((item) => {
                const style = DATE_STYLE[item.kind];
                const Icon = style.icon;
                const inner = <><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${style.tone}`}><Icon className="h-4 w-4" /></span><span className="min-w-0"><span className="block text-sm font-black text-slate-900">{item.label}</span>{item.detail ? <span className="block text-xs font-semibold text-slate-500">{item.detail}</span> : null}</span></>;
                return <li key={item.id}>{item.href ? <Link href={item.href} className="flex items-center gap-3 rounded-2xl p-2 hover:bg-slate-50">{inner}</Link> : <div className="flex items-center gap-3 p-2">{inner}</div>}</li>;
              })}
            </ul>
          </section>
        ) : null}

        <section className="mt-5">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-xs font-black uppercase tracking-wide text-slate-500">Money</h3>
            <Link href={`/spending?month=${month}&add=one_off`} className="text-xs font-black text-emerald-700 hover:underline">Add a payment</Link>
          </div>
          {day.money.length ? (
            <ul className="mt-2 divide-y divide-slate-100 rounded-2xl ring-1 ring-slate-100">
              {[...moneyIn, ...moneyOut].map((item) => (
                <li key={item.id}>
                  <Link href={item.href} className="flex items-center justify-between gap-3 px-3 py-2.5 hover:bg-slate-50">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-black text-slate-900">{item.label}</span>
                      <span className="block truncate text-xs font-semibold text-slate-500">{[item.personName, item.kind].filter(Boolean).join(" · ")}</span>
                    </span>
                    <span className={`shrink-0 text-sm font-black ${item.direction === "in" ? "text-emerald-700" : "text-slate-800"}`}>{gbp(item.direction === "in" ? item.amount : -item.amount, { sign: true })}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : <p className="mt-2 text-sm font-semibold text-slate-400">No payments due.</p>}
          <p className={`mt-2 text-xs font-bold ${day.runningNet < 0 ? "text-rose-700" : "text-slate-500"}`}>By the end of this day the month is {gbp(day.runningNet, { sign: true, whole: true })} (money in minus dated bills so far).</p>
        </section>

        <section className="mt-5">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-xs font-black uppercase tracking-wide text-slate-500">Food</h3>
            <Link href={`/nutrition?date=${day.date}&open=log`} className="text-xs font-black text-emerald-700 hover:underline">Log food for this day</Link>
          </div>
          {day.food.length ? (
            <ul className="mt-2 space-y-2">
              {day.food.map((food) => (
                <li key={`${food.personId}`}>
                  <Link href={`/nutrition/day?date=${day.date}&person=${encodeURIComponent(food.personId || "__household__")}`} className="flex items-center gap-3 rounded-2xl p-2 ring-1 ring-slate-100 hover:bg-slate-50">
                    <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm font-black text-white ${scoreTone(food.score)}`}>{food.score}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-black text-slate-900">{food.personName} · {food.label}</span>
                      <span className="block text-xs font-semibold text-slate-500">{food.entries} entr{food.entries === 1 ? "y" : "ies"} · {food.kcal} kcal{food.flags.length ? ` · over on ${food.flags.join(", ").toLowerCase()}` : ""}</span>
                    </span>
                    {food.flags.length ? <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" /> : null}
                  </Link>
                </li>
              ))}
            </ul>
          ) : <p className="mt-2 text-sm font-semibold text-slate-400">Nothing logged.</p>}
        </section>

        <section className="mt-5">
          <h3 className="text-xs font-black uppercase tracking-wide text-slate-500">Events</h3>
          {day.events.length ? (
            <ul className="mt-2 space-y-1">
              {day.events.map((event) => (
                <li key={event.id} className="flex items-center justify-between gap-2 rounded-xl px-2 py-1.5 hover:bg-slate-50">
                  <span className="min-w-0 truncate text-sm font-black text-slate-900">{event.title}{event.personId ? <span className="font-semibold text-slate-500"> · {personName(event.personId)}</span> : null}{event.source === "google" ? <span className="font-semibold text-slate-400"> · Google</span> : null}</span>
                  {event.mine && event.source === "loop_manual" ? <button type="button" disabled={isPending} onClick={() => remove(event.id)} className="grid h-8 w-8 place-items-center rounded-full text-slate-400 hover:bg-rose-50 hover:text-rose-600" aria-label={`Remove ${event.title}`}><Trash2 className="h-4 w-4" /></button> : null}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input value={title} onChange={(event) => setTitle(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && title.trim()) add(); }} placeholder="Add an event — e.g. school play, dentist" className="min-w-0 flex-1 rounded-2xl border border-slate-200 px-4 py-2.5 text-base font-semibold outline-none ring-emerald-500 focus:ring-2 sm:text-sm" />
            <select value={who} onChange={(event) => setWho(event.target.value)} className="rounded-2xl border border-slate-200 px-3 py-2.5 text-sm font-semibold">
              <option value="">Everyone</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <button type="button" disabled={isPending || !title.trim()} onClick={add} className="inline-flex items-center justify-center gap-1.5 rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50">{isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add</button>
          </div>
          {error ? <p className="mt-2 text-sm font-black text-rose-700">{error}</p> : null}
          <p className="mt-2 text-xs font-semibold text-slate-400">Events are shared with your household.</p>
        </section>
      </div>
    </div>
  );
}
