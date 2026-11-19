"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { SectionCard } from "@/components/SectionCard";
import { ModalFrame } from "@/components/ui/ModalFrame";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { archiveSplitGroup, saveSplitGroup, saveSplitSettings, type SplitConfig } from "@/app/spending/split-actions";
import {
  computeSplit, DEFAULT_SPLIT_SETTINGS, groupForLine,
  type SplitAdult, type SplitGroup, type SplitLine, type SplitMember, type SplitMethod, type SplitResult, type SplitSettings,
} from "@/lib/spending/split";
import { shortDate, transferAmountInMonth, transferDatesInMonth, transferScheduleLabel, type StandingTransfer } from "@/lib/accounts/standing-transfers";

type Category = { id: string; name: string; group_id?: string | null };
type CategoryGroup = { id: string; name: string };

const METHOD_LABELS: Record<SplitMethod, { label: string; help: string }> = {
  equal_leftover: { label: "Equal leftover", help: "Whoever earns more pays more, so you both have the same left." },
  equal: { label: "50/50", help: "Everyone pays the same amount." },
  income_share: { label: "In proportion to income", help: "Everyone pays the same share of their take-home pay." },
  custom: { label: "Custom percentages", help: "You set each person's share." },
  one_person: { label: "One person pays", help: "One person covers it all." },
};

type Draft = { id?: string; name: string; method: SplitMethod; customShares: Record<string, number>; payerPersonId: string | null; members: SplitMember[]; sortOrder: number };

export function SplitView({
  monthLabel, lines, adults, childIds, categories, categoryGroups, config, money, month, standingTransfers = [], accountNames = {},
}: {
  monthLabel: string;
  lines: SplitLine[];
  adults: SplitAdult[];
  childIds: Set<string>;
  categories: Category[];
  categoryGroups: CategoryGroup[];
  config: SplitConfig | null | undefined;
  money: (value: number) => string;
  month: string;
  standingTransfers?: StandingTransfer[];
  accountNames?: Record<string, string>;
}) {
  const [saved, setSaved] = useState<SplitConfig | null>(null);
  const current = useMemo<SplitConfig>(() => saved || config || { groups: [], settings: DEFAULT_SPLIT_SETTINGS }, [saved, config]);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const close = useCallback(() => setEditing(null), []);

  const result = useMemo(() => computeSplit({ lines, adults, childIds, groups: current.groups, settings: current.settings }), [lines, adults, childIds, current]);
  const nameOf = (id: string) => adults.find((a) => a.id === id)?.name || "Someone";

  function run(task: () => Promise<SplitConfig>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      try { setSaved(await task()); after?.(); }
      catch (e) { setError(e instanceof Error ? e.message : "Couldn't save that."); }
    });
  }

  if (adults.length < 2) {
    return (
      <SectionCard title={`${monthLabel}: split`} description="Share household payments between earners.">
        <p className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-600">Splitting needs two adults with income in your household. Add your partner under Household to use it.</p>
      </SectionCard>
    );
  }

  const adultNames = new Set(adults.map((a) => a.name.toLowerCase()));
  const sharedCategoryGroups = categoryGroups.filter((g) => !adultNames.has(g.name.trim().toLowerCase()));
  const childBenefitLines = lines.filter((l) => l.direction === "income" && /child benefit/i.test(l.title) && !l.isPay);
  const nextOrder = Math.max(-1, ...current.groups.map((g) => g.sortOrder)) + 1;
  const newDraft = (preset?: "household" | "kids"): Draft => ({
    name: preset === "household" ? "Household" : preset === "kids" ? "Kids" : "",
    method: "equal_leftover",
    customShares: {},
    payerPersonId: null,
    sortOrder: nextOrder,
    members: preset === "household"
      ? [...sharedCategoryGroups.map((g) => ({ kind: "category_group" as const, ref: g.id, include: true })), { kind: "mortgage" as const, ref: "", include: true }]
      : preset === "kids"
        ? [{ kind: "children" as const, ref: "", include: true }, ...childBenefitLines.map((l) => ({ kind: "line" as const, ref: l.key, include: true }))]
        : [],
  });
  const editGroup = (group: SplitGroup) => setEditing({ id: group.id, name: group.name, method: group.method, customShares: group.customShares, payerPersonId: group.payerPersonId, members: group.members, sortOrder: group.sortOrder });

  return (
    <SectionCard title={`${monthLabel}: split`} description="How shared payments are shared between you, and what each of you has left.">
      {error ? <p className="mb-3 rounded-2xl bg-rose-50 px-4 py-2 text-xs font-bold text-rose-800">{error}</p> : null}

      {!current.groups.length ? (
        <div className="rounded-3xl border border-dashed border-violet-200 bg-violet-50/50 p-5">
          <p className="text-base font-black text-slate-950">Group your shared payments</p>
          <p className="mt-1 text-sm font-semibold text-slate-600">Make a group for each kind of shared spending — like the house and the kids — and choose how each is split. With “equal leftover”, whoever earns more pays more, so you both end up with the same for personal spending.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={() => setEditing(newDraft("household"))} className="rounded-full bg-slate-950 px-4 py-2 text-xs font-black text-white">Start with Household</button>
            <button type="button" onClick={() => setEditing(newDraft("kids"))} className="rounded-full bg-white px-4 py-2 text-xs font-black text-slate-800 ring-1 ring-slate-200">Start with Kids</button>
            <button type="button" onClick={() => setEditing(newDraft())} className="rounded-full px-4 py-2 text-xs font-black text-violet-700">Make my own group</button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <PeopleCards result={result} settings={current.settings} groups={current.groups} money={money} nameOf={nameOf} />
          {result.notes.length ? <div className="space-y-1">{result.notes.map((note) => <p key={note} className="rounded-2xl bg-amber-50 px-4 py-2 text-xs font-bold text-amber-900">{note}</p>)}</div> : null}

          <Transfers result={result} money={money} nameOf={nameOf} month={month} standing={standingTransfers.filter((t) => t.person_id && adults.some((a) => a.id === t.person_id))} accountNames={accountNames} />

          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-sm font-black text-slate-950">Groups</p>
              <button type="button" onClick={() => setEditing(newDraft())} className="rounded-full bg-white px-3 py-1.5 text-xs font-black text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50">＋ New group</button>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              {result.groups.map((g) => (
                <div key={g.group.id} className="rounded-3xl border border-slate-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-base font-black text-slate-950">{g.group.name}</p>
                      <p className="text-xs font-bold text-slate-500">{METHOD_LABELS[g.group.method].label}{g.group.method === "one_person" && g.group.payerPersonId ? ` · ${nameOf(g.group.payerPersonId)}` : ""} · {g.lines.length} payment{g.lines.length === 1 ? "" : "s"}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-black tabular-nums text-slate-950">{money(g.total)}</p>
                      {g.incoming ? <p className="text-[11px] font-bold text-emerald-700">after {money(g.incoming)} coming in</p> : null}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {adults.map((a) => <span key={a.id} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">{a.name} {money(g.shares[a.id] || 0)}</span>)}
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <details className="min-w-0">
                      <summary className="cursor-pointer text-xs font-black text-slate-500 hover:text-slate-900">Show payments</summary>
                      <ul className="mt-2 divide-y divide-slate-100">
                        {g.lines.map((line, i) => (
                          <li key={`${line.key}-${i}`} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                            <span className="min-w-0 truncate font-bold text-slate-700">{line.title}</span>
                            <span className={`shrink-0 font-black tabular-nums ${line.direction === "income" ? "text-emerald-700" : "text-slate-800"}`}>{line.direction === "income" ? "+" : "−"}{money(line.amount)}</span>
                          </li>
                        ))}
                        {!g.lines.length ? <li className="py-1.5 text-xs font-semibold text-slate-400">Nothing in this group this month.</li> : null}
                      </ul>
                    </details>
                    <button type="button" onClick={() => editGroup(g.group)} className="shrink-0 rounded-full px-3 py-1.5 text-xs font-black text-violet-700 hover:bg-violet-50">Change</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {result.ungrouped.length ? (
            <div className="rounded-3xl border border-dashed border-amber-300 bg-amber-50/60 p-4">
              <p className="text-sm font-black text-amber-950">Shared payments not in a group ({money(result.ungrouped.reduce((s, l) => s + l.amount, 0))})</p>
              <p className="text-xs font-semibold text-amber-800">They aren&apos;t split yet. Add each to a group, or set who it&apos;s for in the payment itself.</p>
              <ul className="mt-3 divide-y divide-amber-100">
                {result.ungrouped.map((line, i) => (
                  <li key={`${line.key}-${i}`} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <span className="min-w-0 truncate font-bold text-slate-800">{line.title} · {money(line.amount)}</span>
                    <span className="flex flex-wrap gap-2">
                      {current.groups.map((group) => (
                        <ConfirmButton
                          key={group.id}
                          disabled={pending}
                          question={`Add ${line.title} to ${group.name}?`}
                          detail={`${money(line.amount)} a month will be split the ${METHOD_LABELS[group.method].label.toLowerCase()} way with the rest of ${group.name}.`}
                          confirmLabel="Yes, add it"
                          onConfirm={() => run(() => saveSplitGroup({ ...group, members: [...group.members.filter((m) => !(m.kind === "line" && m.ref === line.key)), { kind: "line", ref: line.key, include: true }] }))}
                          className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-700 ring-1 ring-amber-200 hover:bg-amber-100"
                        >
                          → {group.name}
                        </ConfirmButton>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <SettingsCard settings={current.settings} pending={pending} onSave={(next) => run(() => saveSplitSettings(next))} />
        </div>
      )}

      {editing ? (
        <GroupEditor
          draft={editing}
          setDraft={setEditing}
          onClose={close}
          lines={lines}
          adults={adults}
          childIds={childIds}
          categories={categories}
          categoryGroups={categoryGroups}
          config={current}
          money={money}
          pending={pending}
          error={error}
          onSave={(draft) => run(() => saveSplitGroup(draft), () => setEditing(null))}
          onRemove={(id) => run(() => archiveSplitGroup(id), () => setEditing(null))}
        />
      ) : null}
    </SectionCard>
  );
}

function PeopleCards({ result, settings, groups, money, nameOf }: { result: SplitResult; settings: SplitSettings; groups: SplitGroup[]; money: (v: number) => string; nameOf: (id: string) => string }) {
  const evenBefore = settings.savingsMode === "separate";
  const even = result.gap <= 1;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {result.people.map((p) => (
        <div key={p.personId} className="rounded-3xl border border-slate-200 bg-white p-4">
          <p className="text-base font-black text-slate-950">{p.name}</p>
          <dl className="mt-3 space-y-1.5 text-sm">
            <Row label="Take-home" value={money(p.income + p.sharedIncome)} hint={p.sharedIncome ? `incl. ${money(p.sharedIncome)} shared income` : undefined} />
            {groups.map((g) => (p.shares[g.id] ? <Row key={g.id} label={g.name} value={`−${money(p.shares[g.id])}`} muted /> : null))}
            {p.evenUp > 0.5 ? <Row label="Evening up" value={`+${money(p.evenUp)}`} hint={`from ${result.people.filter((o) => o.evenUp < 0).map((o) => nameOf(o.personId)).join(" and ")}`} /> : null}
            {p.evenUp < -0.5 ? <Row label="Evening up" value={`−${money(-p.evenUp)}`} hint={`to ${result.people.filter((o) => o.evenUp > 0).map((o) => nameOf(o.personId)).join(" and ")}`} muted /> : null}
            <div className="border-t border-slate-100 pt-1.5">
              <Row label="Yours to spend or save" value={money(p.own)} strong badge={evenBefore && even ? "Even" : undefined} />
            </div>
            {p.savings ? <Row label="Saving" value={`−${money(p.savings)}`} tone="text-sky-800" /> : null}
            <div className="border-t border-slate-100 pt-1.5">
              <Row label="For personal spending" value={money(p.leftover)} strong badge={!evenBefore && even ? "Even" : undefined} />
            </div>
            {p.personalSpending ? <Row label="Already planned (car, phone…)" value={`−${money(p.personalSpending)}`} muted /> : null}
            {p.personalSpending ? <Row label="Still free" value={money(p.free)} tone={p.free < 0 ? "text-rose-700" : "text-emerald-700"} /> : null}
          </dl>
        </div>
      ))}
    </div>
  );
}

function Row({ label, value, hint, muted, strong, tone, badge }: { label: string; value: string; hint?: string; muted?: boolean; strong?: boolean; tone?: string; badge?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={`min-w-0 ${strong ? "font-black text-slate-950" : "font-semibold text-slate-600"}`}>
        {label}{badge ? <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-black text-emerald-700">{badge}</span> : null}
        {hint ? <span className="block text-[11px] font-semibold text-slate-400">{hint}</span> : null}
      </dt>
      <dd className={`shrink-0 tabular-nums ${strong ? "text-lg font-black text-slate-950" : muted ? "font-bold text-slate-500" : `font-black ${tone || "text-slate-800"}`}`}>{value}</dd>
    </div>
  );
}

type TransferRow = {
  key: string;
  fromPersonId: string;
  toName: string;
  needed: number | null;
  reason: string;
  setUp: Array<{ id: string; amount: number; schedule: string; dates: string[] }>;
};

function Transfers({ result, money, nameOf, month, standing, accountNames }: {
  result: SplitResult; money: (v: number) => string; nameOf: (id: string) => string;
  month: string; standing: StandingTransfer[]; accountNames: Record<string, string>;
}) {
  const rows = new Map<string, TransferRow>();
  for (const t of result.transfers) {
    const toId = t.to.kind === "account" ? `a:${t.to.account.id}` : `p:${t.to.personId}`;
    const key = `${t.fromPersonId}|${toId}`;
    rows.set(key, { key, fromPersonId: t.fromPersonId, toName: t.to.kind === "account" ? t.to.account.name : nameOf(t.to.personId), needed: t.amount, reason: t.reason, setUp: [] });
  }
  for (const s of standing) {
    const key = `${s.person_id}|a:${s.to_account_id}`;
    const dates = transferDatesInMonth(s, month);
    const entry = { id: s.id, amount: transferAmountInMonth(s, month), schedule: `${money(s.amount)} ${transferScheduleLabel(s)}`, dates };
    const row = rows.get(key);
    if (row) row.setUp.push(entry);
    else rows.set(key, { key, fromPersonId: String(s.person_id), toName: accountNames[s.to_account_id] || "Joint account", needed: null, reason: "", setUp: [entry] });
  }
  if (!rows.size) return null;

  const status = (row: TransferRow) => {
    const set = row.setUp.reduce((sum, e) => sum + e.amount, 0);
    if (row.needed == null) return { text: "Set up · not needed by your groups", tone: "text-white/60" };
    if (!row.setUp.length) return { text: "Not set up yet", tone: "text-amber-300" };
    const diff = Math.round((set - row.needed) * 100) / 100;
    if (Math.abs(diff) < 1) return { text: "Covered", tone: "text-emerald-300" };
    if (diff < 0) {
      const single = row.setUp.length === 1 && row.setUp[0].dates.length > 1 ? row.setUp[0] : null;
      const hint = single ? ` · about ${money(Math.ceil(row.needed / single.dates.length))} each time would cover it` : "";
      return { text: `${money(-diff)} short${hint}`, tone: "text-amber-300" };
    }
    return { text: `${money(diff)} more than needed`, tone: "text-sky-300" };
  };

  return (
    <div className="rounded-3xl bg-slate-950 p-4 text-white">
      <p className="text-sm font-black">Money moving this month</p>
      <p className="mt-0.5 text-[11px] font-semibold text-white/50">What your groups need from each of you, against the regular transfers you&apos;ve set up in Accounts.</p>
      <ul className="mt-3 space-y-3">
        {[...rows.values()].map((row) => {
          const set = row.setUp.reduce((sum, e) => sum + e.amount, 0);
          const st = status(row);
          return (
            <li key={row.key} className="rounded-2xl bg-white/5 p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                <span className="font-bold">{nameOf(row.fromPersonId)} → {row.toName}{row.reason ? <span className="ml-2 text-xs font-semibold text-white/60">{row.reason}</span> : null}</span>
                <span className="font-black tabular-nums">{row.needed != null ? `${money(row.needed)} needed` : money(set)}</span>
              </div>
              {row.setUp.map((e) => (
                <p key={e.id} className="mt-1 text-xs font-semibold text-white/70">
                  {e.schedule} · {e.dates.length ? `${e.dates.map(shortDate).join(", ")} = ${money(e.amount)}` : "nothing this month"}
                </p>
              ))}
              <p className={`mt-1 text-xs font-black ${st.tone}`}>{st.text}</p>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-[11px] font-semibold text-white/50">Needed amounts are based on the account each payment comes from; payments with no account set aren&apos;t included. Set up regular transfers under Accounts → Joint accounts.</p>
    </div>
  );
}

function SettingsCard({ settings, pending, onSave }: { settings: SplitSettings; pending: boolean; onSave: (next: SplitSettings) => void }) {
  const [draft, setDraft] = useState(settings);
  const changed = draft.savingsMode !== settings.savingsMode || draft.lowEarnerMode !== settings.lowEarnerMode;
  const option = (active: boolean) => `flex cursor-pointer items-start gap-2 rounded-2xl p-3 ring-1 ${active ? "bg-violet-50 ring-violet-200" : "bg-white ring-slate-200"}`;
  return (
    <details className="rounded-3xl border border-slate-200 bg-white p-4">
      <summary className="cursor-pointer text-sm font-black text-slate-950">Equal leftover settings</summary>
      <div className="mt-3 grid gap-4 md:grid-cols-2">
        <fieldset className="space-y-2">
          <legend className="text-xs font-black text-slate-500">Savings</legend>
          <label className={option(draft.savingsMode === "separate")}>
            <input type="radio" checked={draft.savingsMode === "separate"} onChange={() => setDraft({ ...draft, savingsMode: "separate" })} className="mt-1" />
            <span className="text-sm font-semibold text-slate-700"><span className="font-black text-slate-950">Don&apos;t change the split.</span> You each get the same to spend or save; your own savings come out of your side.</span>
          </label>
          <label className={option(draft.savingsMode === "first")}>
            <input type="radio" checked={draft.savingsMode === "first"} onChange={() => setDraft({ ...draft, savingsMode: "first" })} className="mt-1" />
            <span className="text-sm font-semibold text-slate-700"><span className="font-black text-slate-950">Come off first.</span> Equal after savings — whoever saves more pays a little less into shared groups.</span>
          </label>
        </fieldset>
        <fieldset className="space-y-2">
          <legend className="text-xs font-black text-slate-500">If one of you can&apos;t reach equal</legend>
          <label className={option(draft.lowEarnerMode === "zero")}>
            <input type="radio" checked={draft.lowEarnerMode === "zero"} onChange={() => setDraft({ ...draft, lowEarnerMode: "zero" })} className="mt-1" />
            <span className="text-sm font-semibold text-slate-700"><span className="font-black text-slate-950">They pay £0.</span> The other covers the groups; Loop shows how far apart you still are.</span>
          </label>
          <label className={option(draft.lowEarnerMode === "top_up")}>
            <input type="radio" checked={draft.lowEarnerMode === "top_up"} onChange={() => setDraft({ ...draft, lowEarnerMode: "top_up" })} className="mt-1" />
            <span className="text-sm font-semibold text-slate-700"><span className="font-black text-slate-950">Top them up.</span> The other also sends them the difference, so you&apos;re fully even.</span>
          </label>
        </fieldset>
      </div>
      <div className="mt-3">
        <ConfirmButton disabled={!changed || pending} question="Save these settings?" detail="This changes how equal-leftover groups are split, and what each of you is shown as having left." confirmLabel="Yes, save" onConfirm={() => onSave(draft)} className="rounded-full bg-slate-950 px-4 py-2 text-xs font-black text-white disabled:bg-slate-300">Save settings</ConfirmButton>
      </div>
    </details>
  );
}

function GroupEditor({
  draft, setDraft, onClose, lines, adults, childIds, categories, categoryGroups, config, money, pending, error, onSave, onRemove,
}: {
  draft: Draft; setDraft: (next: Draft) => void; onClose: () => void; lines: SplitLine[]; adults: SplitAdult[]; childIds: Set<string>;
  categories: Category[]; categoryGroups: CategoryGroup[]; config: SplitConfig; money: (v: number) => string; pending: boolean; error: string | null;
  onSave: (draft: Draft) => void; onRemove: (id: string) => void;
}) {
  const draftGroup: SplitGroup = { id: draft.id || "__draft", name: draft.name || "This group", method: draft.method, customShares: draft.customShares, payerPersonId: draft.payerPersonId, members: draft.members, sortOrder: draft.sortOrder };
  const groupsWithDraft = [...config.groups.filter((g) => g.id !== draft.id), draftGroup];
  const preview = computeSplit({ lines, adults, childIds, groups: groupsWithDraft, settings: config.settings });
  const previewGroup = preview.groups.find((g) => g.group.id === draftGroup.id);
  const has = (kind: SplitMember["kind"], ref = "") => draft.members.some((m) => m.kind === kind && m.ref === ref && m.include);
  const toggle = (kind: SplitMember["kind"], ref = "") => {
    const without = draft.members.filter((m) => !(m.kind === kind && m.ref === ref));
    setDraft({ ...draft, members: has(kind, ref) ? without : [...without, { kind, ref, include: true }] });
  };
  const candidateLines = lines.filter((l) => !l.isPay && !l.isSavings);
  const uniqueLines = Array.from(new Map(candidateLines.map((l) => [l.key, l])).values());
  const lineIn = (line: SplitLine) => groupForLine(line, groupsWithDraft, childIds)?.id === draftGroup.id;
  const lineOwner = (line: SplitLine) => groupForLine(line, groupsWithDraft, childIds);
  const toggleLine = (line: SplitLine) => {
    const without = draft.members.filter((m) => !(m.kind === "line" && m.ref === line.key));
    const inByRule = groupForLine(line, [...config.groups.filter((g) => g.id !== draft.id), { ...draftGroup, members: without }], childIds)?.id === draftGroup.id;
    const nowIn = lineIn(line);
    if (nowIn) setDraft({ ...draft, members: inByRule ? [...without, { kind: "line", ref: line.key, include: false }] : without });
    else setDraft({ ...draft, members: inByRule ? without : [...without, { kind: "line", ref: line.key, include: true }] });
  };
  const input = "mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold";
  const customTotal = adults.reduce((s, a) => s + Number(draft.customShares[a.id] || 0), 0);

  return (
    <ModalFrame eyebrow="Split" title={draft.id ? `Change ${draft.name || "group"}` : "New split group"} description="Choose what's in this group and how it's shared." maxWidth="max-w-3xl" onClose={onClose}>
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-black text-slate-600">Name<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Household" className={input} /></label>
          <label className="text-xs font-black text-slate-600">How it&apos;s split
            <select value={draft.method} onChange={(e) => setDraft({ ...draft, method: e.target.value as SplitMethod })} className={input}>
              {(Object.keys(METHOD_LABELS) as SplitMethod[]).map((m) => <option key={m} value={m}>{METHOD_LABELS[m].label}</option>)}
            </select>
            <span className="mt-1 block text-[11px] font-semibold text-slate-400">{METHOD_LABELS[draft.method].help}</span>
          </label>
        </div>
        {draft.method === "custom" ? (
          <div className="grid gap-3 sm:grid-cols-3">
            {adults.map((a) => (
              <label key={a.id} className="text-xs font-black text-slate-600">{a.name} %
                <input type="number" min={0} max={100} value={draft.customShares[a.id] ?? ""} onChange={(e) => setDraft({ ...draft, customShares: { ...draft.customShares, [a.id]: Number(e.target.value) } })} className={input} />
              </label>
            ))}
            <p className={`self-end pb-2 text-xs font-bold ${Math.round(customTotal) === 100 ? "text-emerald-700" : "text-amber-700"}`}>Total {customTotal}%{Math.round(customTotal) === 100 ? "" : " — should add up to 100%"}</p>
          </div>
        ) : null}
        {draft.method === "one_person" ? (
          <label className="block text-xs font-black text-slate-600">Who pays
            <select value={draft.payerPersonId || adults[0]?.id} onChange={(e) => setDraft({ ...draft, payerPersonId: e.target.value })} className={input}>
              {adults.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </label>
        ) : null}

        <div>
          <p className="text-xs font-black text-slate-600">What&apos;s in it</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {categoryGroups.map((g) => <Chip key={g.id} active={has("category_group", g.id)} onClick={() => toggle("category_group", g.id)}>{g.name}</Chip>)}
            <Chip active={has("children")} onClick={() => toggle("children")}>👶 Children&apos;s costs</Chip>
            <Chip active={has("mortgage")} onClick={() => toggle("mortgage")}>🏠 Mortgage</Chip>
          </div>
          <details className="mt-3">
            <summary className="cursor-pointer text-xs font-black text-slate-500">Single categories</summary>
            <div className="mt-2 flex flex-wrap gap-2">
              {categories.map((c) => <Chip key={c.id} active={has("category", c.id)} onClick={() => toggle("category", c.id)}>{c.name}{c.group_id ? <span className="ml-1 font-semibold opacity-60">· {categoryGroups.find((g) => g.id === c.group_id)?.name}</span> : null}</Chip>)}
            </div>
          </details>
        </div>

        <div>
          <p className="text-xs font-black text-slate-600">This month&apos;s payments <span className="font-semibold text-slate-400">— tick to add or leave out one at a time; money coming in (like Child Benefit) takes off the total</span></p>
          <ul className="mt-2 max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-2xl ring-1 ring-slate-200">
            {uniqueLines.map((line) => {
              const owner = lineOwner(line);
              const inThis = owner?.id === draftGroup.id;
              return (
                <li key={line.key}>
                  <label className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-slate-50">
                    <span className="flex min-w-0 items-center gap-2">
                      <input type="checkbox" checked={inThis} onChange={() => toggleLine(line)} />
                      <span className="truncate font-bold text-slate-700">{line.title}</span>
                      {!inThis && owner ? <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-500">in {owner.name}</span> : null}
                      {line.personId && !childIds.has(line.personId) ? <span className="shrink-0 rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-bold text-slate-400">personal</span> : null}
                    </span>
                    <span className={`shrink-0 font-black tabular-nums ${line.direction === "income" ? "text-emerald-700" : "text-slate-800"}`}>{line.direction === "income" ? "+" : "−"}{money(line.amount)}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="rounded-2xl bg-slate-50 p-4">
          <p className="text-sm font-black text-slate-950">{draft.name || "This group"} this month: {money(previewGroup?.total || 0)}</p>
          <p className="mt-1 text-xs font-bold text-slate-600">{adults.map((a) => `${a.name} ${money(previewGroup?.shares[a.id] || 0)}`).join(" · ")}</p>
          <p className="mt-1 text-xs font-semibold text-slate-500">Left for each of you: {preview.people.map((p) => `${p.name} ${money(config.settings.savingsMode === "first" ? p.leftover : p.own)}`).join(" · ")}</p>
        </div>

        {error ? <p className="text-xs font-bold text-rose-700">{error}</p> : null}
        <div className="flex flex-wrap items-center gap-2">
          <ConfirmButton
            disabled={pending || !draft.name.trim()}
            question={`Save ${draft.name.trim() || "this group"}?`}
            detail={`This changes how shared payments are split: this month ${adults.map((a) => `${a.name} pays ${money(previewGroup?.shares[a.id] || 0)}`).join(", ")} towards it.`}
            confirmLabel="Yes, save it"
            onConfirm={() => onSave(draft)}
            className="rounded-xl bg-slate-950 px-4 py-2 text-xs font-black text-white disabled:bg-slate-300"
          >
            {pending ? "Saving…" : "Save group"}
          </ConfirmButton>
          <button type="button" onClick={onClose} className="rounded-xl bg-white px-3 py-2 text-xs font-black ring-1 ring-slate-200">Cancel</button>
          {draft.id ? (
            <span className="ml-auto">
              <ConfirmButton danger disabled={pending} question={`Remove ${draft.name}?`} detail="Its payments go back to “not in a group” and stop being split." confirmLabel="Remove it" onConfirm={() => onRemove(draft.id!)} className="text-xs font-black text-rose-700">Remove group</ConfirmButton>
            </span>
          ) : null}
        </div>
      </div>
    </ModalFrame>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={`rounded-full px-3 py-1.5 text-xs font-black ring-1 transition ${active ? "bg-violet-600 text-white ring-violet-600" : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"}`}>
      {active ? "✓ " : ""}{children}
    </button>
  );
}
