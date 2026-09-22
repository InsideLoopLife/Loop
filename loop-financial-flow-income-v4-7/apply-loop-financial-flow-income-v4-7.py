#!/usr/bin/env python3
from pathlib import Path
repo=Path.cwd(); pkg=Path(__file__).resolve().parent
if not (repo/'loop_work/package.json').exists(): raise SystemExit('ERROR: run from LOOP repository root')

def replace_once(text, old, new, label):
    if new in text and old not in text: return text
    c=text.count(old)
    if c!=1: raise RuntimeError(f'{label}: expected 1 anchor, found {c}')
    return text.replace(old,new,1)

def insert_before(text, needle, addition, label):
    if addition in text: return text
    i=text.find(needle)
    if i<0: raise RuntimeError(f'{label}: anchor missing')
    return text[:i]+addition+text[i:]

def insert_after(text, needle, addition, label):
    if addition in text: return text
    i=text.find(needle)
    if i<0: raise RuntimeError(f'{label}: anchor missing')
    i+=len(needle); return text[:i]+addition+text[i:]

changes={}

p=repo/'loop_work/domains/wealth/financial-flow/FinancialFlowPage.tsx'; t=p.read_text(encoding='utf-8')
t=replace_once(t,'import { FinancialFlowRetainedOverviewBridge } from "@/components/financial-flow/FinancialFlowRetainedOverviewBridge";\n','import { FinancialFlowRetainedOverviewBridge } from "@/components/financial-flow/FinancialFlowRetainedOverviewBridge";\nimport { IncomeFlowScopeView, type IncomeFlowScope } from "@/components/financial-flow/IncomeFlowScopeView";\n','flow import')
t=replace_once(t,'  function buildModel(monthKey: string, scoped = true): MonthModel {\n    const parsed = parseMonth(monthKey);\n    const rangeStart = iso(parsed.start);\n    const rangeEnd = iso(parsed.end);\n    const activeScope = scoped ? scopeIds : [];\n','  function buildModel(monthKey: string, scoped = true, overrideScopeIds?: string[]): MonthModel {\n    const parsed = parseMonth(monthKey);\n    const rangeStart = iso(parsed.start);\n    const rangeEnd = iso(parsed.end);\n    const activeScope = overrideScopeIds ?? (scoped ? scopeIds : []);\n','scope override')
addition='''  const incomeScopeViews: IncomeFlowScope[] = activeTab === "income"\n    ? [{ key: "all", label: "Whole household", ids: [] as string[] }, ...people.map((person) => ({ key: person.id, label: person.name, ids: [person.id] }))].map((scope) => {\n        const scopedModel = scope.key === "all" ? buildModel(month.key, true, []) : buildModel(month.key, true, scope.ids);\n        return { key: scope.key, label: scope.label, totalIncome: scopedModel.totalIncome, committedSpending: scopedModel.committedSpending, savingsTotal: scopedModel.savingsTotal, leftoverCash: scopedModel.leftoverCash, savingsRate: scopedModel.totalIncome > 0 ? scopedModel.savingsTotal / scopedModel.totalIncome * 100 : 0, lines: scopedModel.incomeLines.map((line) => ({ key: line.key, label: line.label, amount: line.amount, kind: line.key.startsWith("pay-") ? "direct" as const : "other" as const })) };\n      }) : [];\n  const initialIncomeScopeKey = scopeIds.length === 1 ? scopeIds[0] : "all";\n'''
t=insert_after(t,'  const savingsRate = model.totalIncome > 0 ? (model.savingsTotal / model.totalIncome) * 100 : 0;\n',addition,'income scope views')
t=replace_once(t,'        <ScopeSelector people={people} activeTab={activeTab} month={month.key} scopeIds={scopeIds} />\n','        {activeTab === "income" ? null : <div className="my-2 py-2"><ScopeSelector people={people} activeTab={activeTab} month={month.key} scopeIds={scopeIds} /></div>}\n','scope spacing')
t=replace_once(t,'        ) : (\n          <>\n            <section className={`grid gap-4 md:grid-cols-4 ${activeTab === "spending" ? "xl:grid-cols-5" : ""}`}>\n','        ) : activeTab === "income" ? (\n          <IncomeFlowScopeView month={month.key} people={people.map((person) => ({ id: person.id, name: person.name, avatarUrl: person.avatar_url }))} scopes={incomeScopeViews} initialScopeKey={initialIncomeScopeKey} />\n        ) : (\n          <>\n            <section className={`grid gap-4 md:grid-cols-4 ${activeTab === "spending" ? "xl:grid-cols-5" : ""}`}>\n','income branch')
t=replace_once(t,'            <MoneyFlowCalendar months={yearMonths} selectedMonth={month.key} activeTab={activeTab} scopeIds={scopeIds} />\n','            {yearMonths.length ? <MoneyFlowCalendar months={yearMonths} selectedMonth={month.key} activeTab={activeTab} scopeIds={scopeIds} /> : null}\n','empty calendar')
t=replace_once(t,'<div><p className="text-xs font-black uppercase tracking-[0.22em] text-slate-400">{month}</p><h3 className="text-xl font-black text-slate-950">This month&apos;s {activeTab} breakdown</h3></div>','<div><h3 className="text-xl font-black text-slate-950">This month&apos;s {activeTab} breakdown</h3></div>','raw month label')
changes[p]=t

p=repo/'loop_work/components/financial-flow/FinancialFlowWorkspaceNav.tsx'; t=p.read_text(encoding='utf-8')
t=replace_once(t,'import { useRouter } from "next/navigation";\n','import { usePathname, useRouter } from "next/navigation";\n','pathname import')
nav_helpers='''function summaryHrefFor(section: FinancialFlowWorkspaceSection, month?: string | null) {\n  const query = new URLSearchParams();\n  if (section !== "flow") query.set("tab", section);\n  if (month) query.set("month", month);\n  const value = query.toString();\n  return value ? `/financial-flow?${value}` : "/financial-flow";\n}\n\nfunction detailHrefFor(section: FinancialFlowWorkspaceSection, month?: string | null) {\n  const suffix = month ? `?month=${encodeURIComponent(month)}` : "";\n  if (section === "income") return `/income${suffix}`;\n  if (section === "spending") return `/spending${suffix}`;\n  if (section === "savings") return "/accounts?tab=accounts";\n  return summaryHrefFor(section, month);\n}\n\nfunction isDetailPath(section: FinancialFlowWorkspaceSection, pathname: string) {\n  if (section === "income") return pathname === "/income";\n  if (section === "spending") return pathname === "/spending";\n  if (section === "savings") return pathname === "/accounts";\n  return false;\n}\n\n'''
t=insert_before(t,'export function FinancialFlowWorkspaceNav({\n',nav_helpers,'nav helpers')
t=replace_once(t,'  const router = useRouter();\n  const { beginTransition } = useFinancialFlowRetained();\n','  const router = useRouter();\n  const pathname = usePathname();\n  const { beginTransition } = useFinancialFlowRetained();\n','pathname state')
t=replace_once(t,'              const Icon = item.icon;\n              const active = item.key === section;\n              return (\n                <Link\n                  key={item.key}\n                  href={hrefFor(item.key, month)}\n','              const Icon = item.icon;\n              const active = item.key === section;\n              const href = active ? (isDetailPath(item.key, pathname) ? summaryHrefFor(item.key, month) : detailHrefFor(item.key, month)) : summaryHrefFor(item.key, month);\n              return (\n                <Link\n                  key={item.key}\n                  href={href}\n','toggle nav')
changes[p]=t

p=repo/'loop_work/components/income/IncomeTrackerClient.tsx'; t=p.read_text(encoding='utf-8')
timeline='''  const incomeTimeline = Array.from({ length: 6 }, (_, index) => {\n    const [year, monthNumber] = month.split("-").map(Number);\n    const date = new Date(year, monthNumber - 1 + index, 1);\n    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;\n    const activePay = payEvents.filter((event) => { if (effectivePersonFilter !== "all" && event.person_id !== effectivePersonFilter) return false; return isActiveInMonth(event.effective_from, event.effective_until, monthKey); });\n    const maternityPeople = new Set(activePay.filter((event) => event.pay_kind === "maternity").map((event) => event.person_id || "household"));\n    const recurring = activePay.filter((event) => !(maternityPeople.has(event.person_id || "household") && event.pay_kind !== "maternity"));\n    const rows = recurring.map((event) => { const breakdown = getPayEventBreakdown(event, monthKey); return { id: event.id, label: event.pay_kind === "maternity" ? "Maternity pay" : event.label, amount: breakdown.monthlyNet }; });\n    return { key: monthKey, label: new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric" }).format(date), amount: rows.reduce((sum, row) => sum + row.amount, 0), rows };\n  });\n\n'''
t=insert_before(t,'  const currentPerson =\n',timeline,'income timeline model')
timeline_ui='''      <SectionCard title="Income timeline" description="The next six months of recurring take-home income from the salary and maternity changes already recorded in LOOP.">\n        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">\n          {incomeTimeline.map((item, index) => { const previous = index > 0 ? incomeTimeline[index - 1] : null; const changed = previous && Math.abs(item.amount - previous.amount) > 0.5; return (\n            <article key={item.key} className={`rounded-3xl border p-4 ${changed ? "border-orange-200 bg-orange-50/70" : "border-slate-200 bg-slate-50"}`}>\n              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">{item.label}</p><p className="mt-2 text-xl font-black text-slate-950">{formatMoney(item.amount)}</p><p className="mt-1 text-[10px] font-bold text-slate-500">{item.rows.length ? item.rows.map((row) => row.label).join(" + ") : "No recurring pay recorded"}</p>{changed ? <p className="mt-2 text-[10px] font-black text-orange-700">Income change</p> : null}\n            </article>\n          ); })}\n        </div>\n      </SectionCard>\n\n'''
t=insert_before(t,'      <section className="grid gap-6 lg:grid-cols-[1fr_.9fr]">\n        <SectionCard\n          id="deductibles"\n',timeline_ui,'timeline UI')
changes[p]=t

# Preflight complete before writes
print('Pre-flight passed: Financial Flow income V4.7 matches current code.')
newfile=repo/'loop_work/components/financial-flow/IncomeFlowScopeView.tsx'
if newfile.exists() and newfile.read_text(encoding='utf-8') != (pkg/'loop_work/components/financial-flow/IncomeFlowScopeView.tsx').read_text(encoding='utf-8'):
    raise SystemExit('ERROR: IncomeFlowScopeView.tsx already exists with different content. Nothing changed.')
if not newfile.exists():
    newfile.parent.mkdir(parents=True,exist_ok=True); newfile.write_text((pkg/'loop_work/components/financial-flow/IncomeFlowScopeView.tsx').read_text(encoding='utf-8'),encoding='utf-8',newline='\n'); print('CREATED',newfile.relative_to(repo))
for path,next_text in changes.items():
    current=path.read_text(encoding='utf-8'); bak=path.with_name(path.name+'.pre-income-v4-7.bak')
    if current==next_text: continue
    if not bak.exists(): bak.write_text(current,encoding='utf-8')
    path.write_text(next_text,encoding='utf-8',newline='\n'); print('UPDATED',path.relative_to(repo))
print('V4.7 applied. Run git diff --check and npm run typecheck.')
