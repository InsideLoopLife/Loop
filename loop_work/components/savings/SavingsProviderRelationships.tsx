"use client";

import { useMemo, useState, useTransition } from "react";
import type { FinancialInstitution } from "@/lib/catalogue/financial-institutions";
import { normaliseInstitutionSearch } from "@/lib/catalogue/financial-institutions";

type HeldProvider = {
  provider_slug: string;
  provider_name: string | null;
  relationship_type: string | null;
};

type Props = {
  institutions: FinancialInstitution[];
  heldProviders: HeldProvider[];
  saveAction: (formData: FormData) => Promise<void>;
};

function clean(value: string) {
  return normaliseInstitutionSearch(value);
}

export function SavingsProviderRelationships({ institutions, heldProviders, saveAction }: Props) {
  const [query, setQuery] = useState("");
  const [isPending, startTransition] = useTransition();
  const held = new Set(heldProviders.map((item) => item.provider_slug));
  const filtered = useMemo(() => {
    const q = clean(query);
    const rows = institutions.filter((item) => item.type !== "investment_platform");
    if (!q) return [] as FinancialInstitution[];
    return rows
      .map((item) => ({ item, haystack: clean([item.name, item.slug, ...item.aliases].join(" ")) }))
      .filter(({ haystack, item }) => haystack.includes(q) || q.includes(clean(item.name)) || item.aliases.some((alias) => clean(alias).includes(q)))
      .map(({ item }) => item)
      .slice(0, 14);
  }, [institutions, query]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {heldProviders.length > 0 ? heldProviders.map((item) => {
          const provider = institutions.find((row) => row.slug === item.provider_slug);
          return <span key={item.provider_slug} className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black text-emerald-800">{provider?.name ?? item.provider_name ?? item.provider_slug}</span>;
        }) : <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-500">No existing bank relationships logged yet</span>}
      </div>
      <div className="relative">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Start typing: Revolut, Nationwide, Coventry, Monzo, Santander…" className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold outline-none ring-orange-500 focus:ring-2" />
        {query.trim() && filtered.length === 0 ? (
          <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-900">No match yet. Try the full provider name. If it is still missing, save the account manually and LOOP can add it to the catalogue.</div>
        ) : null}
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {filtered.map((item) => (
          <form key={item.slug} action={(formData) => startTransition(async () => saveAction(formData))}>
            <input type="hidden" name="provider_slug" value={item.slug} />
            <input type="hidden" name="provider_name" value={item.name} />
            <input type="hidden" name="relationship_type" value={held.has(item.slug) ? "remove" : "existing_customer"} />
            <button disabled={isPending} className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm font-black shadow-sm ${held.has(item.slug) ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-slate-200 bg-white text-slate-700"}`}>
              <span className={`grid h-9 w-9 place-items-center rounded-xl text-xs ${item.brandClass}`}>{item.logoText}</span>
              <span>{held.has(item.slug) ? "✓ " : "+ "}{item.name}</span>
            </button>
          </form>
        ))}
      </div>
      {!query.trim() ? <p className="rounded-2xl bg-slate-50 p-3 text-xs font-bold text-slate-500">Type to search the UK bank/building society catalogue instead of scrolling a fixed list. This includes mainstream banks, app banks, savings platforms and regional building societies.</p> : null}
      <p className="text-xs font-bold text-slate-500">This powers eligibility logic later: some savings deals need an existing current account or member relationship before LOOP recommends them.</p>
    </div>
  );
}
