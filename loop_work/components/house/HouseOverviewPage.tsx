// components/house/HouseOverviewPage.tsx
//
// Composes the whole redesigned screen: fetches /api/house/overview once,
// renders the stat strip + mortgage bubble + follow-on card + glimpse grid.
// The map/home-details cards from the original screen are intentionally left
// as-is here (Dan's note: the map footer cards didn't need changing) — this
// component assumes they're rendered by whatever already renders them, and
// slots in around that. Replace <ExistingMapAndHomeDetails /> with the real
// components from your codebase.

'use client';

import { useEffect, useState } from 'react';
import { StatStrip } from './StatStrip';
import { MortgageBubble } from './MortgageBubble';
import { FollowOnCard } from './FollowOnCard';
import { GlimpseNavGrid } from './GlimpseNavGrid';
import type { HouseOverviewPayload } from '@/lib/house/overview-data';

export function HouseOverviewPage({ householdId, homeId }: { householdId: string; homeId?: string }) {
  const [data, setData] = useState<HouseOverviewPayload | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'deals' | 'moving' | 'valuation' | 'overpayments'>('overview');

  useEffect(() => {
    const params = new URLSearchParams({ household_id: householdId, ...(homeId ? { home_id: homeId } : {}) });
    fetch(`/api/house/overview?${params}`)
      .then((res) => res.json())
      .then(setData);
  }, [householdId, homeId]);

  if (!data) {
    return (
      <div className="max-w-[1180px] mx-auto px-5 py-7">
        <div className="h-24 rounded-2xl bg-neutral-100 animate-pulse mb-5" />
        <div className="h-72 rounded-2xl bg-neutral-100 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="max-w-[1180px] mx-auto px-5 py-7 pb-20">
      <h1 className="text-[26px] font-bold tracking-tight mb-1">House</h1>
      <p className="text-[14px] text-neutral-500 mb-5 max-w-[620px]">
        Track the current home, mortgage and moves in one place. Tap any card below for the full detail.
      </p>

      <StatStrip
        mortgageBalance={data.stats.mortgage_balance}
        mortgagePayment={data.stats.mortgage_payment}
        dealsAvailable={data.stats.deals_available}
      />

      {/* Map + home details cards go here unchanged — see file header note. */}
      {/* <ExistingMapAndHomeDetails home={data.home} /> */}

      {data.mortgage && (
        <div className="rounded-2xl border border-neutral-200 bg-white p-4 mb-5">
          <div className="text-[11px] font-bold text-neutral-400 uppercase tracking-wide mb-3">Attached mortgage</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <MortgageBubble
              lenderName={data.mortgage.lender_name}
              monthlyPayment={data.mortgage.monthly_payment}
              rateType={data.mortgage.rate_type}
              liability={data.mortgage.liability}
            />
            {data.followOn && (
              <FollowOnCard
                homeId={data.home.id}
                balance={data.mortgage.balance}
                termYears={25}
                currentLtv={data.home.ltv_percent}
                initial={data.followOn}
              />
            )}
          </div>
        </div>
      )}

      <div className="text-[13px] font-bold text-neutral-500 mt-7 mb-2.5">More on this house</div>
      <GlimpseNavGrid
        active={activeTab}
        onSelect={setActiveTab}
        ltvPercent={data.home.ltv_percent}
        valuationEstimate={data.home.estimated_value}
        householdBuffer={null /* TODO: wire to household cashflow buffer once that source is pointed out */}
        dealsPossible={data.glimpses.mortgage_deals_possible}
        bestRatePercent={data.glimpses.best_rate_percent}
        valuationSourceCount={data.glimpses.valuation_source_count}
      />
    </div>
  );
}
