// components/house/MortgageBubble.tsx

import type { LiabilityShare } from '@/lib/house/overview-data';

function formatGBP(n: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(n);
}

const AVATAR_COLORS = ['#2f5bff', '#ff5d5d', '#0f9d58', '#e08a2b'];

function LiabilityLine({ source, shares }: { source: string; shares: LiabilityShare[] }) {
  if (!shares.length) return null;

  const label =
    source === 'explicit'
      ? shares.map((s) => `${s.person_name} ${s.percent}%`).join(' · ')
      : `${shares.map((s) => `${Math.round(s.percent)}/${Math.round(100 - s.percent)}`)[0] ?? ''} split · assumed from ${
          source === 'ownership_share' ? 'ownership' : 'equal split'
        }`;

  const title =
    source === 'explicit'
      ? 'Set by you.'
      : `${shares.map((s) => s.person_name).join(' and ')} — assumed evenly unless you set it differently.`;

  return (
    <button
      type="button"
      title={title}
      className="mt-2.5 inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-neutral-500 bg-neutral-100 hover:bg-neutral-200 rounded-lg px-2 py-1 transition-colors"
    >
      <span className="flex">
        {shares.slice(0, 3).map((s, i) => (
          <span
            key={s.person_id}
            className="w-[15px] h-[15px] rounded-full text-white text-[8px] font-extrabold flex items-center justify-center border-[1.5px] border-neutral-100"
            style={{ backgroundColor: AVATAR_COLORS[i % AVATAR_COLORS.length], marginLeft: i === 0 ? 0 : -5 }}
          >
            {s.person_name?.[0] ?? '?'}
          </span>
        ))}
      </span>
      {label}
    </button>
  );
}

export function MortgageBubble({
  lenderName,
  monthlyPayment,
  rateType,
  liability,
}: {
  lenderName: string;
  monthlyPayment: number;
  rateType: string | null;
  liability: { source: string; shares: LiabilityShare[] };
}) {
  const initials = lenderName
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="border border-neutral-200 rounded-2xl p-3.5 bg-neutral-50">
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          {/* Placeholder mark — swap for a real logo asset lookup by lender_slug in production */}
          <div className="w-[26px] h-[26px] rounded-lg bg-[#5a287d] text-white flex items-center justify-center text-[11px] font-extrabold">
            {initials}
          </div>
          <div className="text-[12.5px] font-bold">{lenderName}</div>
        </div>
        {rateType && (
          <div className="bg-neutral-100 text-neutral-500 text-[10.5px] font-bold px-2 py-0.5 rounded-full">{rateType}</div>
        )}
      </div>
      <div className="text-[22px] font-extrabold tracking-tight">
        {formatGBP(monthlyPayment)}
        <span className="text-[13px] font-semibold text-neutral-400">/mo</span>
      </div>
      <LiabilityLine source={liability.source} shares={liability.shares} />
    </div>
  );
}
