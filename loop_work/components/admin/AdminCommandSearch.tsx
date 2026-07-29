"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import type { LoopSection } from "@/lib/navigation/sections";

const functionAliases: Array<{ label: string; href: string; description: string; keywords: string }> = [
  { label: "Run mortgage catalogue refresh", href: "/admin/houses?tab=catalogue", description: "AI/source mortgage product extraction, accepted catalogue and broken deal checks.", keywords: "mortgage rates lender sources catalogue refresh accepted broken flagged ltv" },
  { label: "Run mortgage watch", href: "/admin/houses?tab=catalogue", description: "Compare active mortgage products against user mortgage records.", keywords: "mortgage watch renewal remortgage product transfer run cron" },
  { label: "Run savings source refresh", href: "/admin/savings", description: "Refresh public savings source catalogue and stage new savings deals.", keywords: "savings cash isa aer interest rate source refresh google provider" },
  { label: "Run savings watch", href: "/admin/savings", description: "Compare active savings deals with user savings accounts and provider relationships.", keywords: "savings recommendations optimise surplus run watch" },
  { label: "Investment refresh cadence", href: "/admin/investments", description: "Broker sync, raw price points, coverage queue, Trading 212 direct data and update settings.", keywords: "investment snaptrade trading 212 cash p/l cadence cron prices lots dividends coverage queue" },
  { label: "Process instrument coverage queue", href: "/admin/investments", description: "Runs the queued ticker/ETF enrichment worker and fills placeholders when matches are safe.", keywords: "add ticker coverage placeholder instrument no match ai queue starter history logo" },
  { label: "Chart storage settings", href: "/admin/investment-storage", description: "Control stored points, retention and database usage.", keywords: "chart points storage retention database investment snapshots" },
  { label: "Broker integrations", href: "/integrations", description: "Connect SnapTrade, refresh Trading 212 accounts and manage user-level broker access.", keywords: "snaptrade broker trading 212 gia isa cash integration" },
  { label: "Future integrations checklist", href: "/admin/future-integrations", description: "Premium product setup checklist and launch tasks.", keywords: "future integrations setup checklist loop inbox postmark mortgage savings" },
];

export function AdminCommandSearch({ sections }: { sections: LoopSection[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const items = useMemo(() => {
    const sectionItems = sections.map((section) => ({
      label: section.label,
      href: section.href,
      description: section.description || "Admin area",
      keywords: `${section.key} ${section.icon} ${section.label} ${section.description || ""}`,
    }));
    return [...functionAliases, ...sectionItems];
  }, [sections]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, 10);
    return items
      .filter((item) => `${item.label} ${item.description} ${item.keywords}`.toLowerCase().includes(q))
      .slice(0, 12);
  }, [items, query]);

  return (
    <div className="relative ml-auto shrink-0">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 shadow-sm hover:bg-slate-50"
        title="Search admin functions"
      >
        <Search className="h-4 w-4" /> Search admin
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 bg-slate-950/45 p-4 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div className="mx-auto mt-14 w-full max-w-2xl rounded-[2rem] bg-white p-4 shadow-2xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <Search className="h-5 w-5 text-slate-400" />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search jobs, pages, savings, mortgage, SnapTrade, storage..."
                className="min-w-0 flex-1 bg-transparent text-sm font-bold text-slate-950 outline-none placeholder:text-slate-400"
              />
              <button type="button" onClick={() => setOpen(false)} className="grid h-8 w-8 place-items-center rounded-full bg-white text-slate-500 ring-1 ring-slate-200">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 max-h-[65vh] overflow-y-auto space-y-2">
              {filtered.map((item) => (
                <Link key={`${item.href}-${item.label}`} href={item.href} onClick={() => setOpen(false)} className="block rounded-2xl border border-slate-100 bg-white p-4 hover:bg-slate-50">
                  <p className="font-black text-slate-950">{item.label}</p>
                  <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">{item.description}</p>
                </Link>
              ))}
              {!filtered.length ? <p className="rounded-2xl border border-dashed border-slate-200 p-4 text-sm font-bold text-slate-500">No matching admin function found.</p> : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
