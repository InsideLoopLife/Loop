#!/usr/bin/env python3
from pathlib import Path

repo = Path.cwd()
target = repo / "loop_work/domains/wealth/financial-flow/FinancialFlowPage.tsx"
backup_candidates = [
    target.with_name(target.name + ".pre-flow-v4-1.bak"),
    target.with_name(target.name + ".pre-flow-v4.bak"),
]

if not target.exists():
    raise SystemExit("ERROR: FinancialFlowPage.tsx not found. Run from the LOOP repository root.")

backup = next((p for p in backup_candidates if p.exists()), None)
if not backup:
    raise SystemExit(
        "ERROR: expected V4 backup not found. Do not edit manually; send git status so we can recover safely."
    )

text = backup.read_text(encoding="utf-8")

def replace_once(old: str, new: str, label: str):
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"ERROR: {label}: expected 1 anchor, found {count}. Nothing written.")
    text = text.replace(old, new, 1)

replace_once(
    'import { createWorkerDatabaseClient } from "@/platform/database/worker-client";\n',
    '',
    "remove rates worker import",
)

replace_once(
    '  // savings_rate_deals now lives in the separate rates-catalogue\n'
    '  // Supabase project.\n'
    '  const ratesSupabase = createWorkerDatabaseClient("rates");\n',
    '',
    "remove rates worker construction",
)

replace_once(
    '  const yearMonths = Array.from({ length: 12 }, (_, index) => `${month.key.slice(0, 4)}-${String(index + 1).padStart(2, "0")}`).map((key) => buildModel(key, false));',
    '  const yearMonths = activeTab === "flow"\n'
    '    ? Array.from({ length: 12 }, (_, index) => `${month.key.slice(0, 4)}-${String(index + 1).padStart(2, "0")}`).map((key) => buildModel(key, false))\n'
    '    : [];',
    "overview-only year calendar",
)

rate_query = '    activeTab === "savings" ? ratesSupabase.from("savings_rate_deals").select("id, provider_slug, provider_name, product_name, account_type, gross_aer, minimum_balance, maximum_balance, monthly_min_deposit, monthly_max_deposit, access_type, withdrawal_rules, notice_period_days, term_length_months, requires_existing_customer, last_checked_at, status").eq("status", "active").order("gross_aer", { ascending: false }).limit(150).returns<SavingsRateDeal[]>() : Promise.resolve({ data: [] as SavingsRateDeal[] }),'
replace_once(
    rate_query,
    '    Promise.resolve({ data: [] as SavingsRateDeal[] }),',
    "defer savings rates query",
)

replace_once(
    '      maximisedScore: score,',
    '      maximisedScore: compatibleDeals.length ? score : -1,',
    "deferred account score",
)

replace_once(
    '            annualOpportunity={flowAccountRows.reduce((sum, account) => sum + account.annualOpportunity, 0)}\n'
    '          />',
    '            annualOpportunity={flowAccountRows.reduce((sum, account) => sum + account.annualOpportunity, 0)}\n'
    '            scopePersonIds={scopeIds}\n'
    '          />',
    "savings deferred scope",
)

start_marker = 'function MainFlowDiagram({ model, people }: { model: MonthModel; people: Person[] }) {'
end_marker = '\nfunction stackedSegments('
start = text.find(start_marker)
end = text.find(end_marker, start)
if start < 0 or end < 0:
    raise SystemExit("ERROR: MainFlowDiagram anchors not found. Nothing written.")

replacement = r'''function MainFlowDiagram({ model, people }: { model: MonthModel; people: Person[] }) {
  const detailRows: FlowLine[] = [
    ...model.spendRows.slice(0, 8),
    ...model.savingsRows,
    { key: "leftover", label: "Available cash", amount: model.leftoverCash, icon: WalletCards, tone: "blue" as Tone },
  ].filter((row) => row.amount > 0);

  return (
    <>
      <FlowSankeyDiagram model={model} people={people} />
      <details className="rounded-[1.35rem] border border-slate-200 bg-white shadow-sm">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Flow detail</p>
            <p className="mt-1 text-sm font-black text-slate-950">See the lines behind this picture</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-black text-slate-600">
            {detailRows.length} groups
          </span>
        </summary>
        <div className="grid gap-2 border-t border-slate-100 p-4 lg:grid-cols-2">
          {detailRows.map((row) => (
            <details key={row.key} className="rounded-xl bg-slate-50 p-3">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                <span className="font-black text-slate-900">{row.label}</span>
                <span className="text-sm font-black text-slate-950">{formatMoney(row.amount)}</span>
              </summary>
              <div className="mt-2 space-y-2 border-t border-slate-200 pt-2">
                {(row.evidence?.length
                  ? row.evidence
                  : [{ key: row.key, label: row.label, amount: row.amount, href: row.href }]
                ).map((item) => (
                  <div key={item.key} className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2">
                    <span className="text-xs font-bold text-slate-600">{item.label}</span>
                    <span className="flex items-center gap-2">
                      <strong className="text-xs text-slate-950">{formatMoney(item.amount)}</strong>
                      <Link href={item.href || `/spending?month=${model.key}`} className="text-[10px] font-black text-emerald-700">
                        Edit
                      </Link>
                    </span>
                  </div>
                ))}
              </div>
            </details>
          ))}
        </div>
      </details>
    </>
  );
}
'''
text = text[:start] + replacement + text[end:]

if "ratesSupabase" in text:
    raise SystemExit("ERROR: ratesSupabase still present after patch. Nothing written.")
if 'Promise.resolve({ data: [] as SavingsRateDeal[] })' not in text:
    raise SystemExit("ERROR: deferred deals placeholder missing. Nothing written.")
if 'scopePersonIds={scopeIds}' not in text:
    raise SystemExit("ERROR: savings scope handoff missing. Nothing written.")

broken_backup = target.with_name(target.name + ".broken-v4-1.bak")
if not broken_backup.exists():
    broken_backup.write_text(target.read_text(encoding="utf-8"), encoding="utf-8")

target.write_text(text, encoding="utf-8")

print("FinancialFlowPage.tsx restored from the clean V4 backup and V4.2 hotfix applied.")
print("No other files were changed.")
print()
print("Next:")
print("  git diff --check")
print("  cd loop_work")
print("  npm run typecheck")
