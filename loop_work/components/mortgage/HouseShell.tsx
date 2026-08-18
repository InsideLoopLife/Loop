"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { formatMoney } from "@/lib/format/money";
import type { Home, HomeMortgageDeal, HomeValuationSource } from "@/components/mortgage/MortgagePlannerClient";

type Props = {
  homes: Home[];
  deals: HomeMortgageDeal[];
  valuations: HomeValuationSource[];
  children: React.ReactNode;
};

function valueFor(home: Home | undefined, valuations: HomeValuationSource[]) {
  if (!home) return 0;
  if (Number(home.estimated_value_mid || 0) > 0) return Number(home.estimated_value_mid);
  const values = valuations
    .filter((v) => v.home_id === home.id)
    .map((v) => Number(v.valuation_mid ?? v.valuation_amount ?? 0))
    .filter(Boolean);
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : Number(home.property_value || 0);
}

export function HouseShell({ homes, deals, valuations, children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const home = homes.find((h) => h.ownership_status === "current_home") ?? homes[0];
  const deal = deals.find((d) => d.home_id === home?.id) ?? deals[0];
  const value = valueFor(home, valuations);
  const equity = Math.max(0, value - Number(deal?.balance || 0));

  const links = [
    ["/mortgage", "Overview", "⌂"],
    ["/mortgage/property", "Property", "◇"],
    ["/mortgage/rates", "Rates", "⌁"],
    ["/affordability", "Afford", "◉"],
    ["/mortgage/moving-costs", "Move", "▣"],
  ] as const;

  useEffect(() => {
    links.forEach(([href]) => {
      if (href !== pathname) router.prefetch(href);
    });
  }, [pathname, router]);

  const active = (href: string) =>
    href === "/mortgage"
      ? pathname === "/mortgage"
      : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <main className="mx-auto w-full max-w-[1900px] overflow-x-hidden px-3 pb-28 pt-4 font-sans sm:px-5 sm:pb-8 lg:px-6 xl:px-8">
      <nav
        aria-label="House sections"
        className="-mx-3 mb-4 flex gap-2 overflow-x-auto border-y border-slate-200/70 bg-white/85 px-3 py-2 backdrop-blur-xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:hidden"
      >
        {links.map(([href, label, icon]) => (
          <Link
            key={href}
            href={href}
            prefetch
            className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2 text-xs font-bold ${
              active(href) ? "bg-slate-950 text-white" : "bg-slate-100 text-slate-600"
            }`}
          >
            <span>{icon}</span><span>{label}</span>
          </Link>
        ))}
      </nav>

      <div className="grid min-w-0 gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <div className="sticky top-24 space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <p className="px-3 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">House</p>
              {links.map(([href, label, icon]) => (
                <Link
                  key={href}
                  href={href}
                  prefetch
                  className={`mb-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold ${
                    active(href) ? "bg-violet-50 text-violet-700" : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <span className="w-5 text-center text-xs">{icon}</span>
                  {label === "Rates" ? "Mortgage & rates" : label === "Afford" ? "Affordability" : label === "Move" ? "Moving costs" : label}
                </Link>
              ))}
              <div className="my-3 border-t border-slate-100" />
              <p className="px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">Quick actions</p>
              <Link href="/mortgage/advanced?intent=add_home" prefetch className="block rounded-xl px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">＋ Add property</Link>
              <Link href="/mortgage/advanced?intent=add_mortgage" prefetch className="block rounded-xl px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">▣ Add mortgage</Link>
              <Link href="/mortgage/rates" prefetch className="block rounded-xl px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50">⇄ Compare rates</Link>
            </div>

            {home ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
                <p className="px-2 pt-1 text-xs font-bold text-slate-950">Your properties</p>
                <div className="mt-3 rounded-xl bg-slate-50 p-3">
                  <div className="flex items-center gap-3">
                    <div className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-sky-100 to-violet-100 text-lg">🏠</div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-950">{home.label || "Home"}</p>
                      <p className="text-[10px] font-bold text-violet-600">● Primary residence</p>
                    </div>
                  </div>
                  <dl className="mt-3 space-y-2">
                    <div><dt className="text-[10px] font-bold text-slate-400">Estimated value</dt><dd className="text-sm font-bold">{formatMoney(value)}</dd></div>
                    <div><dt className="text-[10px] font-bold text-slate-400">Equity</dt><dd className="text-sm font-bold">{formatMoney(equity)}</dd></div>
                  </dl>
                  <Link href="/mortgage/property" prefetch className="mt-3 block rounded-xl border border-violet-200 bg-white px-3 py-2 text-center text-xs font-bold text-violet-700">View property</Link>
                </div>
              </div>
            ) : null}
          </div>
        </aside>

        <div className="min-w-0">{children}</div>
      </div>
    </main>
  );
}
