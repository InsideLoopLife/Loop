"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, CheckCircle2, Info, Lightbulb } from "lucide-react";
import type { Insight, PatternSummary } from "@/lib/nutrition/patterns";

const HIDE_DAYS = 7;
const STORE_KEY = "loop.nutrition.hiddenInsights";

const CHANGE_EVENT = "loop:hidden-insights";

function readRaw() {
  try {
    return window.localStorage.getItem(STORE_KEY) || "{}";
  } catch {
    return "{}";
  }
}

function parseHidden(raw: string): Record<string, number> {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function hideInsight(key: string) {
  const now = new Date().getTime();
  const next = parseHidden(readRaw());
  next[key] = now + HIDE_DAYS * 86_400_000;
  // Drop expired entries so storage doesn't grow forever.
  for (const [entry, until] of Object.entries(next)) if (until < now) delete next[entry];
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable — hiding just won't persist */
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

const TONE: Record<Insight["tone"], { icon: typeof Info; ring: string; iconTone: string }> = {
  warn: { icon: AlertTriangle, ring: "ring-amber-200 bg-amber-50/70", iconTone: "text-amber-600" },
  good: { icon: CheckCircle2, ring: "ring-emerald-200 bg-emerald-50/70", iconTone: "text-emerald-600" },
  info: { icon: Info, ring: "ring-slate-200 bg-white", iconTone: "text-slate-500" },
};

export function TrendChip({ trend }: { trend: { diff: number; direction: "up" | "down" | "flat" } | null }) {
  if (!trend) return null;
  const Icon = trend.direction === "up" ? ArrowUpRight : trend.direction === "down" ? ArrowDownRight : ArrowRight;
  const tone = trend.direction === "up" ? "bg-emerald-100 text-emerald-800" : trend.direction === "down" ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-700";
  const text = trend.direction === "flat" ? "Steady vs last week" : `${trend.diff > 0 ? "+" : ""}${trend.diff} vs last week`;
  return <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-black ${tone}`} title="Average daily score this week compared with the week before"><Icon className="h-3.5 w-3.5" /> {text}</span>;
}

export function InsightsPanel({ summary, personKey, title }: { summary: PatternSummary | null; personKey: string; title: string }) {
  const raw = useSyncExternalStore(subscribe, readRaw, () => "{}");
  const hidden = useMemo(() => parseHidden(raw), [raw]);
  const [openedAt] = useState(() => new Date().getTime());
  const [expanded, setExpanded] = useState<string | null>(null);
  if (!summary) return null;
  const visible = summary.insights.filter((insight) => !(hidden[`${personKey}:${insight.id}`] > openedAt)).slice(0, 5);
  const dismiss = (id: string) => hideInsight(`${personKey}:${id}`);

  return (
    <section className="rounded-[1.75rem] border border-white/70 bg-white/85 p-4 shadow-xl sm:rounded-[2.5rem] sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-center gap-2">
          <Lightbulb className="h-5 w-5 text-emerald-600" />
          <h2 className="text-lg font-black text-slate-950">{title}</h2>
        </div>
        <p className="text-xs font-semibold text-slate-500">Last {summary.windowDays} days · {summary.loggedDays} full day{summary.loggedDays === 1 ? "" : "s"} logged · based on what&apos;s been logged</p>
      </div>
      {visible.length ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {visible.map((insight) => {
            const tone = TONE[insight.tone];
            const Icon = tone.icon;
            const open = expanded === insight.id;
            return (
              <article key={insight.id} className={`rounded-2xl p-4 ring-1 ${tone.ring}`}>
                <div className="flex items-start gap-3">
                  <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${tone.iconTone}`} />
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-black text-slate-950">{insight.title}</h3>
                    <p className="mt-1 text-sm font-semibold text-slate-700">{insight.body}</p>
                    {insight.swap ? <p className="mt-2 text-sm font-bold text-emerald-900">Try: {insight.swap}</p> : null}
                    {open && insight.why ? (
                      <p className="mt-2 rounded-xl bg-white/80 p-3 text-xs font-semibold text-slate-600">
                        {insight.why}
                        {insight.source ? <> {insight.source.url ? <a href={insight.source.url} target="_blank" rel="noreferrer" className="font-black text-emerald-800 underline">{insight.source.label}</a> : <span className="font-black">{insight.source.label}</span>}</> : null}
                      </p>
                    ) : null}
                    {!insight.why && insight.source ? <p className="mt-2 text-xs font-semibold text-slate-500">Source: {insight.source.label}</p> : null}
                    <div className="mt-3 flex flex-wrap gap-2">
                      {insight.why ? <button type="button" onClick={() => setExpanded(open ? null : insight.id)} className="rounded-full bg-white px-3 py-1.5 text-xs font-black text-slate-700 ring-1 ring-slate-200">{open ? "Hide why" : "Why this matters"}</button> : null}
                      {insight.id !== "need-more" ? <button type="button" onClick={() => dismiss(insight.id)} className="rounded-full px-3 py-1.5 text-xs font-black text-slate-500 hover:bg-white">Got it — hide for a week</button> : null}
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : <p className="mt-3 text-sm font-semibold text-slate-500">You&apos;ve seen everything for now. New patterns will appear as more days are logged.</p>}
      <p className="mt-4 text-xs font-semibold text-slate-400">General guidance from UK and EU public health bodies, not medical advice.</p>
    </section>
  );
}
