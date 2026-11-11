"use client";

// The home's story: purchase, Help to Buy, each mortgage deal, remortgages,
// improvements. Mortgage deals LOOP already has appear automatically; the rest
// are added here. Together they show the household's real path to owning it.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addHomeJourneyEvent, deleteHomeJourneyEvent, updateHomeJourneyEvent } from "@/app/mortgage/actions";
import type { HomeMortgageDeal } from "@/components/mortgage/MortgagePlannerClient";
import { effectiveMortgageStart } from "@/lib/calculations/mortgage-term";

export type HomeJourneyEvent = {
  id: string;
  home_id: string;
  event_date: string;
  kind: string;
  title: string;
  amount: number | null;
  rate_percent: number | null;
  lender: string | null;
  end_date: string | null;
  notes: string | null;
};

const KINDS: Array<[string, string, string]> = [
  ["purchase", "Bought the home", "🏡"],
  ["mortgage_deal", "Mortgage deal", "🏦"],
  ["remortgage", "Remortgage", "🔁"],
  ["help_to_buy_loan", "Help to Buy loan", "🤝"],
  ["help_to_buy_repaid", "Help to Buy repaid", "✅"],
  ["shared_ownership", "Shared ownership / staircasing", "🪜"],
  ["further_borrowing", "Borrowed more", "➕"],
  ["overpayment", "Lump-sum overpayment", "💷"],
  ["improvement", "Improvement or extension", "🛠️"],
  ["valuation", "Valuation", "📈"],
  ["sale", "Sold", "🔑"],
  ["other", "Something else", "•"],
];
const kindLabel = (kind: string) => KINDS.find(([k]) => k === kind)?.[1] ?? "Event";
const kindIcon = (kind: string) => KINDS.find(([k]) => k === kind)?.[2] ?? "•";
const pounds = (value: number) => `£${Math.round(value).toLocaleString("en-GB")}`;
const shortDate = (iso: string) => new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
const input = "w-full rounded-xl border border-slate-200 px-3 py-2 text-sm";

type Row = { key: string; date: string; kind: string; title: string; detail: string; notes: string | null; event?: HomeJourneyEvent; deal?: HomeMortgageDeal; missing?: boolean };

function EventForm({ homeId, event, onDone }: { homeId: string; event?: HomeJourneyEvent; onDone: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState(event?.kind ?? "mortgage_deal");
  const showRate = ["mortgage_deal", "remortgage", "further_borrowing", "help_to_buy_loan"].includes(kind);
  return (
    <form
      className="mt-3 grid gap-2 rounded-xl bg-slate-50 p-3 sm:grid-cols-2"
      action={(formData) =>
        start(async () => {
          setError(null);
          try {
            if (event) await updateHomeJourneyEvent(formData);
            else await addHomeJourneyEvent(formData);
            router.refresh();
            onDone();
          } catch (caught: any) {
            setError(caught?.message || "That didn't save.");
          }
        })
      }
    >
      <input type="hidden" name="home_id" value={homeId} />
      {event ? <input type="hidden" name="id" value={event.id} /> : null}
      <label className="text-xs font-semibold text-slate-600">What happened
        <select name="kind" value={kind} onChange={(e) => setKind(e.target.value)} className={input}>
          {KINDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label className="text-xs font-semibold text-slate-600">When
        <input name="event_date" type="date" required defaultValue={event?.event_date ?? ""} className={input} />
      </label>
      <label className="text-xs font-semibold text-slate-600 sm:col-span-2">Title
        <input name="title" required defaultValue={event?.title ?? ""} placeholder="e.g. Halifax 2-year fix" className={input} />
      </label>
      <label className="text-xs font-semibold text-slate-600">Amount (£)
        <input name="amount" inputMode="decimal" defaultValue={event?.amount ?? ""} placeholder={kind === "purchase" ? "Price paid" : kind.startsWith("help_to_buy") ? "Loan amount" : "Amount borrowed"} className={input} />
      </label>
      {showRate ? (
        <label className="text-xs font-semibold text-slate-600">Rate (%)
          <input name="rate_percent" inputMode="decimal" defaultValue={event?.rate_percent ?? ""} className={input} />
        </label>
      ) : <span />}
      {showRate ? (
        <>
          <label className="text-xs font-semibold text-slate-600">Lender
            <input name="lender" defaultValue={event?.lender ?? ""} className={input} />
          </label>
          <label className="text-xs font-semibold text-slate-600">Ended
            <input name="end_date" type="date" defaultValue={event?.end_date ?? ""} className={input} />
          </label>
        </>
      ) : null}
      <label className="text-xs font-semibold text-slate-600 sm:col-span-2">Notes
        <textarea name="notes" rows={2} defaultValue={event?.notes ?? ""} className={input} />
      </label>
      <div className="flex items-center gap-2 sm:col-span-2">
        <button disabled={pending} className="rounded-xl bg-slate-950 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{pending ? "Saving…" : "Save"}</button>
        <button type="button" onClick={onDone} className="rounded-xl px-3 py-2 text-xs font-semibold text-slate-600">Cancel</button>
        {error ? <span className="text-xs text-rose-600">{error}</span> : null}
      </div>
    </form>
  );
}

export function HomeJourney({ homeId, events, deals, onEditDeal }: { homeId: string | null; events: HomeJourneyEvent[]; deals: HomeMortgageDeal[]; onEditDeal: (deal: HomeMortgageDeal) => void }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [, start] = useTransition();
  if (!homeId) return null;

  const rows: Row[] = [
    ...events.map((event) => ({
      key: event.id,
      date: event.event_date,
      kind: event.kind,
      title: event.title,
      detail: [
        event.amount != null ? pounds(Number(event.amount)) : null,
        event.rate_percent != null ? `${Number(event.rate_percent).toFixed(2)}%` : null,
        event.lender,
        event.end_date ? `to ${shortDate(event.end_date)}` : null,
      ].filter(Boolean).join(" · "),
      notes: event.notes,
      event,
      missing: event.amount == null && ["purchase", "help_to_buy_loan", "help_to_buy_repaid", "mortgage_deal", "remortgage"].includes(event.kind),
    })),
    ...deals.map((deal) => {
      const start = effectiveMortgageStart(deal as any).date || deal.start_date;
      return {
        key: `deal-${deal.id}`,
        date: start,
        kind: "mortgage_deal",
        title: [deal.lender, deal.product_name].filter(Boolean).join(" · ") || "Mortgage",
        detail: [
          `${pounds(Number(deal.balance || 0))}${deal.balance_as_of_date ? ` at ${shortDate(deal.balance_as_of_date)}` : ""}`,
          `${Number(deal.interest_rate).toFixed(2)}%`,
          deal.initial_period_end ? `fixed to ${shortDate(deal.initial_period_end)}` : null,
        ].filter(Boolean).join(" · "),
        notes: null,
        deal,
      } as Row;
    }),
  ].sort((a, b) => a.date.localeCompare(b.date));

  const missingCount = rows.filter((row) => row.missing).length;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Your home&apos;s story</h2>
          <p className="mt-1 text-sm text-slate-500">Buying it, Help to Buy, each deal and remortgage. Your current mortgage is added automatically.</p>
        </div>
        <button type="button" onClick={() => { setAdding(true); setEditing(null); }} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold">+ Add to the story</button>
      </div>
      {missingCount ? <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900">{missingCount} {missingCount === 1 ? "step is" : "steps are"} missing an amount. Fill them in to see how much of your home you&apos;ve paid for over time.</p> : null}
      {adding ? <EventForm homeId={homeId} onDone={() => setAdding(false)} /> : null}
      <ol className="relative mt-4 space-y-4 border-l border-slate-200 pl-6">
        {rows.map((row) => (
          <li key={row.key} className="relative">
            <span className="absolute -left-[37px] grid h-7 w-7 place-items-center rounded-full bg-white text-sm ring-1 ring-slate-200">{kindIcon(row.kind)}</span>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs text-slate-500">{shortDate(row.date)} · {kindLabel(row.kind)}</p>
                <p className="text-sm font-semibold text-slate-900">{row.title}</p>
                {row.detail ? <p className="text-xs text-slate-600">{row.detail}</p> : null}
                {row.notes ? <p className={`text-xs ${row.missing ? "text-amber-700" : "text-slate-500"}`}>{row.notes}</p> : null}
              </div>
              <div className="flex gap-1">
                {row.deal ? (
                  <button type="button" onClick={() => onEditDeal(row.deal!)} className="rounded-full px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50">Edit</button>
                ) : row.event ? (
                  <>
                    <button type="button" onClick={() => { setEditing(row.event!.id); setAdding(false); }} className="rounded-full px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50">Edit</button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!window.confirm(`Remove "${row.title}" from the story?`)) return;
                        const fd = new FormData();
                        fd.set("id", row.event!.id);
                        start(async () => { await deleteHomeJourneyEvent(fd); router.refresh(); });
                      }}
                      className="rounded-full px-2.5 py-1 text-xs font-semibold text-slate-400 hover:bg-slate-50 hover:text-rose-600"
                    >
                      Remove
                    </button>
                  </>
                ) : null}
              </div>
            </div>
            {editing && row.event?.id === editing ? <EventForm homeId={homeId} event={row.event} onDone={() => setEditing(null)} /> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
