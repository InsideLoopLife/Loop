#!/usr/bin/env python3
from pathlib import Path

repo = Path.cwd()
pkg = Path(__file__).resolve().parent
if not (repo / "loop_work/package.json").exists():
    raise SystemExit("ERROR: run from the LOOP repository root")

def backup(path: Path):
    bak = path.with_name(path.name + ".pre-chart-v4-3.bak")
    if not bak.exists():
        bak.write_text(path.read_text(encoding="utf-8"), encoding="utf-8")

savings_detail = repo / "loop_work/components/financial-flow/SavingsFlowDetail.tsx"
investments_dash = repo / "loop_work/components/investments/AmplifiedInvestmentsDashboard.tsx"
workspace_nav = repo / "loop_work/components/financial-flow/FinancialFlowWorkspaceNav.tsx"

for path in (savings_detail, investments_dash, workspace_nav):
    if not path.exists():
        raise SystemExit(f"ERROR: missing {path}. Nothing changed.")

sd = savings_detail.read_text(encoding="utf-8")
inv = investments_dash.read_text(encoding="utf-8")
nav = workspace_nav.read_text(encoding="utf-8")

if 'from "recharts"' not in sd:
    raise SystemExit("ERROR: savings chart import anchor missing. Nothing changed.")
if '<ResponsiveContainer width="100%" height="100%"><PieChart>' not in sd:
    raise SystemExit("ERROR: savings allocation chart anchor missing. Nothing changed.")
if '<ResponsiveContainer width="100%" height="100%"><LineChart data={chartData}>' not in sd:
    raise SystemExit("ERROR: savings trend chart anchor missing. Nothing changed.")

for marker in [
    'function syntheticOneDayPointsForHolding(holding: InvestmentHolding)',
    'if (period === "1D") return syntheticOneDayPointsForHolding(holding);',
    'if (points.length < 2 && move.has && value > 0 && 1 + move.pct / 100 > 0) points = [{ date: "Start", value: value / (1 + move.pct / 100) }, { date: "Now", value }];',
]:
    if marker not in inv:
        raise SystemExit(f"ERROR: investment snapshot anchor missing: {marker}. Nothing changed.")

print("Pre-flight passed: V4.3 chart/snapshot anchors match.")

# Stable helper + movement chart.
for rel in [
    "loop_work/components/charts/StableSavingsCharts.tsx",
    "loop_work/components/savings/SavingsMovementChart.tsx",
]:
    src = pkg / rel
    dst = repo / rel
    dst.parent.mkdir(parents=True, exist_ok=True)
    content = src.read_text(encoding="utf-8")
    if dst.exists():
        backup(dst)
    dst.write_text(content, encoding="utf-8")

# SavingsFlowDetail: strip Recharts plotting.
text = sd
recharts_line = next(line for line in text.splitlines(True) if 'from "recharts"' in line)
text = text.replace(
    recharts_line,
    'import { SavingsAllocationDonut, SavingsTrendSvg } from "@/components/charts/StableSavingsCharts";\n',
    1,
)

pie_start = text.find('          <div className="mt-3 h-56"><ResponsiveContainer')
pie_end_marker = '          <p className="text-center text-2xl font-black text-slate-950">{formatMoney(totalSavings)}</p><p className="text-center text-xs font-bold text-slate-400">Total tracked savings</p>'
pie_end = text.find(pie_end_marker, pie_start)
if pie_start < 0 or pie_end < 0:
    raise SystemExit("ERROR: allocation block exact anchor failed before write.")
pie_end += len(pie_end_marker)
text = text[:pie_start] + '          <SavingsAllocationDonut earmarked={earmarkedToPots} unassigned={unallocated} total={totalSavings} />' + text[pie_end:]

trend_start = text.find('          <div className="mt-4 h-64"><ResponsiveContainer')
trend_end_marker = '</LineChart></ResponsiveContainer></div>'
trend_end = text.find(trend_end_marker, trend_start)
if trend_start < 0 or trend_end < 0:
    raise SystemExit("ERROR: savings trend block exact anchor failed before write.")
trend_end += len(trend_end_marker)
text = text[:trend_start] + '          <div className="mt-4"><SavingsTrendSvg data={chartData} /></div>' + text[trend_end:]

backup(savings_detail)
savings_detail.write_text(text, encoding="utf-8")

# Investments: real stored snapshot geometry only.
text = inv
start = text.find('function syntheticOneDayPointsForHolding(holding: InvestmentHolding)')
end = text.find('\n}', start)
if start < 0 or end < 0:
    raise SystemExit("ERROR: synthetic function block not found before write.")
end += 2
text = text[:start] + '''function realOneDayPointsForHolding(holding: InvestmentHolding, snapshots: InvestmentSnapshot[]) {
  const holdingIds = holdingSnapshotIds(holding);
  return aggregateSnapshots(snapshots, holdingIds, "1D", holdingValue(holding));
}''' + text[end:]
text = text.replace(
    'if (period === "1D") return syntheticOneDayPointsForHolding(holding);',
    'if (period === "1D") return realOneDayPointsForHolding(holding, snapshots);',
    1,
)
text = text.replace(
    'if (points.length < 2 && move.has && value > 0 && 1 + move.pct / 100 > 0) points = [{ date: "Start", value: value / (1 + move.pct / 100) }, { date: "Now", value }];',
    '// Chart points are real stored snapshots only. The day-move figure remains a separate headline metric.',
    1,
)
if 'syntheticOneDayPointsForHolding' in text:
    raise SystemExit("ERROR: synthetic 1D chart path still present. Nothing written.")
backup(investments_dash)
investments_dash.write_text(text, encoding="utf-8")

# Prefetch subroutes so first section switches are warmed.
text = nav
if 'import { useRouter } from "next/navigation";' not in text:
    text = text.replace('import Link from "next/link";', 'import Link from "next/link";\nimport { useRouter } from "next/navigation";', 1)
if 'import { useEffect, useState } from "react";' not in text:
    text = text.replace('import { useState } from "react";', 'import { useEffect, useState } from "react";', 1)
anchor = '  const [addOpen, setAddOpen] = useState(false);'
if 'router.prefetch("/spending")' not in text:
    if anchor not in text:
        raise SystemExit("ERROR: Financial Flow prefetch anchor missing. Nothing written.")
    text = text.replace(anchor, anchor + '''
  const router = useRouter();

  useEffect(() => {
    const id = window.setTimeout(() => {
      router.prefetch("/financial-flow");
      router.prefetch("/financial-flow?tab=savings");
      router.prefetch("/income");
      router.prefetch("/spending");
    }, 80);
    return () => window.clearTimeout(id);
  }, [router]);''', 1)
backup(workspace_nav)
workspace_nav.write_text(text, encoding="utf-8")

print()
print("V4.3 applied:")
print("- Native SVG/CSS savings charts")
print("- Real investment snapshot geometry only")
print("- Financial Flow subroute prefetch")
print()
print("Run git diff --check and npm run typecheck.")
