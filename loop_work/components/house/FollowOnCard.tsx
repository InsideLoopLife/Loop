// components/house/FollowOnCard.tsx
//
// Clickable follow-on estimate. Opens a picker of real candidate deals
// (fetched from /api/house/mortgage/deal-options); selecting one POSTs to
// /api/house/mortgage/shortlist and patches this card's state directly —
// no page navigation, no full overview refetch needed for the visual update
// (the parent can still refetch overview in the background if other cards
// depend on the same shortlist).

'use client';

import { useState } from 'react';
import { InfoTooltip } from './InfoTooltip';

interface DealOption {
  id: string;
  lender_name: string;
  product_name: string;
  rate_percent: number;
  rate_type: string;
  term_label: string | null;
  monthly_payment: number;
}

interface FollowOnState {
  shortlisted_deal_id: string | null;
  shortlisted_label: string;
  monthly_payment: number;
  delta_vs_current: number;
  rate_percent: number;
  better_deals_available: number;
}

function formatGBP(n: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(n);
}

export function FollowOnCard({
  homeId,
  balance,
  termYears,
  currentLtv,
  initial,
}: {
  homeId: string;
  balance: number;
  termYears: number;
  currentLtv: number | null;
  initial: FollowOnState;
}) {
  const [state, setState] = useState(initial);
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<DealOption[] | null>(null);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [toast, setToast] = useState(false);

  async function openPicker() {
    setOpen(true);
    setLoadingOptions(true);
    const params = new URLSearchParams({
      home_id: homeId,
      balance: String(balance),
      term_years: String(termYears),
      ...(currentLtv ? { current_ltv: String(currentLtv) } : {}),
    });
    const res = await fetch(`/api/house/mortgage/deal-options?${params}`);
    const data = await res.json();
    setOptions(data.options ?? []);
    setLoadingOptions(false);
  }

  async function selectDeal(option: DealOption) {
    setUpdating(true);
    setOpen(false);

    // Optimistic patch — the whole point is no page reload / no flash of stale data.
    setState({
      shortlisted_deal_id: option.id,
      shortlisted_label: `${option.lender_name}${option.product_name ? ' · ' + option.product_name : ''}`,
      monthly_payment: option.monthly_payment,
      delta_vs_current: option.monthly_payment - (initial.monthly_payment - initial.delta_vs_current),
      rate_percent: option.rate_percent,
      better_deals_available: state.better_deals_available,
    });

    await fetch('/api/house/mortgage/shortlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ home_id: homeId, source_id: option.id }),
    });

    setUpdating(false);
    setToast(true);
    setTimeout(() => setToast(false), 1800);
  }

  return (
    <>
      <div
        onClick={openPicker}
        className="cursor-pointer rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50 p-3.5 transition-all hover:shadow-lg hover:shadow-amber-100 hover:-translate-y-0.5"
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center text-[10.5px] font-bold text-amber-700 uppercase tracking-wide">
            Estimated follow-on
            <span onClick={(e) => e.stopPropagation()}>
              <InfoTooltip text="What you'd likely pay if your current deal ended today and you moved to the shortlisted option." />
            </span>
          </div>
          <span className="text-[11px] font-bold text-amber-700 underline underline-offset-2">Shortlist a deal ↗</span>
        </div>

        <div className={`text-[27px] font-extrabold mt-1 transition-opacity ${updating ? 'opacity-30' : 'opacity-100'}`}>
          {formatGBP(state.monthly_payment)}
          <span className="text-[13px] font-semibold text-amber-700">/mo</span>
        </div>
        <div className={`text-[12.5px] font-semibold text-amber-700 transition-opacity ${updating ? 'opacity-30' : 'opacity-100'}`}>
          {state.delta_vs_current >= 0 ? '+' : ''}
          {formatGBP(state.delta_vs_current)}/mo vs current · {state.rate_percent}%
        </div>
        <div className="text-[11px] text-amber-700 mt-2 pt-2 border-t border-dashed border-amber-300">
          Shortlisted: {state.shortlisted_label}
          {state.better_deals_available > 0 && ` · ${state.better_deals_available} better deals available →`}
        </div>
      </div>

      {open && (
        <div
          className="fixed inset-0 bg-black/35 z-50 flex items-center justify-center p-5"
          onClick={() => setOpen(false)}
        >
          <div className="bg-white rounded-2xl p-4.5 w-full max-w-sm shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[15px] font-bold mb-1">Shortlist a follow-on deal</h3>
            <p className="text-[12.5px] text-neutral-500 mb-3.5">Swaps the estimate instantly — nothing else on the page reloads.</p>

            {loadingOptions && <p className="text-sm text-neutral-400 py-4">Loading deals…</p>}
            {!loadingOptions && options?.length === 0 && (
              <p className="text-sm text-neutral-400 py-4">No matching deals found for this LTV band right now.</p>
            )}

            {options?.map((opt) => (
              <button
                key={opt.id}
                onClick={() => selectDeal(opt)}
                className="w-full flex items-center justify-between px-3 py-2.5 border border-neutral-200 rounded-xl mb-2 text-left hover:border-neutral-900 hover:bg-neutral-50"
              >
                <div>
                  <div className="text-[13px] font-bold">
                    {opt.lender_name} {opt.term_label ?? ''}
                  </div>
                  <div className="text-[11.5px] text-neutral-500">
                    {opt.rate_percent}% · {opt.rate_type}
                  </div>
                </div>
                <div className="text-[14px] font-bold">{formatGBP(opt.monthly_payment)}/mo</div>
              </button>
            ))}

            <div className="text-right mt-1">
              <button onClick={() => setOpen(false)} className="text-[12px] font-semibold text-neutral-500">
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 bg-neutral-900 text-white text-[12.5px] font-semibold px-4 py-2.5 rounded-full shadow-xl z-[60]">
          Follow-on estimate updated
        </div>
      )}
    </>
  );
}
