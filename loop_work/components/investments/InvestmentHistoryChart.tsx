"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent } from "react";

type Point = {
  at: string;
  label: string;
  price: number;
  value: number;
  source?: string;
};

const EMPTY_POINTS: Point[] = [];

type HistoryQuality = {
  reliable: boolean;
  reconstructedLegacy?: boolean;
  expectedHoldings?: number;
  latestCoverage?: number;
  suppressedPartialPoints?: number;
  removedIsolatedSpikes?: number;
  currentMismatchPercent?: number;
  note?: string;
};

type Props = {
  holdingId?: string;
  accountId?: string;
  title?: string;
  mode?: "value" | "price";
  compact?: boolean;
  bare?: boolean;
  className?: string;
  showRange?: boolean;
  refreshMs?: number;
  prefetchRanges?: boolean;
};

const RANGES = [
  { value: "1d", label: "1D" },
  { value: "5d", label: "5D" },
  { value: "1m", label: "1M" },
  { value: "6m", label: "6M" },
  { value: "ytd", label: "YTD" },
  { value: "1y", label: "1Y" },
  { value: "5y", label: "5Y" },
  { value: "max", label: "Max" },
];

function historyCacheKey(range: string, holdingId?: string, accountId?: string) {
  return `${range}|${holdingId || ""}|${accountId || ""}`;
}

function money(value: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 2,
  }).format(value || 0);
}

function numberLabel(value: number, mode: "value" | "price") {
  return mode === "price"
    ? Number(value || 0).toFixed(4)
    : money(Number(value || 0));
}

function pctLabel(change: number, start: number) {
  if (!start) return "0.0%";
  return `${change >= 0 ? "+" : ""}${((change / start) * 100).toFixed(1)}%`;
}

function dimensions(compact: boolean) {
  return compact
    ? { width: 420, height: 116, padX: 18, padTop: 14, padBottom: 20 }
    : { width: 1180, height: 420, padX: 74, padTop: 34, padBottom: 74 };
}

function chartDomain(values: number[]) {
  const realValues = values.filter((value) => Number.isFinite(value));
  const min = Math.min(...realValues);
  const max = Math.max(...realValues);
  const spread = max - min;
  if (!realValues.length || !Number.isFinite(min) || !Number.isFinite(max))
    return { min: 0, max: 1 };
  if (spread <= 0) {
    const cushion = Math.max(1, Math.abs(max || 1) * 0.12);
    return { min: Math.max(0, min - cushion), max: max + cushion };
  }
  // Keep the visual range calm: enough room to see movement, without turning small changes into huge spikes.
  const changeRatio = max > 0 ? spread / max : 1;
  const lowerPad = Math.max(spread * 0.85, Math.abs(max) * 0.045);
  const upperPad = Math.max(spread * 0.36, Math.abs(max) * 0.018);
  const baseBuffer =
    changeRatio < 0.08 ? Math.max(max * 0.12, spread * 2.4) : lowerPad;
  const domainMin = min > 0 ? Math.max(0, min - baseBuffer) : min - lowerPad;
  return { min: domainMin, max: max + upperPad };
}

function scaledPoint(
  value: number,
  index: number,
  values: number[],
  width: number,
  height: number,
  padX: number,
  padTop: number,
  padBottom: number,
) {
  const domain = chartDomain(values);
  const range = domain.max - domain.min || 1;
  const chartHeight = height - padTop - padBottom;
  const step =
    values.length === 1
      ? 0
      : (width - padX * 2) / Math.max(values.length - 1, 1);
  const x = values.length === 1 ? width / 2 : padX + index * step;
  const y = padTop + chartHeight - ((value - domain.min) / range) * chartHeight;
  return { x, y };
}

function buildLinePath(
  values: number[],
  width: number,
  height: number,
  padX: number,
  padTop: number,
  padBottom: number,
) {
  if (!values.length) return "";
  return values
    .map((value, index) => {
      const { x, y } = scaledPoint(
        value,
        index,
        values,
        width,
        height,
        padX,
        padTop,
        padBottom,
      );
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function buildFillPath(
  linePath: string,
  values: number[],
  width: number,
  height: number,
  padX: number,
  padBottom: number,
) {
  if (!linePath || values.length < 2) return "";
  const firstX = padX;
  const lastX = width - padX;
  const baseY = height - padBottom;
  return `${linePath} L${lastX.toFixed(2)} ${baseY.toFixed(2)} L${firstX.toFixed(2)} ${baseY.toFixed(2)} Z`;
}

function formatTooltipDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function axisLabelFor(value: string, range: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  if (range === "1d")
    return date.toLocaleString("en-GB", { hour: "2-digit", minute: "2-digit" });
  if (range === "5d")
    return date.toLocaleString("en-GB", {
      weekday: "short",
      day: "2-digit",
      hour: "2-digit",
    });
  if (range === "1m")
    return date.toLocaleString("en-GB", { day: "2-digit", month: "short" });
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "2-digit",
  });
}

function pointChangeLabel(
  values: number[],
  index: number | null,
  mode: "value" | "price",
) {
  if (index === null || index <= 0 || values[index] === undefined)
    return { value: "—", pct: "—", positive: true };
  const current = Number(values[index] || 0);
  const previous = Number(values[index - 1] || 0);
  const change = current - previous;
  const pct = previous ? (change / previous) * 100 : 0;
  return {
    value: `${change >= 0 ? "+" : ""}${numberLabel(change, mode)}`,
    pct: `${change >= 0 ? "+" : ""}${pct.toFixed(2)}%`,
    positive: change >= 0,
  };
}

export function InvestmentHistoryChart({
  holdingId,
  accountId,
  title = "Market value history",
  mode = "value",
  compact = false,
  bare = false,
  className = "",
  showRange = true,
  refreshMs,
  prefetchRanges = false,
}: Props) {
  type RangeEntry = { points: Point[]; quality: HistoryQuality | null; sourceMode: string; status: string; fetchedAt: number };
  // BUGFIX (the "flash to a different chart" complaint): previously this
  // component held ONE set of points/status for whichever range was
  // currently selected, and re-fetched from scratch on every single
  // click — meaning switching ranges always meant staring at the OLD
  // range's (differently shaped/scaled) chart for however long the
  // network round-trip took, then a jarring swap. Now every range is
  // cached independently the first time it's fetched, so switching back
  // to an already-seen range is instant, and every range gets quietly
  // prefetched in the background shortly after the page loads — by the
  // time a person actually clicks a range button, it's very often
  // already sitting there ready.
  const cacheRef = useRef<Map<string, RangeEntry>>(new Map());
  const [range, setRange] = useState("1m");
  const [renderedRange, setRenderedRange] = useState<{
    key: string;
    entry: RangeEntry;
  } | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = wrapRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      const timer = window.setTimeout(() => setIsVisible(true), 0);
      return () => window.clearTimeout(timer);
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "240px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!isVisible) return;
    let cancelled = false;
    async function loadRange(targetRange: string, silent: boolean) {
      const key = historyCacheKey(targetRange, holdingId, accountId);
      const existing = cacheRef.current.get(key);
      // Already have this one — nothing to fetch, nothing to show as
      // loading. This is what makes clicking back to a seen range instant.
      if (existing && !silent) return;
      const params = new URLSearchParams({ range: targetRange });
      if (holdingId) params.set("holdingId", holdingId);
      if (accountId) params.set("accountId", accountId);
      try {
        const response = await fetch(`/api/investments/history?${params.toString()}`, {
          cache: refreshMs ? "no-store" : "default",
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Could not load history");
        if (cancelled) return;
        const rows = Array.isArray(data.points) ? data.points : [];
        const nextQuality = data.quality && typeof data.quality === "object" ? (data.quality as HistoryQuality) : null;
        cacheRef.current.set(key, {
          points: rows,
          quality: nextQuality,
          sourceMode: String(data.sourceMode || ""),
          status: rows.length ? "" : nextQuality?.note || "No reliable history yet",
          fetchedAt: Date.now(),
        });
        if (targetRange === range) {
          setRenderedRange({ key, entry: cacheRef.current.get(key)! });
        }
      } catch (caught) {
        if (cancelled) return;
        cacheRef.current.set(key, {
          points: existing?.points || [],
          quality: existing?.quality || null,
          sourceMode: existing?.sourceMode || "",
          status: caught instanceof Error ? caught.message : "Could not load history",
          fetchedAt: Date.now(),
        });
        if (targetRange === range) {
          setRenderedRange({ key, entry: cacheRef.current.get(key)! });
        }
      }
    }

    // Load whichever range is actually selected first — this is the one
    // thing the person is actually looking at right now.
    loadRange(range, false);

    // Then quietly prefetch every other range in the background, spaced
    // out a little so this doesn't fire 8 requests at once competing
    // with the one that actually matters right now.
    const otherRanges = prefetchRanges
      ? RANGES.map((r) => r.value).filter((r) => r !== range)
      : [];
    const prefetchTimers = otherRanges.map((r, index) =>
      window.setTimeout(() => { if (!cancelled) loadRange(r, true); }, 600 + index * 450),
    );

    // Keep the existing background-refresh behaviour for the active range
    // specifically, so numbers still stay live while the page is open.
    const refreshTimer = refreshMs && refreshMs > 0
      ? window.setInterval(() => loadRange(range, true), Math.max(30_000, refreshMs))
      : null;

    return () => {
      cancelled = true;
      prefetchTimers.forEach((t) => window.clearTimeout(t));
      if (refreshTimer) window.clearInterval(refreshTimer);
    };
  }, [holdingId, accountId, range, compact, refreshMs, prefetchRanges, isVisible]);

  const currentKey = historyCacheKey(range, holdingId, accountId);
  const active = renderedRange?.key === currentKey ? renderedRange.entry : null;
  const points = active?.points ?? EMPTY_POINTS;
  const status = active ? active.status : "Loading history...";
  const quality = active?.quality || null;
  const sourceMode = active?.sourceMode || "";

  const values = useMemo(
    () =>
      points
        .map((point) =>
          mode === "price"
            ? Number(point.price || 0)
            : Number(point.value || 0),
        )
        .filter((value) => Number.isFinite(value)),
    [points, mode],
  );
  const { width, height, padX, padTop, padBottom } = dimensions(compact);
  const path = buildLinePath(values, width, height, padX, padTop, padBottom);
  const fillPath = buildFillPath(path, values, width, height, padX, padBottom);
  const change = values.length >= 2 ? values[values.length - 1] - values[0] : 0;
  const latest = values.length ? values[values.length - 1] : 0;
  const first = values.length ? values[0] : 0;
  const firstLabel = points[0]?.label || "";
  const lastLabel = points[points.length - 1]?.label || "";
  const positive = change >= 0;
  const gradientId =
    `investment-chart-fill-${holdingId || accountId || "all"}-${compact ? "mini" : "full"}`.replace(
      /[^a-zA-Z0-9_-]/g,
      "",
    );
  const shellClass = bare
    ? className
    : `rounded-[1.75rem] border border-slate-200 bg-white p-4 shadow-sm ${className}`;
  const hoverPoint = hoverIndex !== null ? points[hoverIndex] : null;
  const hoverValue = hoverIndex !== null ? values[hoverIndex] : null;
  const hoverSvgPoint =
    hoverIndex !== null && values[hoverIndex] !== undefined
      ? scaledPoint(
          values[hoverIndex],
          hoverIndex,
          values,
          width,
          height,
          padX,
          padTop,
          padBottom,
        )
      : null;
  const hoverChange = pointChangeLabel(values, hoverIndex, mode);
  const yTicks = useMemo(() => {
    if (compact || values.length < 2) return [] as number[];
    const domain = chartDomain(values);
    if (domain.min === domain.max) return [domain.min];
    return [0, 0.33, 0.66, 1].map(
      (ratio) => domain.max - (domain.max - domain.min) * ratio,
    );
  }, [compact, values]);
  const xTicks = useMemo(() => {
    if (compact || points.length < 2)
      return [] as Array<{ index: number; label: string }>;
    const raw = [0, Math.floor((points.length - 1) * 0.5), points.length - 1];
    const seen = new Set<string>();
    return Array.from(new Set(raw))
      .map((index) => ({
        index,
        label: axisLabelFor(
          points[index]?.at || points[index]?.label || "",
          range,
        ),
      }))
      .filter((tick) => {
        if (!tick.label) return false;
        const key = `${tick.index === 0 ? "first" : tick.index === points.length - 1 ? "last" : "mid"}:${tick.label}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [compact, points, range]);

  function updateHover(event: PointerEvent<HTMLDivElement>) {
    if (compact || values.length < 2 || !wrapRef.current) return;
    const rect = wrapRef.current.getBoundingClientRect();
    // Use the full chart container as a hit target, not just the painted line.
    // This keeps left/right hover accuracy even when the SVG has padding or a wide desktop layout.
    const rawX = event.clientX - rect.left;
    const chartLeft = rect.width * (padX / width);
    const chartRight = rect.width * ((width - padX) / width);
    const ratio = Math.max(
      0,
      Math.min(1, (rawX - chartLeft) / Math.max(chartRight - chartLeft, 1)),
    );
    const nextIndex = Math.round(ratio * (values.length - 1));
    setHoverIndex(nextIndex);
  }

  return (
    <div className={shellClass}>
      {!compact && accountId && quality ? (
        <div
          className={`mb-3 rounded-2xl border px-4 py-3 text-xs font-bold ${quality.reliable ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}
        >
          <p className="font-black">
            {quality.reliable
              ? "Complete portfolio history"
              : "Portfolio history held back"}
          </p>
          <p className="mt-1">
            {quality.note ||
              "LOOP is checking that every point represents the whole account rather than one holding."}
          </p>
          {quality.reliable && quality.reconstructedLegacy ? (
            <p className="mt-1 text-[11px] opacity-80">
              Older points were safely rebuilt into complete account intervals.
              New points use a shared worker batch ID.
            </p>
          ) : null}
        </div>
      ) : null}
      {!compact ? (
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-wide text-slate-500">
              {title}
            </p>
            {values.length >= 2 ? (
              <p
                className={`mt-1 text-sm font-black ${positive ? "text-emerald-700" : "text-red-600"}`}
              >
                {positive ? "+" : ""}
                {numberLabel(change, mode)} · {pctLabel(change, first)} over
                selected range · latest {numberLabel(latest, mode)}
              </p>
            ) : null}
          </div>
          {showRange ? (
            <div className="flex flex-wrap gap-1 rounded-full bg-slate-50 p-1 ring-1 ring-slate-200">
              {RANGES.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => {
                    const nextKey = historyCacheKey(item.value, holdingId, accountId);
                    const cached = cacheRef.current.get(nextKey);
                    setRange(item.value);
                    setRenderedRange(cached ? { key: nextKey, entry: cached } : null);
                  }}
                  className={`rounded-full px-3 py-1.5 text-xs font-black transition ${range === item.value ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:bg-white"}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      <div
        ref={wrapRef}
        onPointerMove={updateHover}
        onPointerLeave={() => setHoverIndex(null)}
        className={`${compact ? "h-24" : "h-[28rem]"} relative w-full rounded-[1.5rem] ${bare ? "bg-transparent" : "bg-gradient-to-b from-slate-50 via-white to-slate-50"} p-2`}
      >
        {values.length >= 2 ? (
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="h-full w-full"
            role="img"
            aria-label={`${title} chart`}
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                <stop
                  offset="0%"
                  stopColor="currentColor"
                  stopOpacity={compact ? "0.26" : "0.24"}
                />
                <stop
                  offset="100%"
                  stopColor="currentColor"
                  stopOpacity="0.03"
                />
              </linearGradient>
            </defs>
            {!compact
              ? yTicks.map((tick, idx) => {
                  const y = scaledPoint(
                    tick,
                    0,
                    values,
                    width,
                    height,
                    padX,
                    padTop,
                    padBottom,
                  ).y;
                  return (
                    <g key={`${tick}-${idx}`}>
                      <line
                        x1={padX}
                        y1={y}
                        x2={width - padX}
                        y2={y}
                        stroke="rgba(148,163,184,.22)"
                        strokeWidth="1"
                        vectorEffect="non-scaling-stroke"
                      />
                      <text
                        x={width - padX - 4}
                        y={y - 6}
                        fontSize="11"
                        textAnchor="end"
                        fontWeight="800"
                        fill="rgba(100,116,139,.72)"
                      >
                        {numberLabel(tick, mode)}
                      </text>
                    </g>
                  );
                })
              : null}
            <line
              x1={padX}
              y1={height - padBottom}
              x2={width - padX}
              y2={height - padBottom}
              stroke="rgba(148,163,184,.35)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            {!compact
              ? xTicks.map((tick) => {
                  const x = scaledPoint(
                    values[tick.index] || 0,
                    tick.index,
                    values,
                    width,
                    height,
                    padX,
                    padTop,
                    padBottom,
                  ).x;
                  return (
                    <g key={`x-${tick.index}`}>
                      <line
                        x1={x}
                        y1={height - padBottom}
                        x2={x}
                        y2={height - padBottom + 6}
                        stroke="rgba(148,163,184,.45)"
                        strokeWidth="1"
                        vectorEffect="non-scaling-stroke"
                      />
                      <text
                        x={x}
                        y={height - 22}
                        fontSize="11"
                        textAnchor={
                          tick.index === 0
                            ? "start"
                            : tick.index === points.length - 1
                              ? "end"
                              : "middle"
                        }
                        fontWeight="800"
                        fill="rgba(100,116,139,.72)"
                      >
                        {tick.label}
                      </text>
                    </g>
                  );
                })
              : null}
            <path
              d={fillPath}
              className={positive ? "text-emerald-600" : "text-red-500"}
              fill={`url(#${gradientId})`}
            />
            <path
              d={path}
              className={positive ? "text-emerald-600" : "text-red-500"}
              fill="none"
              stroke="currentColor"
              strokeWidth={compact ? "3" : "4"}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            {hoverSvgPoint ? (
              <g>
                <line
                  x1={hoverSvgPoint.x}
                  y1={padTop}
                  x2={hoverSvgPoint.x}
                  y2={height - padBottom}
                  stroke="rgba(15,23,42,.22)"
                  strokeDasharray="4 5"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            ) : null}
          </svg>
        ) : values.length === 1 ? (
          <div className="flex h-full items-center justify-center text-center text-xs font-black text-slate-400">
            1 snapshot · {numberLabel(latest, mode)}
            <br />
            next refresh will draw the line
          </div>
        ) : !active ? (
          <div
            className="loop-chart-skeleton h-full overflow-hidden rounded-[1.25rem] border border-blue-100 bg-gradient-to-br from-blue-50/90 via-white to-teal-50/80"
            role="status"
            aria-label="Loading investment history"
          >
            <div className="flex h-full items-end gap-2 px-4 pb-4 pt-8 opacity-70">
              {[38, 54, 46, 68, 57, 78, 70, 86, 74].map((height, index) => (
                <span
                  key={`${height}-${index}`}
                  className="flex-1 rounded-t-full bg-gradient-to-t from-blue-200 to-teal-200"
                  style={{ height: `${height}%` }}
                />
              ))}
            </div>
            <span className="sr-only">Loading history…</span>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-center text-xs font-bold text-slate-400">
            {accountId && sourceMode === "insufficient_portfolio_history"
              ? "History is rebuilding from complete account snapshots"
              : status}
          </div>
        )}
        {hoverSvgPoint ? (
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute z-10 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white shadow ${positive ? "bg-emerald-600" : "bg-red-500"}`}
            style={{
              left: `${(hoverSvgPoint.x / width) * 100}%`,
              top: `${(hoverSvgPoint.y / height) * 100}%`,
            }}
          />
        ) : null}
        {hoverPoint && hoverValue !== null && hoverSvgPoint ? (
          <div
            className="pointer-events-none absolute top-4 rounded-2xl bg-slate-950 px-3 py-2 text-xs font-black text-white shadow-xl ring-1 ring-white/10"
            style={{
              left: `${Math.max(0, Math.min(78, (hoverSvgPoint.x / width) * 100))}%`,
            }}
          >
            <p>{numberLabel(hoverValue, mode)}</p>
            <p className="font-semibold text-slate-300">
              {formatTooltipDate(hoverPoint.at)}
            </p>
            <p
              className={
                hoverChange.positive ? "text-emerald-300" : "text-red-300"
              }
            >
              {hoverChange.value} · {hoverChange.pct}
            </p>
          </div>
        ) : null}
      </div>
      {!compact && values.length >= 2 ? (
        <div className="mt-2 text-center text-[0.7rem] font-bold text-slate-400">
          {firstLabel} → {lastLabel}
        </div>
      ) : null}
      {!compact && hoverPoint && hoverValue !== null ? (
        <div className="mt-3 grid gap-2 rounded-[1.5rem] border border-slate-200 bg-slate-50 p-3 text-xs sm:grid-cols-4">
          <div className="rounded-2xl bg-white p-3 ring-1 ring-slate-100">
            <p className="font-black uppercase tracking-wide text-slate-400">
              Selected
            </p>
            <p className="mt-1 font-black text-slate-950">
              {formatTooltipDate(hoverPoint.at)}
            </p>
          </div>
          <div className="rounded-2xl bg-white p-3 ring-1 ring-slate-100">
            <p className="font-black uppercase tracking-wide text-slate-400">
              Value
            </p>
            <p className="mt-1 font-black text-slate-950">
              {numberLabel(hoverValue, mode)}
            </p>
          </div>
          <div className="rounded-2xl bg-white p-3 ring-1 ring-slate-100">
            <p className="font-black uppercase tracking-wide text-slate-400">
              Move from previous
            </p>
            <p
              className={`mt-1 font-black ${hoverChange.positive ? "text-emerald-700" : "text-red-600"}`}
            >
              {hoverChange.value} · {hoverChange.pct}
            </p>
          </div>
          <div className="rounded-2xl bg-white p-3 ring-1 ring-slate-100">
            <p className="font-black uppercase tracking-wide text-slate-400">
              Source
            </p>
            <p
              className="mt-1 truncate font-black text-slate-950"
              title={hoverPoint.source || "App history"}
            >
              {hoverPoint.source || "App history"}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
