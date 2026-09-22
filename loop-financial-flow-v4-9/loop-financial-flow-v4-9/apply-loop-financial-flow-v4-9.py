#!/usr/bin/env python3
from pathlib import Path

repo = Path.cwd()
pkg = Path(__file__).resolve().parent
if not (repo / 'loop_work/package.json').exists():
    raise SystemExit('ERROR: run from the LOOP repository root')

def ro(text, old, new, label, optional=False):
    if new in text and old not in text:
        return text
    count = text.count(old)
    if count == 0 and optional:
        return text
    if count != 1:
        raise RuntimeError(f'{label}: expected 1 anchor, found {count}')
    return text.replace(old, new, 1)

def ia(text, needle, addition, label):
    if addition in text:
        return text
    i = text.find(needle)
    if i < 0:
        raise RuntimeError(f'{label}: anchor missing')
    i += len(needle)
    return text[:i] + addition + text[i:]

def ib(text, needle, addition, label):
    if addition in text:
        return text
    i = text.find(needle)
    if i < 0:
        raise RuntimeError(f'{label}: anchor missing')
    return text[:i] + addition + text[i:]

def rb(text, start, end, replacement, label):
    a = text.find(start)
    b = text.find(end, a + len(start))
    if a < 0 or b < 0:
        raise RuntimeError(f'{label}: markers missing')
    return text[:a] + replacement + text[b:]

changes = {}

# Financial Flow: use real cached savings deals + longer projection + emergency baseline.
p = repo / 'loop_work/domains/wealth/financial-flow/FinancialFlowPage.tsx'
t = p.read_text(encoding='utf-8')
t = ro(t,
'''import { buildSavingsIntelligence, savingsDealEligibleBalance, savingsDealMatchesAccount } from "@/lib/wealth/savings-intelligence";\n''',
'''import { buildSavingsIntelligence, savingsDealEligibleBalance, savingsDealMatchesAccount } from "@/lib/wealth/savings-intelligence";\nimport { getCachedSavingsRateDeals } from "@/lib/wealth/cached-savings-rate-deals";\n''', 'cached rates import')
t = ib(t,
'''  const [profileResult, peopleResult, payResult, incomeResult, plannedResult, spendingEntriesResult, categoriesResult, categoryGroupsResult, accountsResult, pensionsResult, movementsResult, potsResult, potAllocationsResult, dealsResult, childCostsResult] = await Promise.all([\n''',
'''  const cachedSavingsRateDeals = activeTab === "savings" ? await getCachedSavingsRateDeals() : [];\n\n''', 'cached rates load')
t = ro(t, '''    Promise.resolve({ data: [] as SavingsRateDeal[] }),\n''', '''    Promise.resolve({ data: cachedSavingsRateDeals as SavingsRateDeal[] }),\n''', 'cached rates source')
t = ro(t,
'''  const savingsTrend = buildSavingsTrajectory(scopedSavingsAccounts as any, scopedMovements as any, 24).map((point) => ({ label: point.date.slice(0, 7), balance: point.balance, kind: point.kind === "actual" ? "recorded" as const : "projected" as const }));\n''',
'''  const savingsTrend = buildSavingsTrajectory(scopedSavingsAccounts as any, scopedMovements as any, 60).map((point) => ({ label: point.date.slice(0, 7), balance: point.balance, kind: point.kind === "actual" ? "recorded" as const : "projected" as const }));\n''', '60 month trajectory')
t = ro(t,
'''            annualOpportunity={flowAccountRows.reduce((sum, account) => sum + account.annualOpportunity, 0)}\n            scopePersonIds={scopeIds}\n''',
'''            annualOpportunity={flowAccountRows.reduce((sum, account) => sum + account.annualOpportunity, 0)}\n            scopePersonIds={scopeIds}\n            committedMonthlySpend={model.committedSpending}\n''', 'emergency baseline prop')
changes[p] = t

# Savings detail: interactive allocation + copy + encoding repair.
p = repo / 'loop_work/components/financial-flow/SavingsFlowDetail.tsx'
t = p.read_text(encoding='utf-8')
t = ro(t, '''import { SavingsAllocationDonut, SavingsTrendSvg } from "@/components/charts/StableSavingsCharts";\n''', '''import { SavingsTrendSvg } from "@/components/charts/StableSavingsCharts";\nimport { SavingsAllocationExplorer } from "@/components/financial-flow/SavingsAllocationExplorer";\n''', 'allocation import')
t = ro(t, '''  scopePersonIds?: string[];\n};\n''', '''  scopePersonIds?: string[];\n  committedMonthlySpend: number;\n};\n''', 'allocation prop')
t = ro(t, '''  scopePersonIds = [],\n}: Props) {\n''', '''  scopePersonIds = [],\n  committedMonthlySpend,\n}: Props) {\n''', 'allocation destructure')
t = ro(t,
'''          <h2 className="text-xl font-black text-slate-950">Savings allocation</h2>\n          <p className="mt-1 text-sm font-semibold text-slate-500">What is already attached to a goal versus money that is still flexible. This is allocation, not a recommendation to move cash.</p>\n          <SavingsAllocationDonut earmarked={earmarkedToPots} unassigned={unallocated} total={totalSavings} />\n''',
'''          <SavingsAllocationExplorer\n            accounts={accounts.map((account) => ({ id: account.id, name: account.name, provider: account.provider, providerSlug: account.providerSlug, balance: account.balance }))}\n            pots={pots.map((pot) => ({ id: pot.id, name: pot.name, allocated: pot.allocated, target: pot.target }))}\n            committedMonthlySpend={committedMonthlySpend}\n          />\n''', 'interactive allocation')
t = ro(t,
'''          <div className="flex items-start justify-between gap-3"><div><h2 className="text-xl font-black text-slate-950">Savings trend</h2><p className="mt-1 text-sm font-semibold text-slate-500">Recorded deposits, withdrawals and interest followed by projection.</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">24m</span></div>\n''',
'''          <div><h2 className="text-xl font-black text-slate-950">Savings trend</h2><p className="mt-1 text-sm font-semibold text-slate-500">Past evidence and future projection share one timeline. Choose the window inside the chart.</p></div>\n''', 'trend header')
t = t.replace('account.maximisedScore < 0 ? "Checking" : account.maximisedScore', 'account.maximisedScore < 0 ? "No comparable deal" : account.maximisedScore')
t = t.replace(' Â· ', ' · ').replace('"â€”"', '"—"').replace('Financial Flow Â· Savings', 'Financial Flow · Savings')
changes[p] = t

# Savings chart: clean pulsing line, range selector, hover-only dot.
p = repo / 'loop_work/components/charts/StableSavingsCharts.tsx'
t = p.read_text(encoding='utf-8')
newtrend = r'''export function SavingsTrendSvg({ data }: { data: TrendPoint[] }) {
  const width = 760;
  const height = 260;
  const [hover, setHover] = useState<number | null>(null);
  const [range, setRange] = useState<"1Y" | "2Y" | "5Y" | "MAX">("2Y");
  const visible = useMemo(() => {
    if (range === "MAX" || !data.length) return data;
    const months = range === "1Y" ? 12 : range === "2Y" ? 24 : 60;
    const half = Math.floor(months / 2);
    const now = new Date();
    const minDate = new Date(now.getFullYear(), now.getMonth() - half, 1);
    const maxDate = new Date(now.getFullYear(), now.getMonth() + half, 1);
    return data.filter((point) => {
      const d = new Date(`${point.label}-01T12:00:00`);
      return Number.isFinite(d.getTime()) && d >= minDate && d <= maxDate;
    });
  }, [data, range]);
  const values = visible.flatMap((point) => [point.recorded, point.projected].filter((value): value is number => value != null && Number.isFinite(value)));
  const firstProjected = visible.findIndex((point) => point.projected != null && point.recorded == null);
  const hasGap = visible.some((point) => point.recorded == null && point.projected == null);
  if (!values.length) return <div className="grid h-64 place-items-center rounded-2xl border border-dashed border-slate-200 text-center text-sm font-bold text-slate-400">No recorded savings balance history yet.<br />LOOP will not invent a line between missing months.</div>;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const recorded = pointsFor(visible.map((point) => point.recorded ?? null), width, height, min, max);
  const projected = pointsFor(visible.map((point) => point.projected ?? null), width, height, min, max);
  const markerPoints = pointsFor(visible.map((row) => row.recorded ?? row.projected ?? null), width, height, min, max);
  const active = hover == null ? null : visible[hover];
  const projectionBoundaryX = firstProjected > 0 && visible.length > 1 ? 36 + (firstProjected / (visible.length - 1)) * (width - 72) : null;
  return <div>
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap gap-2"><LegendChip kind="recorded" label="Recorded ledger balance" /><LegendChip kind="projected" label="Projected from current plan" />{hasGap ? <LegendChip kind="gap" label="Gap = no recorded evidence" /> : null}</div>
      <div className="flex rounded-full bg-slate-100 p-1">{(["1Y","2Y","5Y","MAX"] as const).map((option) => <button key={option} type="button" onClick={() => { setRange(option); setHover(null); }} className={`rounded-full px-3 py-1 text-[10px] font-black ${range === option ? "bg-white text-slate-950 shadow-sm" : "text-slate-500"}`}>{option === "MAX" ? "Max" : option}</button>)}</div>
    </div>
    <div className="relative h-64 w-full">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-full w-full" preserveAspectRatio="none" onMouseLeave={() => setHover(null)} role="img" aria-label="Recorded and projected savings balance">
        {projectionBoundaryX != null ? <rect x={projectionBoundaryX} y="0" width={width - projectionBoundaryX} height={height} fill="rgba(16,185,129,.045)" /> : null}
        {[0.25,0.5,0.75].map((ratio) => <line key={ratio} x1="36" x2={width-36} y1={26+(height-52)*ratio} y2={26+(height-52)*ratio} stroke="#e2e8f0" strokeDasharray="4 7" />)}
        {projectionBoundaryX != null ? <line x1={projectionBoundaryX} x2={projectionBoundaryX} y1="18" y2={height-18} stroke="#10b981" strokeDasharray="3 6" opacity=".7" /> : null}
        <path d={pathFor(recorded)} fill="none" stroke="#0f172a" strokeWidth="3" vectorEffect="non-scaling-stroke" className="animate-pulse" />
        <path d={pathFor(projected)} fill="none" stroke="#10b981" strokeWidth="3" strokeDasharray="8 6" vectorEffect="non-scaling-stroke" className="animate-pulse" />
        {markerPoints.map((marker,index) => marker ? <circle key={`hit-${index}`} cx={marker.x} cy={marker.y} r="11" fill="transparent" onMouseEnter={() => setHover(index)} /> : null)}
        {hover != null && markerPoints[hover] ? <circle cx={markerPoints[hover]!.x} cy={markerPoints[hover]!.y} r="6" fill={visible[hover]?.recorded != null ? "#0f172a" : "white"} stroke={visible[hover]?.recorded != null ? "#0f172a" : "#10b981"} strokeWidth="2.5" /> : null}
      </svg>
      <div className="absolute inset-x-2 bottom-0 flex justify-between text-[10px] font-bold text-slate-400"><span>{visible[0]?.label}</span><span>{visible[visible.length-1]?.label}</span></div>
      {active ? <div className="absolute right-3 top-3 rounded-xl border border-slate-200 bg-white/95 px-3 py-2 text-xs font-bold shadow-lg"><p className="font-black text-slate-950">{active.label}</p>{active.recorded != null ? <p>Recorded ledger balance {formatMoney(active.recorded)}</p> : null}{active.projected != null && active.recorded == null ? <p className="text-emerald-700">Projection {formatMoney(active.projected)}</p> : null}</div> : null}
    </div>
    <p className="mt-2 text-[10px] font-bold text-slate-400">The selected window is centred on today where possible — for example 5Y aims for 2.5 years behind and 2.5 years ahead. Hover the line to reveal individual points.</p>
  </div>;
}

'''
t = rb(t, 'export function SavingsTrendSvg', 'export function SavingsMovementSvg', newtrend, 'trend replacement')
changes[p] = t

# Nav: prefetch exact summary/detail target including selected month.
p = repo / 'loop_work/components/financial-flow/FinancialFlowWorkspaceNav.tsx'
t = p.read_text(encoding='utf-8')
t = ro(t,
'''  useEffect(() => {\n    const id = window.setTimeout(() => {\n      router.prefetch("/financial-flow");\n      router.prefetch("/financial-flow?tab=savings");\n      router.prefetch("/income");\n      router.prefetch("/spending");\n    }, 80);\n    return () => window.clearTimeout(id);\n  }, [router]);\n''',
'''  useEffect(() => {\n    const id = window.setTimeout(() => {\n      for (const item of ITEMS) {\n        router.prefetch(summaryHrefFor(item.key, month));\n        router.prefetch(detailHrefFor(item.key, month));\n      }\n    }, 40);\n    return () => window.clearTimeout(id);\n  }, [router, month]);\n''', 'exact route prefetch')
t = ro(t, '''                  onClick={() => beginTransition(item.key, month)}\n''', '''                  onMouseEnter={() => router.prefetch(href)}\n                  onFocus={() => router.prefetch(href)}\n                  onClick={() => beginTransition(item.key, month)}\n''', 'hover prefetch')
changes[p] = t

# Spending actions: bulk category / line delete, one revalidation pass.
p = repo / 'loop_work/app/spending/actions.ts'
t = p.read_text(encoding='utf-8')
bulk = r'''export async function deleteSpendingCategoriesBulk(ids: string[]) {
  const cleanIds = Array.from(new Set((ids || []).map(String).filter(Boolean))).slice(0, 100);
  if (!cleanIds.length) return;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const householdContext = await getActiveHouseholdContext(supabase, user);
  for (const id of cleanIds) {
    const { error } = await applyMutableRecordFilter(supabase.from("spending_categories").delete(), id, householdContext);
    if (error) throw new Error(error.message);
  }
  revalidateSpendingStructure();
}

export async function deleteFinancialFlowLinesBulk(lineIds: string[]) {
  const clean = Array.from(new Set((lineIds || []).map(String).filter(Boolean))).slice(0, 100);
  if (!clean.length) return;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const householdContext = await getActiveHouseholdContext(supabase, user);
  for (const lineId of clean) {
    const [kind, id] = lineId.split(":", 2);
    if (!id) continue;
    const table = kind === "planned" ? "planned_items" : kind === "entry" ? "spending_entries" : null;
    if (!table) continue;
    const { error } = await applyMutableRecordFilter(supabase.from(table).delete(), id, householdContext);
    if (error) throw new Error(error.message);
  }
  revalidateSpendingViews();
}

'''
t = ib(t, 'export async function deleteSpendingCategory(formData: FormData) {', bulk, 'bulk delete actions')
changes[p] = t

# Spending client: optimistic category/line deletion and bulk controls.
p = repo / 'loop_work/components/spending/SpendingPlannerClient.tsx'
t = p.read_text(encoding='utf-8')
t = ro(t, 'import { useEffect, useMemo, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";\n', 'import { useEffect, useMemo, useState, useTransition, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";\n', 'transition import')
t = ro(t, '  deleteSpendingCategory,\n', '  deleteSpendingCategory,\n  deleteSpendingCategoriesBulk,\n  deleteFinancialFlowLinesBulk,\n', 'bulk imports')
t = ia(t, '  const [selectedMonth, setSelectedMonth] = useState(initialMonthValue);\n', '''  const [optimisticDeletedLineIds, setOptimisticDeletedLineIds] = useState<string[]>([]);\n  const [optimisticDeletedCategoryIds, setOptimisticDeletedCategoryIds] = useState<string[]>([]);\n  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);\n  const [deletePending, startDeleteTransition] = useTransition();\n''', 'optimistic state')
helpers = r'''  function deleteLinesOptimistically(lineIds: string[]) {
    const ids = Array.from(new Set(lineIds.filter(Boolean)));
    if (!ids.length || !confirmDelete(`Delete ${ids.length} selected item${ids.length === 1 ? "" : "s"}?`)) return;
    setOptimisticDeletedLineIds((current) => Array.from(new Set([...current, ...ids])));
    setSelectedLineIds((current) => current.filter((id) => !ids.includes(id)));
    startDeleteTransition(async () => {
      try { await deleteFinancialFlowLinesBulk(ids); }
      catch (error) { setOptimisticDeletedLineIds((current) => current.filter((id) => !ids.includes(id))); console.error(error); }
    });
  }
  function deleteCategoriesOptimistically(ids: string[]) {
    const clean = Array.from(new Set(ids.filter(Boolean)));
    if (!clean.length || !confirmDelete(`Delete ${clean.length} categor${clean.length === 1 ? "y" : "ies"}?`)) return;
    setOptimisticDeletedCategoryIds((current) => Array.from(new Set([...current, ...clean])));
    setSelectedCategoryIds((current) => current.filter((id) => !clean.includes(id)));
    startDeleteTransition(async () => {
      try { await deleteSpendingCategoriesBulk(clean); }
      catch (error) { setOptimisticDeletedCategoryIds((current) => current.filter((id) => !clean.includes(id))); console.error(error); }
    });
  }

'''
t = ib(t, '  function openAdd(mode: AddMode, template?: SimpleFlowTemplate) {\n', helpers, 'delete helpers')
t = ro(t,
'''              <div key={item.id} title={("lifecycleHint" in item && item.lifecycleHint) ? item.lifecycleHint : undefined} className="group/line relative min-h-[6.25rem] rounded-2xl border border-slate-200 bg-white p-4">\n''',
'''              <div key={item.id} title={("lifecycleHint" in item && item.lifecycleHint) ? item.lifecycleHint : undefined} className={`${selectableId && optimisticDeletedLineIds.includes(selectableId) ? "hidden" : ""} group/line relative min-h-[6.25rem] rounded-2xl border border-slate-200 bg-white p-4`}>\n''', 'hide deleted line')
t = ro(t,
'''                        <form action={deletePlannedItem} onSubmit={(event) => { if (!confirmDelete(`Delete ${item.title}?`)) event.preventDefault(); }}>\n                          <input type="hidden" name="id" value={item.item.id} />\n                          <button className="text-sm font-medium text-red-600">Delete</button>\n                        </form>\n''',
'''                        <button type="button" disabled={deletePending} onClick={() => deleteLinesOptimistically([`planned:${item.item.id}`])} className="text-sm font-medium text-red-600 disabled:opacity-40">Delete</button>\n''', 'planned ajax delete')
t = ro(t,
'''                      <form action={deleteSpendingEntry} onSubmit={(event) => { if (!confirmDelete(`Delete ${item.title}?`)) event.preventDefault(); }}>\n                        <input type="hidden" name="id" value={item.entry.id} />\n                        <button className="text-sm font-medium text-red-600">Delete</button>\n                      </form>\n''',
'''                      <button type="button" disabled={deletePending} onClick={() => deleteLinesOptimistically([`entry:${item.entry.id}`])} className="text-sm font-medium text-red-600 disabled:opacity-40">Delete</button>\n''', 'entry ajax delete')
t = ro(t,
'''                <button type="button" onClick={() => setSelectedLineIds([])} className="rounded-full bg-slate-100 px-4 py-2 text-xs font-black text-slate-700 hover:bg-slate-200">Clear</button>\n''',
'''                <button type="button" disabled={!selectedLineIds.length || deletePending} onClick={() => deleteLinesOptimistically(selectedLineIds)} className="rounded-full bg-red-50 px-4 py-2 text-xs font-black text-red-700 disabled:opacity-40">Delete selected</button>\n                <button type="button" onClick={() => setSelectedLineIds([])} className="rounded-full bg-slate-100 px-4 py-2 text-xs font-black text-slate-700 hover:bg-slate-200">Clear</button>\n''', 'bulk line button')
t = ro(t, '              <div key={category.id} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">\n', '              <div key={category.id} className={`${optimisticDeletedCategoryIds.includes(category.id) ? "hidden" : ""} rounded-3xl border border-slate-200 bg-white p-4 shadow-sm`}>\n', 'hide category')
t = ro(t,
'''                  {editingEnabled ? (\n                    <form action={deleteSpendingCategory} onSubmit={(event) => { if (!confirmDelete(`Delete ${category.name}?`)) event.preventDefault(); }}>\n                      <input type="hidden" name="id" value={category.id} />\n                      <button className="text-xs font-black text-red-600">Delete</button>\n                    </form>\n                  ) : null}\n''',
'''                  {editingEnabled ? (\n                    <div className="flex items-center gap-2">\n                      <input type="checkbox" checked={selectedCategoryIds.includes(category.id)} onChange={() => setSelectedCategoryIds((current) => current.includes(category.id) ? current.filter((id) => id !== category.id) : [...current, category.id])} aria-label={`Select ${category.name}`} className="h-4 w-4 rounded border-slate-300" />\n                      <button type="button" disabled={deletePending} onClick={() => deleteCategoriesOptimistically([category.id])} className="text-xs font-black text-red-600 disabled:opacity-40">Delete</button>\n                    </div>\n                  ) : null}\n''', 'category ajax delete')
t = ro(t,
'''          return (\n            <div className="space-y-6">\n              {orderedKeys.map((key) => {\n''',
'''          return (\n            <div className="space-y-6">\n              {editingEnabled ? <div className="sticky top-20 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur"><p className="text-xs font-black text-slate-600">{selectedCategoryIds.length} categories selected</p><div className="flex gap-2"><button type="button" disabled={!selectedCategoryIds.length || deletePending} onClick={() => deleteCategoriesOptimistically(selectedCategoryIds)} className="rounded-full bg-red-50 px-4 py-2 text-xs font-black text-red-700 disabled:opacity-40">Delete selected</button><button type="button" onClick={() => setSelectedCategoryIds([])} className="rounded-full bg-slate-100 px-4 py-2 text-xs font-black text-slate-600">Clear</button></div></div> : null}\n              {orderedKeys.map((key) => {\n''', 'category bulk toolbar')
changes[p] = t

# Preflight payload + all edits before any writes.
payload_rel = 'loop_work/components/financial-flow/SavingsAllocationExplorer.tsx'
payload_src = pkg / payload_rel
payload_dst = repo / payload_rel
if not payload_src.exists():
    raise SystemExit('ERROR: payload missing')
if payload_dst.exists() and payload_dst.read_text(encoding='utf-8') != payload_src.read_text(encoding='utf-8'):
    raise SystemExit('ERROR: SavingsAllocationExplorer.tsx already exists with different content. Nothing changed.')
print('Pre-flight passed: Financial Flow V4.9 matches current code.')
if not payload_dst.exists():
    payload_dst.parent.mkdir(parents=True, exist_ok=True)
    payload_dst.write_text(payload_src.read_text(encoding='utf-8'), encoding='utf-8', newline='\n')
    print('CREATED', payload_rel)
else:
    print('UNCHANGED', payload_rel)
for path, updated in changes.items():
    current = path.read_text(encoding='utf-8')
    if current == updated:
        print('UNCHANGED', path.relative_to(repo)); continue
    backup = path.with_name(path.name + '.pre-flow-v4-9.bak')
    if not backup.exists(): backup.write_text(current, encoding='utf-8')
    path.write_text(updated, encoding='utf-8', newline='\n')
    print('UPDATED', path.relative_to(repo))
print('\nV4.9 applied:')
print('- real cached savings-rate catalogue replaces perpetual Checking placeholder')
print('- savings trend: 1Y / 2Y / 5Y / Max, pulse, dots only on hover')
print('- 60 months of future projection for longer windows')
print('- allocation toggles Accounts <-> Needs with 3m/6m emergency-fund coverage and pot shortfalls')
print('- exact summary/detail routes prefetched for the selected month')
print('- spending line/category deletes hide immediately and complete asynchronously')
print('- bulk selected line/category deletion')
print('- visible mojibake separators/dashes repaired')
print('\nRun git diff --check and npm run typecheck before staging.')
