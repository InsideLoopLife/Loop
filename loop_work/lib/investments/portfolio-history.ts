export type PortfolioSnapshotInput = {
  holding_id: string;
  snapshot_at: string | null;
  snapshot_date: string | null;
  snapshot_batch_id?: string | null;
  price: number | null;
  units: number | null;
  value: number | null;
  native_price?: number | null;
  native_value?: number | null;
  fx_rate_to_gbp?: number | null;
  source?: string | null;
};

export type PortfolioHoldingInput = {
  id: string;
  ticker?: string | null;
  units?: number | null;
  currentValue: number;
  staticValue?: boolean;
};

export type PortfolioHistoryPoint = {
  at: string;
  price: number;
  value: number;
  source: string;
  coverage: number;
  coveredHoldings: number;
  expectedHoldings: number;
};

export type PortfolioHistoryQuality = {
  reliable: boolean;
  reconstructedLegacy: boolean;
  expectedHoldings: number;
  minimumCoverage: number;
  latestCoverage: number;
  suppressedPartialPoints: number;
  removedIsolatedSpikes: number;
  currentMismatchPercent: number;
  note: string;
};

function timeOf(row: PortfolioSnapshotInput) {
  return String(
    row.snapshot_at ||
      (row.snapshot_date ? `${row.snapshot_date}T23:59:59.000Z` : ""),
  );
}

function safeDateMs(value: string) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function snapshotValueGbp(row: PortfolioSnapshotInput) {
  const fxRate =
    Number(row.fx_rate_to_gbp || 0) > 0 ? Number(row.fx_rate_to_gbp) : 1;
  if (
    row.native_value !== undefined &&
    row.native_value !== null &&
    Number.isFinite(Number(row.native_value))
  ) {
    return Number(row.native_value || 0) * fxRate;
  }
  const direct = Number(row.value || 0);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const nativePrice =
    row.native_price !== undefined && row.native_price !== null
      ? Number(row.native_price || 0)
      : Number(row.price || 0);
  return nativePrice * fxRate * Number(row.units || 0);
}

export function snapshotPriceGbp(row: PortfolioSnapshotInput) {
  const fxRate =
    Number(row.fx_rate_to_gbp || 0) > 0 ? Number(row.fx_rate_to_gbp) : 1;
  if (
    row.native_price !== undefined &&
    row.native_price !== null &&
    Number.isFinite(Number(row.native_price))
  ) {
    return Number(row.native_price || 0) * fxRate;
  }
  return Number(row.price || 0);
}

function legacyBucketMs(range: string) {
  if (range === "1d") return 5 * 60 * 1000;
  if (range === "5d") return 30 * 60 * 1000;
  if (range === "1m") return 6 * 60 * 60 * 1000;
  if (["6m", "ytd", "1y"].includes(range)) return 24 * 60 * 60 * 1000;
  return 7 * 24 * 60 * 60 * 1000;
}

function groupKey(row: PortfolioSnapshotInput, range: string) {
  if (row.snapshot_batch_id) return `batch:${row.snapshot_batch_id}`;
  const at = timeOf(row);
  const ms = safeDateMs(at);
  const bucket = legacyBucketMs(range);
  return `legacy:${Math.floor(ms / bucket) * bucket}`;
}

function removeIsolatedSpikes(points: PortfolioHistoryPoint[]) {
  if (points.length < 3) return { points, removed: 0 };
  const kept: PortfolioHistoryPoint[] = [points[0]];
  let removed = 0;
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = kept[kept.length - 1];
    const current = points[index];
    const next = points[index + 1];
    const prevValue = Number(previous.value || 0);
    const currentValue = Number(current.value || 0);
    const nextValue = Number(next.value || 0);
    if (prevValue <= 0 || currentValue <= 0 || nextValue <= 0) {
      kept.push(current);
      continue;
    }
    const neighbourGap =
      Math.abs(nextValue - prevValue) / Math.max(prevValue, nextValue, 1);
    const currentVsPrev = currentValue / prevValue;
    const currentVsNext = currentValue / nextValue;
    const isolated =
      neighbourGap <= 0.18 &&
      ((currentVsPrev < 0.55 && currentVsNext < 0.55) ||
        (currentVsPrev > 1.8 && currentVsNext > 1.8));
    if (isolated) {
      removed += 1;
      continue;
    }
    kept.push(current);
  }
  kept.push(points[points.length - 1]);
  return { points: kept, removed };
}

/**
 * Builds an account-level value series without summing rows by exact timestamp.
 * Market workers save one row per holding, and those writes occur at different times.
 * Summing exact timestamps therefore makes a portfolio appear to collapse to one holding
 * and then jump back. This function carries the latest complete value for each holding
 * across a worker batch and refuses to emit low-coverage partial portfolios.
 */
export function buildPortfolioHistory(args: {
  rows: PortfolioSnapshotInput[];
  baselineRows?: PortfolioSnapshotInput[];
  holdings: PortfolioHoldingInput[];
  range: string;
  cashValue?: number;
  minimumCoverage?: number;
  currentValue?: number;
}) {
  const expected = args.holdings.filter(
    (holding) =>
      Number(holding.currentValue || 0) > 0 || Number(holding.units || 0) > 0,
  );
  const expectedIds = new Set(expected.map((holding) => holding.id));
  const minimumCoverage = Math.max(
    0.8,
    Math.min(1, Number(args.minimumCoverage ?? 0.95)),
  );
  const state = new Map<
    string,
    { value: number; price: number; at: string; source: string }
  >();
  const staticIds = new Set<string>();

  for (const holding of expected) {
    if (holding.staticValue && Number(holding.currentValue || 0) > 0) {
      state.set(holding.id, {
        value: Number(holding.currentValue),
        price: 0,
        at: "",
        source: "static imported value",
      });
      staticIds.add(holding.id);
    }
  }

  const baselineSorted = [...(args.baselineRows || [])].sort(
    (a, b) => safeDateMs(timeOf(a)) - safeDateMs(timeOf(b)),
  );
  for (const row of baselineSorted) {
    if (!expectedIds.has(row.holding_id)) continue;
    const value = snapshotValueGbp(row);
    if (!(value > 0)) continue;
    state.set(row.holding_id, {
      value,
      price: snapshotPriceGbp(row),
      at: timeOf(row),
      source: String(row.source || "stored snapshot"),
    });
  }

  const grouped = new Map<
    string,
    { at: string; legacy: boolean; rows: Map<string, PortfolioSnapshotInput> }
  >();
  for (const row of [...args.rows].sort(
    (a, b) => safeDateMs(timeOf(a)) - safeDateMs(timeOf(b)),
  )) {
    if (!expectedIds.has(row.holding_id)) continue;
    const at = timeOf(row);
    if (!at) continue;
    const key = groupKey(row, args.range);
    const group = grouped.get(key) || {
      at,
      legacy: !row.snapshot_batch_id,
      rows: new Map<string, PortfolioSnapshotInput>(),
    };
    if (safeDateMs(at) >= safeDateMs(group.at)) group.at = at;
    const previous = group.rows.get(row.holding_id);
    if (!previous || safeDateMs(at) >= safeDateMs(timeOf(previous)))
      group.rows.set(row.holding_id, row);
    grouped.set(key, group);
  }

  const orderedGroups = Array.from(grouped.values()).sort(
    (a, b) => safeDateMs(a.at) - safeDateMs(b.at),
  );
  const result: PortfolioHistoryPoint[] = [];
  let suppressedPartialPoints = 0;
  let reconstructedLegacy = false;
  let minimumObservedCoverage = 1;

  for (const group of orderedGroups) {
    reconstructedLegacy = reconstructedLegacy || group.legacy;
    for (const row of group.rows.values()) {
      const value = snapshotValueGbp(row);
      if (!(value > 0)) continue;
      state.set(row.holding_id, {
        value,
        price: snapshotPriceGbp(row),
        at: timeOf(row),
        source: String(row.source || "stored snapshot"),
      });
    }

    const covered = expected.filter((holding) => state.has(holding.id));
    const coverage = expected.length ? covered.length / expected.length : 0;
    minimumObservedCoverage = Math.min(minimumObservedCoverage, coverage || 0);
    if (coverage < minimumCoverage) {
      suppressedPartialPoints += 1;
      continue;
    }

    let value = Number(args.cashValue || 0);
    let priceTotal = 0;
    let priceCount = 0;
    const sources = new Set<string>();
    for (const holding of covered) {
      const current = state.get(holding.id)!;
      value += Number(current.value || 0);
      if (Number(current.price || 0) > 0) {
        priceTotal += Number(current.price);
        priceCount += 1;
      }
      if (current.source) sources.add(current.source);
    }
    if (!(value > 0)) continue;
    result.push({
      at: group.at,
      price: priceCount ? priceTotal / priceCount : 0,
      value,
      source: Array.from(sources).join(", ") || "stored portfolio snapshots",
      coverage,
      coveredHoldings: covered.length,
      expectedHoldings: expected.length,
    });
  }

  const deduped = new Map<string, PortfolioHistoryPoint>();
  for (const point of result) deduped.set(point.at, point);
  const sorted = Array.from(deduped.values()).sort(
    (a, b) => safeDateMs(a.at) - safeDateMs(b.at),
  );
  const spikeResult = removeIsolatedSpikes(sorted);
  const points = spikeResult.points;
  const latestCoverage = points.length ? points[points.length - 1].coverage : 0;
  const expectedCurrent = Number(args.currentValue || 0);
  const latestValue = points.length
    ? Number(points[points.length - 1].value || 0)
    : 0;
  const currentMismatchPercent =
    expectedCurrent > 0 && latestValue > 0
      ? (Math.abs(latestValue - expectedCurrent) / expectedCurrent) * 100
      : 0;
  const reliable =
    points.length >= 2 &&
    latestCoverage >= minimumCoverage &&
    currentMismatchPercent <= 25;
  const note = reliable
    ? reconstructedLegacy
      ? "Legacy snapshots were rebuilt into complete portfolio intervals. New snapshots use explicit worker batch IDs."
      : "Portfolio history is built from complete worker batches across the account's holdings."
    : points.length < 2
      ? "LOOP does not yet have two complete portfolio snapshots, so it will not draw a potentially misleading account line."
      : latestCoverage < minimumCoverage
        ? "The latest stored interval does not cover enough holdings to represent the account safely."
        : "The latest complete snapshot differs materially from the current account value; the chart is held back until the worker reconciles it.";

  return {
    points: reliable ? points : [],
    candidatePoints: points,
    quality: {
      reliable,
      reconstructedLegacy,
      expectedHoldings: expected.length,
      minimumCoverage:
        minimumObservedCoverage === 1 && !points.length
          ? 0
          : minimumObservedCoverage,
      latestCoverage,
      suppressedPartialPoints,
      removedIsolatedSpikes: spikeResult.removed,
      currentMismatchPercent,
      note,
    } satisfies PortfolioHistoryQuality,
  };
}
