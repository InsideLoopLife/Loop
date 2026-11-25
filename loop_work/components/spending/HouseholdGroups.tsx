"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { quietly } from "@/components/feedback/quiet-action";
import { isLoopError } from "@/lib/actions/friendly";
import { loadCostGroups, saveCostGroup } from "@/app/mortgage/household-actions";
import { choiceKey, HOUSEHOLD_CHOICES, householdChoiceFor, type HouseholdChoice } from "@/lib/household/essential-costs";

const gbp = (value: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(value);

export type GroupableLine = { title: string; amount: number; categoryLabel?: string | null; helper?: string | null; petName?: string | null };

const CHOICE_STYLE: Record<HouseholdChoice, string> = {
  home: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  cars: "bg-sky-50 text-sky-800 ring-sky-200",
  children: "bg-amber-50 text-amber-800 ring-amber-200",
  food: "bg-orange-50 text-orange-800 ring-orange-200",
  protection: "bg-indigo-50 text-indigo-800 ring-indigo-200",
  pets: "bg-rose-50 text-rose-800 ring-rose-200",
  other: "bg-teal-50 text-teal-800 ring-teal-200",
  personal: "bg-violet-50 text-violet-800 ring-violet-200",
  none: "bg-slate-100 text-slate-500 ring-slate-200",
};

/** The household groups (Home, Cars, Personal, Not counted…) for spending lines, with your own changes. */
export function useHouseholdGroups(enabled: boolean) {
  const [groups, setGroups] = useState<Record<string, string>>({});
  const [petNames, setPetNames] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    if (!enabled || loaded.current) return;
    loaded.current = true;
    void quietly(() => loadCostGroups()).then((result) => {
      if (isLoopError(result)) return;
      const r = result as { groups: Record<string, string>; petNames: string[] };
      setGroups(r.groups || {});
      setPetNames(r.petNames || []);
      setReady(true);
    });
  }, [enabled]);

  const choiceFor = useCallback(
    (line: GroupableLine) => householdChoiceFor({ label: line.title, value: line.amount, categoryLabel: line.petName || line.categoryLabel || line.helper || null, helper: line.helper || null }, petNames, groups),
    [groups, petNames],
  );

  const save = useCallback(async (title: string, group: HouseholdChoice | "auto") => {
    const key = choiceKey(title);
    const before = groups[key];
    setGroups((current) => {
      const next = { ...current };
      if (group === "auto") delete next[key];
      else next[key] = group;
      return next;
    });
    const result = await saveCostGroup(title, group);
    if (isLoopError(result)) {
      setGroups((current) => ({ ...current, ...(before ? { [key]: before } : {}) }));
      return result.__loopError || "That didn't save. Try again.";
    }
    return null;
  }, [groups]);

  return { ready, choiceFor, save };
}

/** Totals by household group for the lines shown. */
export function HouseholdGroupsSummary({ lines, choiceFor }: { lines: GroupableLine[]; choiceFor: (line: GroupableLine) => { key: HouseholdChoice } }) {
  const totals = new Map<HouseholdChoice, { amount: number; count: number }>();
  for (const line of lines) {
    const { key } = choiceFor(line);
    const row = totals.get(key) || { amount: 0, count: 0 };
    row.amount += Number(line.amount || 0);
    row.count += 1;
    totals.set(key, row);
  }
  const household = HOUSEHOLD_CHOICES.filter((c) => c.key !== "personal" && c.key !== "none").reduce((sum, c) => sum + (totals.get(c.key)?.amount || 0), 0);
  return (
    <div className="mb-4 rounded-3xl border border-emerald-200 bg-emerald-50/40 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-black text-slate-950">Household groups</p>
        <p className="text-xs font-semibold text-slate-600">Household costs this month: <strong className="text-slate-950">{gbp(household)}</strong> · <a href="/mortgage?tab=costs" className="font-bold text-indigo-700 hover:underline">See Home costs →</a></p>
      </div>
      <p className="mt-1 text-xs text-slate-500">Each bill&apos;s group decides what counts towards Home costs and the emergency fund. Tap a line&apos;s group to move it. Home costs also average Council Tax and childcare over the year, so its total won&apos;t match this month exactly.</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {HOUSEHOLD_CHOICES.filter((c) => totals.has(c.key)).map((c) => (
          <span key={c.key} className={`rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${CHOICE_STYLE[c.key]}`}>
            {c.icon} {c.label} <strong>{gbp(totals.get(c.key)!.amount)}</strong> <span className="opacity-60">· {totals.get(c.key)!.count}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** A line's household group, tap to move it — with a confirm, as it changes Home costs and the emergency fund. */
export function HouseholdGroupChip({ line, choice, onSave }: { line: GroupableLine; choice: { key: HouseholdChoice; chosen: boolean }; onSave: (title: string, group: HouseholdChoice | "auto") => Promise<string | null> }) {
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState<HouseholdChoice | "auto" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = HOUSEHOLD_CHOICES.find((c) => c.key === choice.key)!;
  const counted = (key: HouseholdChoice) => key !== "none" && key !== "personal";
  const effect = (target: HouseholdChoice) => {
    const was = counted(choice.key);
    const will = counted(target);
    if (was === will) return "Home costs stay the same total — it just moves group.";
    return will ? `Home costs go up ${gbp(line.amount)} a month.` : `Home costs go down ${gbp(line.amount)} a month.`;
  };

  const close = () => { setOpen(false); setPick(null); setError(null); };
  const confirm = async () => {
    if (!pick) return;
    setBusy(true);
    const message = await onSave(line.title, pick);
    setBusy(false);
    if (message) setError(message);
    else close();
  };

  return (
    <span className="relative ml-1 mt-1 inline-block">
      <button type="button" onClick={() => (open ? close() : setOpen(true))} aria-expanded={open} title={choice.chosen ? "You chose this group" : "Loop's guess — tap to change"}
        className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-black ring-1 ${CHOICE_STYLE[choice.key]}`}>
        {current.icon} {current.label}{choice.chosen ? "" : <span className="font-semibold opacity-60">· guess</span>}
      </button>
      {open ? (
        <span className="absolute left-0 top-full z-30 mt-1 block w-72 rounded-2xl border border-slate-200 bg-white p-3 text-left shadow-xl" onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } }}>
          {pick === null ? (
            <>
              <span className="block text-xs font-black text-slate-700">Which household group is &ldquo;{line.title}&rdquo;?</span>
              <span className="mt-2 flex flex-wrap gap-1.5">
                {HOUSEHOLD_CHOICES.map((c) => (
                  <button key={c.key} type="button" disabled={c.key === choice.key} onClick={() => setPick(c.key)}
                    className={`rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${c.key === choice.key ? "bg-slate-950 text-white ring-slate-950" : `${CHOICE_STYLE[c.key]} hover:brightness-95`}`}>{c.icon} {c.label}</button>
                ))}
              </span>
              {choice.chosen ? <button type="button" onClick={() => setPick("auto")} className="mt-2 block text-[11px] font-bold text-slate-500 hover:text-slate-800">Go back to Loop&apos;s guess</button> : null}
            </>
          ) : (
            <>
              <span className="block text-sm font-black text-slate-900">
                {pick === "auto" ? `Let Loop group "${line.title}"?` : `Move "${line.title}" to ${HOUSEHOLD_CHOICES.find((c) => c.key === pick)!.label}?`}
              </span>
              <span className="mt-1 block text-xs text-slate-600">{pick === "auto" ? "It goes back to Loop's guess, which may change Home costs and the emergency fund." : `${effect(pick)} The emergency fund updates too. This applies to every month with this bill.`}</span>
              {error ? <span role="alert" className="mt-2 block text-xs font-bold text-rose-700">{error}</span> : null}
              <span className="mt-3 flex gap-2">
                <button type="button" onClick={confirm} disabled={busy} className="rounded-full bg-slate-950 px-3 py-1.5 text-xs font-black text-white disabled:opacity-50">{busy ? "Saving…" : "Confirm"}</button>
                <button type="button" onClick={() => setPick(null)} className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-700">Back</button>
              </span>
            </>
          )}
        </span>
      ) : null}
    </span>
  );
}
