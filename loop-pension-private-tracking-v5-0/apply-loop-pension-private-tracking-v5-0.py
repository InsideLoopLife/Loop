#!/usr/bin/env python3
from pathlib import Path

repo = Path.cwd()
if not (repo / "loop_work/package.json").exists():
    raise SystemExit("ERROR: run this from C:\\Users\\danie\\Documents\\Loop (the repository root).")

def replace_once(text, old, new, label):
    if new in text and old not in text:
        return text
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected 1 anchor, found {count}")
    return text.replace(old, new, 1)

def insert_before(text, needle, addition, label):
    if addition in text:
        return text
    pos = text.find(needle)
    if pos < 0:
        raise RuntimeError(f"{label}: anchor missing")
    return text[:pos] + addition + text[pos:]

changes = {}

# Server action: store user-supplied long-term return evidence in the
# existing nullable performance fields. No migration is required.
p = repo / "loop_work/lib/investments/actions.ts"
t = p.read_text(encoding="utf-8")

manual_action = r'''
export async function updatePensionFundManualPerformance(formData: FormData) {
  const { supabase, user } = await currentUser();
  const id = String(formData.get("id") || "");
  if (!id) throw new Error("Choose a pension fund first.");

  const valueOrNull = (name: string) => {
    const raw = String(formData.get(name) || "").trim();
    if (!raw) return null;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) throw new Error(`${name} must be a number.`);
    return parsed;
  };

  const performance5y = valueOrNull("performance_annualised_5y_percent");
  const performance10y = valueOrNull("performance_annualised_10y_percent");
  const sourceUrl = nullableString(formData.get("performance_source_url"));
  const asOfDate =
    nullableString(formData.get("performance_as_of_date")) ||
    new Date().toISOString().slice(0, 10);

  const { error } = await supabase
    .from("pension_funds")
    .update({
      performance_annualised_5y_percent: performance5y,
      performance_annualised_10y_percent: performance10y,
      performance_as_of_date: asOfDate,
      performance_source_url: sourceUrl,
      performance_status: "manual_user_supplied",
      performance_verified_at: null,
      updated_at: new Date().toISOString(),
    } as any)
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);
  revalidatePath("/investments");
  revalidatePath("/net-worth");
}

'''
t = insert_before(
    t,
    'export async function updatePensionFund(formData: FormData) {',
    manual_action,
    "manual return action",
)
changes[p] = t

# Main pension UI.
p = repo / "loop_work/components/investments/PensionsInvestmentsClient.tsx"
t = p.read_text(encoding="utf-8")

t = replace_once(
    t,
    '  updatePensionFund,\n',
    '  updatePensionFund,\n  updatePensionFundManualPerformance,\n',
    "manual performance import",
)

private_card = r'''
  const privateKind = String(account.pension_type || "").toLowerCase();
  const isPrivatePension =
    privateKind.includes("private") ||
    privateKind.includes("personal") ||
    privateKind.includes("sipp");

  if (isPrivatePension) {
    const regular = Math.max(0, Number(account.fixed_monthly_contribution || 0));
    return (
      <div className="mt-4 rounded-[1.5rem] border border-teal-100 bg-white p-4 shadow-sm sm:mt-6 sm:rounded-[2rem] sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-teal-700">Private pension contributions</p>
            <h3 className="mt-1 text-lg font-black text-slate-950">Money going into this pension</h3>
            <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-500 sm:text-sm">
              Private pensions are tracked from contributions and provider confirmations. Salary sacrifice and employer NI are hidden because they are not part of this pot&apos;s contribution method.
            </p>
          </div>
          <span className="rounded-full bg-teal-50 px-3 py-2 text-xs font-black text-teal-800">Private / manually tracked</span>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-center">
          <div className="rounded-2xl bg-slate-50 p-4">
            <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Regular contribution</p>
            <p className="mt-1 text-2xl font-black text-slate-950">{formatMoney(regular)}</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">per month</p>
          </div>
          <span className="hidden text-xl font-black text-slate-300 sm:block">+</span>
          <div className="rounded-2xl bg-sky-50 p-4">
            <p className="text-[10px] font-black uppercase tracking-wide text-sky-600">Manual threads</p>
            <p className="mt-1 text-base font-black text-slate-950">Add when money moves</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">Contribution, transfer or fund purchase</p>
          </div>
          <span className="hidden text-xl font-black text-slate-300 sm:block">→</span>
          <div className="rounded-2xl bg-teal-50 p-4">
            <p className="text-[10px] font-black uppercase tracking-wide text-teal-700">Expected regular input</p>
            <p className="mt-1 text-2xl font-black text-teal-950">{formatMoney(regular)}</p>
            <p className="mt-1 text-xs font-semibold text-teal-700">before any one-offs</p>
          </div>
        </div>

        <p className="mt-3 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white">
          {regular > 0
            ? `LOOP expects ${formatMoney(regular)} per month from the private contribution setting. Manual threads remain separate evidence.`
            : "No regular contribution is set. Use the thread below whenever you make a contribution or transfer."}
        </p>
      </div>
    );
  }

'''
t = insert_before(
    t,
    '  const result = projectedAccountContributionBreakdown(account, payEvents);\n',
    private_card,
    "private pension contribution UX",
)

t = replace_once(
    t,
    '''          <summary className="cursor-pointer text-sm font-black text-teal-900">
            Add a dated pension purchase
          </summary>
''',
    '''          <summary className="cursor-pointer text-sm font-black text-teal-900">
            + Add a manual pension thread
          </summary>
          <p className="mt-2 text-xs font-semibold text-teal-800/80">
            Use this when the provider does not sync the transaction automatically. Amount + date are enough; unit price and units can be added when your statement provides them.
          </p>
''',
    "manual thread summary",
)

t = replace_once(
    t,
    '          <p className="mt-1 text-xl font-black">{return5y == null ? "Building history" : `${return5y.toFixed(2)}%`}</p>\n',
    '          <p className="mt-1 text-xl font-black">{return5y == null ? "Not enough verified history" : `${return5y.toFixed(2)}%`}</p>\n',
    "5y missing history",
)
t = replace_once(
    t,
    '          <p className="mt-1 text-xl font-black">{return10y == null ? "Building history" : `${return10y.toFixed(2)}%`}</p>\n',
    '          <p className="mt-1 text-xl font-black">{return10y == null ? "Not enough verified history" : `${return10y.toFixed(2)}%`}</p>\n',
    "10y missing history",
)
t = replace_once(
    t,
    '          <p className="mt-1 text-[11px] font-semibold text-slate-400">Value-weighted, verified fund history</p>\n',
    '          <p className="mt-1 text-[11px] font-semibold text-slate-400">{funds.some((item) => item.performance_status === "manual_user_supplied") ? "Includes user-supplied annualised returns" : "Value-weighted, verified fund history"}</p>\n',
    "5y provenance",
)

old_hist = '          <p className="mt-1 text-[11px] font-semibold text-slate-400">Historical return, not a guarantee</p>\n'
if old_hist in t:
    t = t.replace(
        old_hist,
        '          <p className="mt-1 text-[11px] font-semibold text-slate-400">{funds.some((item) => item.performance_status === "manual_user_supplied") ? "Manual values are shown as user supplied" : "Historical return, not a guarantee"}</p>\n',
        1,
    )

old_evidence = '''                {item.performance_source_url ? <a href={item.performance_source_url} target="_blank" rel="noreferrer" className="text-xs font-black text-teal-700">Evidence ↗</a> : <span className="text-xs font-black text-amber-700">Needs evidence</span>}
'''
new_evidence = '''                <div className="flex flex-wrap items-center gap-2">
                  {item.performance_source_url ? <a href={item.performance_source_url} target="_blank" rel="noreferrer" className="text-xs font-black text-teal-700">Evidence ↗</a> : <span className="text-xs font-black text-amber-700">Needs evidence</span>}
                  {item.performance_status === "manual_user_supplied" ? <span className="rounded-full bg-orange-50 px-2 py-1 text-[10px] font-black text-orange-700">User supplied</span> : null}
                  <details className="relative">
                    <summary className="cursor-pointer list-none rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-700">Edit returns</summary>
                    <div className="mt-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:absolute sm:right-0 sm:z-30 sm:w-[24rem] sm:bg-white sm:shadow-xl">
                      <form action={updatePensionFundManualPerformance} className="grid gap-3 sm:grid-cols-2">
                        <input type="hidden" name="id" value={item.id} />
                        <label className="text-[10px] font-black uppercase text-slate-500">5-year annualised %
                          <input name="performance_annualised_5y_percent" type="number" step="0.01" defaultValue={item.performance_annualised_5y_percent ?? ""} className={inputClass} placeholder="Leave blank if unknown" />
                        </label>
                        <label className="text-[10px] font-black uppercase text-slate-500">10-year annualised %
                          <input name="performance_annualised_10y_percent" type="number" step="0.01" defaultValue={item.performance_annualised_10y_percent ?? ""} className={inputClass} placeholder="Leave blank if unknown" />
                        </label>
                        <label className="text-[10px] font-black uppercase text-slate-500">As at
                          <input name="performance_as_of_date" type="date" defaultValue={item.performance_as_of_date || today} className={inputClass} />
                        </label>
                        <label className="text-[10px] font-black uppercase text-slate-500">Provider / factsheet URL
                          <input name="performance_source_url" defaultValue={item.performance_source_url || ""} className={inputClass} placeholder="Optional but recommended" />
                        </label>
                        <p className="sm:col-span-2 text-[10px] font-semibold leading-4 text-slate-500">
                          Manual values are stored as user-supplied evidence. LOOP will not relabel them as researched or provider-verified history.
                        </p>
                        <button className="sm:col-span-2 rounded-xl bg-slate-950 px-4 py-2 text-xs font-black text-white">Save manual returns</button>
                      </form>
                    </div>
                  </details>
                </div>
'''
t = replace_once(t, old_evidence, new_evidence, "manual return editor")
changes[p] = t

# Wizard hint so manually tracked funds are not forced to invent returns.
p = repo / "loop_work/components/investments/AddPensionFundWizard.tsx"
t = p.read_text(encoding="utf-8")
t = replace_once(
    t,
    '        <FormInput label="Fee/source URL" name="fee_source_url" defaultValue={defaults?.fee_source_url ?? ""} placeholder="Provider fund factsheet" />\n',
    '        <FormInput label="Fee/source URL" name="fee_source_url" defaultValue={defaults?.fee_source_url ?? ""} placeholder="Provider fund factsheet" />\n        <p className="rounded-2xl bg-sky-50 px-4 py-3 text-xs font-semibold text-sky-900">If this is a manually tracked fund and 5-year / 10-year annualised returns are available on your statement or factsheet, add them later under <strong>Fund return evidence → Edit returns</strong>. Leave them blank when the provider does not publish enough history.</p>\n',
    "manual returns wizard hint",
)
changes[p] = t

print("Pre-flight passed: Pension private-tracking V5.0 anchors match.")

for path, updated in changes.items():
    current = path.read_text(encoding="utf-8")
    if current == updated:
        print("UNCHANGED", path.relative_to(repo))
        continue
    backup = path.with_name(path.name + ".pre-pension-v5-0.bak")
    if not backup.exists():
        backup.write_text(current, encoding="utf-8")
    path.write_text(updated, encoding="utf-8", newline="\n")
    print("UPDATED", path.relative_to(repo))

print()
print("Pension V5.0 applied:")
print("- private/SIPP pensions no longer foreground salary-sacrifice/employer/NI boxes")
print("- private pensions show a simple contribution flow")
print("- existing dated-purchase ledger is surfaced as + Add a manual pension thread")
print("- missing 5y/10y history shows Not enough verified history")
print("- manually tracked funds can store 5y/10y annualised returns")
print("- manual returns carry explicit User supplied provenance, as-at date and optional source URL")
print("- no pension valuation or salary-sacrifice calculation formula changed")
print()
print("Run git diff --check and npm run typecheck before staging.")
