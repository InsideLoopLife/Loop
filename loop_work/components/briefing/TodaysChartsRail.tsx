"use client";

import { Landmark, LayoutGrid, ListChecks, PiggyBank, Table2, TrendingUp, WalletCards, Home as HomeIcon, BarChart3, ShieldCheck } from "lucide-react";
import type { BriefingCardKey } from "@/lib/briefing/chat-cards";
import type { ChatMessageData } from "./ChatMessage";

const CARD_META: Record<BriefingCardKey, { label: string; icon: typeof LayoutGrid }> = {
  net_worth: { label: "Net worth", icon: TrendingUp },
  category_grid: { label: "Live picture", icon: LayoutGrid },
  actions: { label: "Priority actions", icon: ListChecks },
  flow: { label: "Financial flow", icon: WalletCards },
  portfolio: { label: "Portfolio & markets", icon: BarChart3 },
  savings: { label: "Savings & goals", icon: PiggyBank },
  home: { label: "Home & mortgage", icon: HomeIcon },
  evidence: { label: "Evidence health", icon: ShieldCheck },
  holdings_table: { label: "Your holdings", icon: Table2 },
  pension_funds_table: { label: "Pension funds", icon: Landmark },
};

export function TodaysChartsRail({ messages }: { messages: ChatMessageData[] }) {
  const entries = messages.filter((m) => m.role === "assistant" && (m.card || m.chart));

  return (
    <aside className="sticky top-4 hidden max-h-[calc(100vh-2rem)] w-full shrink-0 flex-col gap-3 overflow-y-auto lg:flex lg:w-[280px]">
      <p className="px-1 text-xs font-black uppercase tracking-[.18em] text-slate-400">Today&apos;s charts</p>
      {entries.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-slate-200 px-4 py-6 text-center text-xs font-semibold text-slate-400">
          Charts and tables from your conversation will collect here as you ask.
        </p>
      ) : (
        entries.map((entry) => {
          const meta = entry.chart ? { label: entry.chart.title, icon: TrendingUp } : entry.card ? CARD_META[entry.card] : null;
          if (!meta) return null;
          const Icon = meta.icon;
          return (
            <a
              key={entry.id}
              href={`#msg-${entry.id}`}
              className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-md"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600">
                <Icon className="h-4 w-4" />
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-black text-slate-800">{meta.label}</span>
                <span className="line-clamp-2 block text-xs font-semibold text-slate-400">{entry.content}</span>
              </span>
            </a>
          );
        })
      )}
    </aside>
  );
}
