// components/house/StatStrip.tsx

import { InfoTooltip } from './InfoTooltip';

function formatGBP(n: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(n);
}

export function StatStrip({
  mortgageBalance,
  mortgagePayment,
  dealsAvailable,
  improvementsScore,
}: {
  mortgageBalance: number;
  mortgagePayment: number;
  dealsAvailable: number;
  improvementsScore: number | null;
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
      <div className="relative overflow-hidden rounded-2xl border border-neutral-200 bg-white p-4 before:content-[''] before:absolute before:top-0 before:left-0 before:right-0 before:h-[3px] before:bg-gradient-to-r before:from-violet-500 before:to-blue-500">
        <div className="flex items-center text-[10.5px] font-bold tracking-wide text-neutral-400 uppercase">
          Mortgage balance
          <InfoTooltip text="Projected forward from your attached mortgage record's balance and rate." />
        </div>
        <div className="text-2xl font-bold mt-1.5">{formatGBP(mortgageBalance)}</div>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-neutral-200 bg-white p-4 before:content-[''] before:absolute before:top-0 before:left-0 before:right-0 before:h-[3px] before:bg-gradient-to-r before:from-violet-500 before:to-blue-500">
        <div className="flex items-center text-[10.5px] font-bold tracking-wide text-neutral-400 uppercase">
          Mortgage payment
          <InfoTooltip text="The monthly figure used across Loop's household affordability logic." />
        </div>
        <div className="text-2xl font-bold mt-1.5">
          {formatGBP(mortgagePayment)}
          <span className="text-sm font-semibold text-neutral-400">/mo</span>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-blue-100 bg-blue-50 p-4 before:content-[''] before:absolute before:top-0 before:left-0 before:right-0 before:h-[3px] before:bg-gradient-to-r before:from-blue-500 before:to-blue-300">
        <div className="flex items-center text-[10.5px] font-bold tracking-wide text-blue-600 uppercase">
          Deals available
          <InfoTooltip text="Deals we're actively watching that are ready to compare or switch to." />
        </div>
        <div className="text-2xl font-bold mt-1.5">{dealsAvailable}</div>
      </div>

      <div className="relative overflow-hidden rounded-2xl border border-emerald-100 bg-emerald-50 p-4 before:content-[''] before:absolute before:top-0 before:left-0 before:right-0 before:h-[3px] before:bg-gradient-to-r before:from-emerald-500 before:to-emerald-300">
        <div className="flex items-center text-[10.5px] font-bold tracking-wide text-emerald-600 uppercase">
          Improvements
          <InfoTooltip text="Property condition & efficiency score — open it for the full breakdown." />
        </div>
        <div className="text-2xl font-bold mt-1.5">
          {improvementsScore ?? '—'}
          <span className="text-sm font-semibold text-neutral-400">/100</span>
        </div>
      </div>
    </div>
  );
}
