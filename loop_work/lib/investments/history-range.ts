const DAY_MS = 24 * 60 * 60 * 1000;

export function bucketIntervalForRange(range: string) {
  if (range === "1d") return "1m";
  if (range === "5d") return "30m";
  if (range === "1m") return "60m";
  if (range === "6m" || range === "ytd") return "1d";
  if (range === "1y") return "1wk";
  return "1mo";
}

export function requiredHistorySpanMs(
  range: string,
  since: string,
  now = Date.now(),
) {
  const requestedStart = Date.parse(since);
  const requestedSpan =
    Number.isFinite(requestedStart) && requestedStart > 0
      ? Math.max(0, now - requestedStart)
      : 0;
  const minimumByRange: Record<string, number> = {
    "1d": 2 * 60 * 60 * 1000,
    "5d": 2 * DAY_MS,
    "1m": 14 * DAY_MS,
    "6m": 90 * DAY_MS,
    ytd: 14 * DAY_MS,
    "1y": 180 * DAY_MS,
    "5y": 730 * DAY_MS,
    max: 365 * DAY_MS,
  };
  return Math.min(
    requestedSpan * 0.7,
    minimumByRange[range] ?? 14 * DAY_MS,
  );
}

export function historySpansSelectedRange(
  points: Array<{ at: string }>,
  range: string,
  since: string,
  now = Date.now(),
) {
  if (points.length < 2) return false;
  const timestamps = points
    .map((point) => Date.parse(point.at))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  if (timestamps.length < 2) return false;
  return (
    timestamps[timestamps.length - 1] - timestamps[0] >=
    requiredHistorySpanMs(range, since, now)
  );
}

export function yahooRangeForChart(range: string) {
  if (range === "1d") return "5d";
  if (range === "5d") return "5d";
  if (range === "6m") return "6mo";
  if (range === "ytd") return "ytd";
  if (range === "1y") return "1y";
  if (range === "5y") return "5y";
  if (range === "max") return "max";
  return "1mo";
}

export function yahooIntervalForChart(range: string) {
  return bucketIntervalForRange(range);
}
