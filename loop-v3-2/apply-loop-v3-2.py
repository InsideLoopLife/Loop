#!/usr/bin/env python3
from pathlib import Path
import json

repo = Path.cwd()
pkg = Path(__file__).resolve().parent
if not (repo / 'loop_work/package.json').exists():
    raise SystemExit('ERROR: run from the LOOP repository root')

replace = [
  'loop_work/components/shell/PersistentNavContext.tsx',
  'loop_work/components/shell/PersistentLoopShell.tsx',
  'loop_work/lib/client/use-warm-route-snapshot.ts',
  'loop_work/lib/client/route-snapshot-cache.ts',
  'loop_work/components/loading/DashboardCachedRouteFallback.tsx',
  'loop_work/components/loading/InvestmentsCachedRouteFallback.tsx',
  'loop_work/components/loading/NetWorthCachedRouteFallback.tsx',
  'loop_work/components/loading/RetirementCachedRouteFallback.tsx',
  'loop_work/components/loading/IncomeCachedRouteFallback.tsx',
  'loop_work/components/loading/NutritionCachedRouteFallback.tsx',
  'loop_work/app/dashboard/loading.tsx',
  'loop_work/app/investments/loading.tsx',
  'loop_work/app/net-worth/loading.tsx',
  'loop_work/app/retirement/loading.tsx',
  'loop_work/app/income/loading.tsx',
  'loop_work/app/nutrition/loading.tsx',
]

changes = {
'loop_work/app/layout.tsx': [
('import { RouteBootAutoPublisher } from "@/components/performance/RouteBootAutoPublisher";\n',
 'import { RouteBootAutoPublisher } from "@/components/performance/RouteBootAutoPublisher";\nimport { PersistentLoopShell } from "@/components/shell/PersistentLoopShell";\n',
 'persistent shell import'),
('      <body>{children}<PageTour /><RouteFreshnessManager /><RouteBootAutoPublisher /></body>\n',
 '      <body><PersistentLoopShell>{children}</PersistentLoopShell><PageTour /><RouteFreshnessManager /><RouteBootAutoPublisher /></body>\n',
 'persistent shell mount'),
],
'loop_work/components/Nav.tsx': [
('import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";\n',
 'import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";\nimport { usePersistentNavMounted } from "@/components/shell/PersistentNavContext";\n',
 'persistent nav context import'),
('''export function Nav() {\n  return (\n    <Suspense fallback={null}>\n      <NavInner />\n    </Suspense>\n  );\n}\n''',
 '''export function Nav({ persistent = false }: { persistent?: boolean } = {}) {\n  const persistentNavMounted = usePersistentNavMounted();\n  if (persistentNavMounted && !persistent) return null;\n\n  return (\n    <Suspense fallback={null}>\n      <NavInner />\n    </Suspense>\n  );\n}\n''',
 'persistent nav suppression'),
],
'loop_work/components/financial-flow/FinancialFlowWorkspaceNav.tsx': [
('''  if (section === "spending") return `/spending${suffix}`;\n  return "/accounts";\n''',
 '''  if (section === "spending") return `/spending${suffix}`;\n  const savingsQuery = new URLSearchParams();\n  savingsQuery.set("tab", "savings");\n  if (month) savingsQuery.set("month", month);\n  return `/financial-flow?${savingsQuery.toString()}`;\n''',
 'rich savings destination'),
],
'loop_work/app/api/investments/history/route.ts': [
('''  let marketHistoryEvidence: MarketHistoryResult | null = null;\n\n  if (accountId || portfolio) {\n''',
 '''  let marketHistoryEvidence: MarketHistoryResult | null = null;\n  let snapshotEvidencePoints: Array<{\n    at: string;\n    price: number;\n    value: number;\n    coverage: number;\n    coveredHoldings: number;\n    expectedHoldings: number;\n    source: string;\n  }> = [];\n\n  if (accountId || portfolio) {\n''',
 'snapshot evidence declaration'),
('''    quality = built.quality;\n    points = built.points.map((point) => ({\n''',
 '''    quality = built.quality;\n    snapshotEvidencePoints = built.candidatePoints.map((point) => ({\n      at: point.at,\n      price: point.price,\n      value: point.value,\n      coverage: point.coverage,\n      coveredHoldings: point.coveredHoldings,\n      expectedHoldings: point.expectedHoldings,\n      source: point.source,\n    }));\n    points = built.points.map((point) => ({\n''',
 'snapshot evidence candidate points'),
('''    points,\n    entitlement,\n    sourceMode,\n''',
 '''    points,\n    snapshotEvidencePoints,\n    entitlement,\n    sourceMode,\n''',
 'snapshot evidence response'),
],
'loop_work/components/investments/InvestmentHistoryChart.tsx': [
('''type Point = {\n  at: string;\n  label: string;\n  price: number;\n  value: number;\n  source?: string;\n};\n\nconst EMPTY_POINTS: Point[] = [];\n''',
 '''type Point = {\n  at: string;\n  label: string;\n  price: number;\n  value: number;\n  source?: string;\n};\n\ntype SnapshotEvidencePoint = {\n  at: string;\n  price: number;\n  value: number;\n  coverage: number;\n  coveredHoldings: number;\n  expectedHoldings: number;\n  source?: string;\n};\n\nconst EMPTY_POINTS: Point[] = [];\nconst EMPTY_SNAPSHOT_POINTS: SnapshotEvidencePoint[] = [];\n''',
 'snapshot point type'),
('''  type RangeEntry = { points: Point[]; quality: HistoryQuality | null; sourceMode: string; status: string; fetchedAt: number };\n''',
 '''  type RangeEntry = {\n    points: Point[];\n    snapshotPoints: SnapshotEvidencePoint[];\n    quality: HistoryQuality | null;\n    sourceMode: string;\n    status: string;\n    fetchedAt: number;\n  };\n''',
 'range entry snapshot points'),
('''        cacheRef.current.set(key, {\n          points: rows,\n          quality: nextQuality,\n''',
 '''        cacheRef.current.set(key, {\n          points: rows,\n          snapshotPoints: Array.isArray(data.snapshotEvidencePoints)\n            ? data.snapshotEvidencePoints\n            : [],\n          quality: nextQuality,\n''',
 'load snapshot points'),
('''        cacheRef.current.set(key, {\n          points: existing?.points || [],\n          quality: existing?.quality || null,\n''',
 '''        cacheRef.current.set(key, {\n          points: existing?.points || [],\n          snapshotPoints: existing?.snapshotPoints || [],\n          quality: existing?.quality || null,\n''',
 'retain snapshot points'),
('''  const points = active?.points ?? EMPTY_POINTS;\n  const status = active ? active.status : "Loading history...";\n''',
 '''  const points = active?.points ?? EMPTY_POINTS;\n  const snapshotPoints = active?.snapshotPoints ?? EMPTY_SNAPSHOT_POINTS;\n  const status = active ? active.status : "Loading history...";\n''',
 'active snapshot points'),
('''  const { width, height, padX, padTop, padBottom } = dimensions(compact);\n''',
 '''  const snapshotValues = useMemo(\n    () =>\n      snapshotPoints\n        .map((point) =>\n          mode === "price"\n            ? Number(point.price || 0)\n            : Number(point.value || 0),\n        )\n        .filter((value) => Number.isFinite(value) && value > 0),\n    [snapshotPoints, mode],\n  );\n  const { width, height, padX, padTop, padBottom } = dimensions(compact);\n''',
 'snapshot values'),
('''            <path\n              d={path}\n              className={positive ? "text-emerald-600" : "text-red-500"}\n              fill="none"\n              stroke="currentColor"\n              strokeWidth={compact ? "3" : "4"}\n              strokeLinecap="round"\n              strokeLinejoin="round"\n              vectorEffect="non-scaling-stroke"\n            />\n            {hoverSvgPoint ? (\n''',
 '''            <path\n              d={path}\n              className={positive ? "text-emerald-600" : "text-red-500"}\n              fill="none"\n              stroke="currentColor"\n              strokeWidth={compact ? "3" : "4"}\n              strokeLinecap="round"\n              strokeLinejoin="round"\n              vectorEffect="non-scaling-stroke"\n            />\n            {!compact\n              ? snapshotPoints.map((snapshot, snapshotIndex) => {\n                  const snapshotValue = mode === "price"\n                    ? Number(snapshot.price || 0)\n                    : Number(snapshot.value || 0);\n                  if (!(snapshotValue > 0) || !values.length) return null;\n                  const nearestIndex = points.reduce((best, point, pointIndex) => {\n                    const target = Date.parse(snapshot.at);\n                    const bestDistance = Math.abs(Date.parse(points[best]?.at || "") - target);\n                    const distance = Math.abs(Date.parse(point.at) - target);\n                    return distance < bestDistance ? pointIndex : best;\n                  }, 0);\n                  const x = scaledPoint(\n                    values[Math.min(nearestIndex, values.length - 1)] || snapshotValue,\n                    Math.min(nearestIndex, values.length - 1),\n                    values, width, height, padX, padTop, padBottom,\n                  ).x;\n                  const y = scaledPoint(\n                    snapshotValue, 0, values, width, height, padX, padTop, padBottom,\n                  ).y;\n                  return (\n                    <circle\n                      key={`snapshot-${snapshot.at}-${snapshotIndex}`}\n                      cx={x}\n                      cy={y}\n                      r="5"\n                      fill="white"\n                      stroke="rgba(15,23,42,.72)"\n                      strokeWidth="3"\n                      vectorEffect="non-scaling-stroke"\n                    >\n                      <title>{`Saved LOOP snapshot · ${formatTooltipDate(snapshot.at)} · ${numberLabel(snapshotValue, mode)} · ${Math.round(snapshot.coverage * 100)}% holding coverage`}</title>\n                    </circle>\n                  );\n                })\n              : null}\n            {hoverSvgPoint ? (\n''',
 'persistent snapshot dots'),
('''        ) : values.length === 1 ? (\n          <div className="flex h-full items-center justify-center text-center text-xs font-black text-slate-400">\n            1 snapshot · {numberLabel(latest, mode)}\n            <br />\n            next refresh will draw the line\n          </div>\n        ) : !active ? (\n''',
 '''        ) : snapshotValues.length ? (\n          <div className="flex h-full flex-col">\n            <svg\n              viewBox={`0 0 ${width} ${height}`}\n              className="min-h-0 flex-1 w-full"\n              role="img"\n              aria-label={`${title} saved snapshot evidence`}\n              preserveAspectRatio="none"\n            >\n              {snapshotPoints.map((snapshot, index) => {\n                const snapshotValue = mode === "price"\n                  ? Number(snapshot.price || 0)\n                  : Number(snapshot.value || 0);\n                if (!(snapshotValue > 0)) return null;\n                const point = scaledPoint(\n                  snapshotValue, index, snapshotValues, width, height, padX, padTop, padBottom,\n                );\n                return (\n                  <circle\n                    key={`evidence-${snapshot.at}-${index}`}\n                    cx={point.x}\n                    cy={point.y}\n                    r={compact ? "5" : "7"}\n                    fill="white"\n                    stroke="rgba(15,23,42,.72)"\n                    strokeWidth={compact ? "3" : "4"}\n                    vectorEffect="non-scaling-stroke"\n                  >\n                    <title>{`Saved LOOP snapshot · ${formatTooltipDate(snapshot.at)} · ${numberLabel(snapshotValue, mode)} · ${Math.round(snapshot.coverage * 100)}% holding coverage`}</title>\n                  </circle>\n                );\n              })}\n            </svg>\n            {!compact ? (\n              <p className="pb-2 text-center text-xs font-bold text-slate-500">\n                {snapshotValues.length} real saved snapshot point{snapshotValues.length === 1 ? "" : "s"} · line held back until the account history is complete enough to connect safely\n              </p>\n            ) : null}\n          </div>\n        ) : values.length === 1 ? (\n          <div className="flex h-full items-center justify-center text-center text-xs font-black text-slate-400">\n            1 snapshot · {numberLabel(latest, mode)}\n            <br />\n            next refresh will draw the line\n          </div>\n        ) : !active ? (\n''',
 'snapshot only mode'),
('''      {!compact && values.length >= 2 ? (\n        <div className="mt-2 text-center text-[0.7rem] font-bold text-slate-400">\n          {firstLabel} → {lastLabel}\n        </div>\n      ) : null}\n''',
 '''      {!compact && values.length >= 2 ? (\n        <div className="mt-2 text-center text-[0.7rem] font-bold text-slate-400">\n          {firstLabel} → {lastLabel}\n          {snapshotPoints.length\n            ? ` · ${snapshotPoints.length} saved LOOP snapshot point${snapshotPoints.length === 1 ? "" : "s"} shown as outlined dots`\n            : ""}\n        </div>\n      ) : null}\n''',
 'snapshot footer'),
],
}

# Preflight guarded files first.
for rel, edits in changes.items():
    path = repo / rel
    if not path.exists():
        raise SystemExit(f'ERROR: expected source file missing: {rel}')
    text = path.read_text(encoding='utf-8')
    for old, new, label in edits:
        if new in text and old not in text:
            continue
        count = text.count(old)
        if count != 1:
            raise SystemExit(f'ERROR: pre-flight failed in {rel}: {label} (found {count}). Nothing has been changed.')
        text = text.replace(old, new, 1)

for rel in replace:
    if not (pkg / rel).exists():
        raise SystemExit(f'ERROR: package payload missing: {rel}')

print('Pre-flight passed: V3.2 matches the reviewed main branch.')
created=[]; updated=[]; unchanged=[]

def backup(path: Path):
    bak = path.with_name(path.name + '.pre-v3-2.bak')
    if not bak.exists():
        bak.write_text(path.read_text(encoding='utf-8'), encoding='utf-8')

for rel in replace:
    src=pkg/rel; dst=repo/rel; content=src.read_text(encoding='utf-8')
    dst.parent.mkdir(parents=True, exist_ok=True)
    if dst.exists():
        current=dst.read_text(encoding='utf-8')
        if current == content: unchanged.append(rel)
        else:
            backup(dst); dst.write_text(content, encoding='utf-8'); updated.append(rel)
    else:
        dst.write_text(content, encoding='utf-8'); created.append(rel)

for rel, edits in changes.items():
    path=repo/rel; text=path.read_text(encoding='utf-8'); original=text
    for old,new,label in edits:
        if new in text and old not in text: continue
        text=text.replace(old,new,1)
    if text == original: unchanged.append(rel)
    else:
        backup(path); path.write_text(text, encoding='utf-8'); updated.append(rel)

print('\nLOOP V3.2 shell + chart integrity applied.')
for label, rows in [('CREATED',created),('UPDATED',updated),('UNCHANGED',unchanged)]:
    if rows:
        print(label)
        for row in rows: print(' ',row)
print('\nRun git diff --check, then cd loop_work && npm run typecheck before staging.')
