"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { FlowChart as FlowChartData, FlowChartLink, FlowChartNode } from "@/lib/planning/flow-chart";

const gbp = (v: number) => new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(v);
const STORAGE_KEY = "loop:flow-chart-detail";

type Placed = FlowChartNode & { x: number; y: number; h: number; slot: number };
type PlacedLink = FlowChartLink & { path: string; key: string };

function layout(chart: FlowChartData, width: number) {
  const columns = Math.max(1, ...chart.nodes.map((n) => n.column + 1));
  const nodeW = 12;
  const leftLabel = 170;
  const rightLabel = 190;
  const gap = 10;
  const minSlot = 32;
  const colTotals = Array.from({ length: columns }, (_, c) => chart.nodes.filter((n) => n.column === c).reduce((s, n) => s + n.value, 0));
  const k = (chart.nodes.length > 12 ? 380 : 300) / Math.max(1, ...colTotals);
  const colX = (c: number) => (columns === 1 ? leftLabel : leftLabel + (c * (width - leftLabel - rightLabel - nodeW)) / (columns - 1));

  // Order each column by where its money comes from, so ribbons cross as little as possible.
  const order = new Map<string, number>();
  const placed: Placed[] = [];
  for (let c = 0; c < columns; c += 1) {
    const inCol = chart.nodes.filter((n) => n.column === c).map((n, i) => {
      const parent = chart.links.find((l) => l.target === n.id)?.source;
      return { n, i, parentRank: parent != null && order.has(parent) ? (order.get(parent) as number) : -1 };
    });
    inCol.sort((a, b) => (a.parentRank - b.parentRank) || (c === 0 ? a.i - b.i : b.n.value - a.n.value));
    let y = 16;
    inCol.forEach(({ n }, rank) => {
      const h = Math.max(3, n.value * k);
      const slot = Math.max(h, minSlot);
      placed.push({ ...n, x: colX(c), y: y + (slot - h) / 2, h, slot });
      order.set(n.id, rank + c * 1000);
      y += slot + gap;
    });
  }
  const byId = new Map(placed.map((n) => [n.id, n]));
  const height = Math.max(200, ...placed.map((n) => n.y + n.h + 16));

  const outCursor = new Map<string, number>();
  const inCursor = new Map<string, number>();
  const links: PlacedLink[] = [...chart.links]
    .filter((l) => byId.has(l.source) && byId.has(l.target) && l.value > 0)
    .sort((a, b) => (byId.get(a.source)!.y - byId.get(b.source)!.y) || (byId.get(a.target)!.y - byId.get(b.target)!.y))
    .map((l, i) => {
      const s = byId.get(l.source)!;
      const t = byId.get(l.target)!;
      const thick = Math.max(1, l.value * k);
      const sy = s.y + (outCursor.get(s.id) || 0);
      const ty = t.y + (inCursor.get(t.id) || 0);
      outCursor.set(s.id, (outCursor.get(s.id) || 0) + thick);
      inCursor.set(t.id, (inCursor.get(t.id) || 0) + thick);
      const x0 = s.x + nodeW;
      const x1 = t.x;
      const mid = (x0 + x1) / 2;
      const path = `M${x0},${sy} C${mid},${sy} ${mid},${ty} ${x1},${ty} L${x1},${ty + thick} C${mid},${ty + thick} ${mid},${sy + thick} ${x0},${sy + thick} Z`;
      return { ...l, path, key: `${l.source}>${l.target}:${i}` };
    });
  return { placed, links, height, nodeW, columns, colX };
}

function SankeySvg({ chart, width, onPick }: { chart: FlowChartData; width: number; onPick: (text: string | null) => void }) {
  const router = useRouter();
  const { placed, links, height, nodeW } = useMemo(() => layout(chart, width), [chart, width]);
  const [hover, setHover] = useState<string | null>(null);
  const byId = new Map(placed.map((n) => [n.id, n]));

  // What lights up: a node and everything flowing into or out of it (one step each way), or one ribbon.
  const lit = useMemo(() => {
    if (!hover) return null;
    const nodes = new Set<string>();
    const ls = new Set<string>();
    if (hover.startsWith("link:")) {
      const link = links.find((l) => `link:${l.key}` === hover);
      if (link) { ls.add(link.key); nodes.add(link.source); nodes.add(link.target); }
    } else {
      nodes.add(hover);
      for (const l of links) if (l.source === hover || l.target === hover) { ls.add(l.key); nodes.add(l.source); nodes.add(l.target); }
    }
    return { nodes, ls };
  }, [hover, links]);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full select-none" role="img" aria-label="Where income goes this month" onPointerLeave={() => { setHover(null); onPick(null); }}>
      {links.map((l) => (
        <path
          key={l.key}
          d={l.path}
          fill={l.colour}
          opacity={lit ? (lit.ls.has(l.key) ? 0.45 : 0.06) : 0.2}
          className="cursor-pointer transition-opacity duration-150"
          onPointerEnter={() => { setHover(`link:${l.key}`); onPick(`${byId.get(l.source)?.label} → ${byId.get(l.target)?.label}: ${gbp(l.value)}`); }}
        />
      ))}
      {placed.map((n) => {
        const dim = lit && !lit.nodes.has(n.id);
        const leftSide = n.column === 0;
        const cy = n.y + n.h / 2;
        const tx = leftSide ? n.x - 10 : n.x + nodeW + 10;
        return (
          <g
            key={n.id}
            opacity={dim ? 0.3 : 1}
            className={`transition-opacity duration-150 ${n.href ? "cursor-pointer" : ""}`}
            onPointerEnter={() => { setHover(n.id); onPick(`${n.label}: ${gbp(n.value)}${n.note ? ` · ${n.note}` : ""}`); }}
            onClick={() => { if (n.href) router.push(n.href); }}
          >
            <rect x={n.x} y={n.y} width={nodeW} height={n.h} rx={3} fill={n.colour} />
            <text x={tx} y={cy - 3} textAnchor={leftSide ? "end" : "start"} className="fill-slate-900 text-[13px] font-bold" paintOrder="stroke" stroke="white" strokeWidth={4} strokeLinejoin="round">{n.label.length > 26 ? `${n.label.slice(0, 25)}…` : n.label}</text>
            <text x={tx} y={cy + 12} textAnchor={leftSide ? "end" : "start"} className="fill-slate-500 text-[11.5px] font-semibold" paintOrder="stroke" stroke="white" strokeWidth={4} strokeLinejoin="round">{gbp(n.value)}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** Phones: no ribbons, just the same numbers as bars and lists. */
function FlowList({ chart, expanded, total }: { chart: FlowChartData; expanded: boolean; total: number }) {
  const col = (c: number) => chart.nodes.filter((n) => n.column === c);
  // A child shown under a parent carries the amount that flows between them (e.g. Dan's share of Household).
  const children = (id: string) => chart.links
    .filter((l) => l.source === id)
    .map((l) => { const node = chart.nodes.find((n) => n.id === l.target); return node ? { ...node, value: l.value, full: node.value } : null; })
    .filter(Boolean) as Array<FlowChartNode & { full: number }>;
  const stages = col(1);
  return (
    <div className="space-y-4">
      {expanded && col(0).length > 1 ? (
        <div>
          <p className="mb-1.5 text-[11px] font-black uppercase tracking-wide text-slate-400">Money in</p>
          <ul className="space-y-1">{col(0).map((n) => <Row key={n.id} node={n} total={total} />)}</ul>
        </div>
      ) : null}
      <div>
        <div className="flex h-9 w-full overflow-hidden rounded-2xl">
          {stages.map((n) => <div key={n.id} style={{ width: `${(n.value / Math.max(1, total)) * 100}%`, backgroundColor: n.colour }} className="flex items-center justify-center truncate px-1 text-[10px] font-black text-white">{Math.round((n.value / Math.max(1, total)) * 100)}%</div>)}
        </div>
        <ul className="mt-2 space-y-1">{stages.map((n) => <Row key={n.id} node={n} total={total} />)}</ul>
      </div>
      {stages.map((stage) => {
        const kids = children(stage.id);
        if (!kids.length) return null;
        return (
          <div key={stage.id}>
            <p className="mb-1.5 text-[11px] font-black uppercase tracking-wide text-slate-400">{stage.id.startsWith("person:") ? `${stage.label} pays for` : `${stage.label} by ${stage.id === "spending" ? "group" : "account"}`}</p>
            <ul className="space-y-1">
              {kids.map((kid) => (
                <li key={kid.id}>
                  <Row node={kid} total={stage.value} suffix={kid.full - kid.value > 0.5 ? `of ${gbp(kid.full)}` : undefined} />
                  {expanded && children(kid.id).length ? (
                    <ul className="ml-4 mt-1 space-y-1 border-l-2 pl-3" style={{ borderColor: kid.colour }}>
                      {children(kid.id).map((c) => <Row key={c.id} node={c} total={kid.value} small />)}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function Row({ node, total, small, suffix }: { node: FlowChartNode; total: number; small?: boolean; suffix?: string }) {
  const pct = Math.min(100, (node.value / Math.max(1, total)) * 100);
  const body = (
    <span className={`block rounded-xl bg-slate-50 px-3 ${small ? "py-1.5" : "py-2"}`}>
      <span className="flex items-center justify-between gap-3 text-xs font-bold text-slate-700">
        <span className="flex min-w-0 items-center gap-2"><span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: node.colour }} /><span className="truncate">{node.label}</span></span>
        <span className="shrink-0 tabular-nums text-slate-900">{gbp(node.value)}{suffix ? <span className="ml-1 font-semibold text-slate-400">{suffix}</span> : null}</span>
      </span>
      <span className="mt-1 block h-1 overflow-hidden rounded-full bg-slate-200"><span className="block h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: node.colour }} /></span>
    </span>
  );
  return <li className="list-none">{node.href ? <Link href={node.href}>{body}</Link> : body}</li>;
}

export function FlowChart({ summary, detail, total, title, summaryNote, detailNote }: { summary: FlowChartData; detail: FlowChartData; total: number; title: string; summaryNote?: string; detailNote?: string }) {
  const [expanded, setExpanded] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => {
    // Read after the first paint so the server and browser render the same first view.
    const timer = window.setTimeout(() => {
      try { if (window.localStorage.getItem(STORAGE_KEY) === "1") setExpanded(true); } catch { /* storage unavailable */ }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  const toggle = () => {
    setExpanded((v) => {
      try { window.localStorage.setItem(STORAGE_KEY, v ? "0" : "1"); } catch { /* storage unavailable */ }
      return !v;
    });
  };
  const chart = expanded ? detail : summary;
  // Drawn at the real width of its box, so text stays at a normal reading size on any screen.
  const box = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState(1000);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setMeasured(Math.round(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const width = Math.max(expanded ? 900 : 680, measured);

  return (
    <section className="rounded-3xl border border-white/70 bg-white/92 p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">This month&apos;s flow</p>
          <h2 className="text-base font-bold text-slate-900">{title}</h2>
        </div>
        <button type="button" onClick={toggle} aria-expanded={expanded} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3.5 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-200">
          {expanded ? <>Show summary <ChevronUp className="h-3.5 w-3.5" /></> : <>Show more detail <ChevronDown className="h-3.5 w-3.5" /></>}
        </button>
      </div>

      {(expanded ? detailNote : summaryNote) ? (
        <p className={`mt-2 rounded-2xl px-3 py-2 text-xs font-semibold ${expanded ? "bg-sky-50 text-sky-900" : "text-slate-500"}`}>{expanded ? detailNote : summaryNote}</p>
      ) : null}

      <div className="md:hidden mt-3">
        <FlowList chart={chart} expanded={expanded} total={total} />
      </div>

      <div className="hidden md:block">
        <p className="mt-2 h-5 text-xs font-bold text-slate-500" aria-live="polite">{picked ?? (expanded ? "Hover a flow to see it on its own · click a box to open it" : "Hover to see amounts · Show more detail for each income, group and category")}</p>
        <div ref={box} className="overflow-x-auto">
          <div style={{ minWidth: expanded ? 900 : 680 }}>
            <SankeySvg chart={chart} width={width} onPick={setPicked} />
          </div>
        </div>
        {expanded ? (
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">
            {chart.columns.map((c) => <span key={c}>{c}</span>)}
          </div>
        ) : null}
      </div>
    </section>
  );
}
