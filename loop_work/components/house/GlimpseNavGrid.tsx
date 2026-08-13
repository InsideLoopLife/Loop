// components/house/GlimpseNavGrid.tsx
//
// The five "more on this house" destinations, each a clickable card showing
// a real glimpse of data rather than a bare tab label. Overpayments is new —
// it's a placeholder glimpse until the overpayment calc engine exists; wire
// its value/caption up once that's built, same pattern as the others.

interface Props {
  active: 'overview' | 'deals' | 'moving' | 'valuation' | 'overpayments';
  onSelect: (key: Props['active']) => void;
  ltvPercent: number | null;
  valuationEstimate: number | null;
  householdBuffer: number | null;
  dealsPossible: number;
  bestRatePercent: number | null;
  movingSearches: number;
  valuationSourceCount: number;
}

function formatGBP(n: number): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(n);
}

function Card({
  active,
  onClick,
  iconBg,
  iconColor,
  icon,
  title,
  value,
  caption,
  tag,
}: {
  active: boolean;
  onClick: () => void;
  iconBg: string;
  iconColor: string;
  icon: string;
  title: string;
  value: string;
  caption: string;
  tag?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-left flex flex-col justify-between min-h-[132px] rounded-2xl border bg-white p-4 transition-all hover:shadow-lg hover:-translate-y-0.5 ${
        active ? 'border-neutral-900 shadow-[inset_0_0_0_2px_rgba(20,20,28,0.08)]' : 'border-neutral-200'
      }`}
    >
      <div className="w-[30px] h-[30px] rounded-lg flex items-center justify-center text-[15px] mb-2.5" style={{ background: iconBg, color: iconColor }}>
        {icon}
      </div>
      <div>
        <div className="text-[13px] font-bold">{title}</div>
        <div className="text-[19px] font-bold mt-1.5 tracking-tight">{value}</div>
        <div className="text-[11.5px] text-neutral-500 mt-0.5">{caption}</div>
      </div>
      {tag && (
        <span className="inline-block mt-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full w-fit bg-neutral-100 text-neutral-500">
          {tag}
        </span>
      )}
    </button>
  );
}

export function GlimpseNavGrid({
  active,
  onSelect,
  ltvPercent,
  valuationEstimate,
  householdBuffer,
  dealsPossible,
  bestRatePercent,
  movingSearches,
  valuationSourceCount,
}: Props) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      <Card
        active={active === 'overview'}
        onClick={() => onSelect('overview')}
        iconBg="#14141c"
        iconColor="#fff"
        icon="🏠"
        title="House overview"
        value={ltvPercent !== null ? `${ltvPercent}% LTV` : '—'}
        caption={`${valuationEstimate ? formatGBP(valuationEstimate) : '—'} value${householdBuffer !== null ? ' · ' + formatGBP(householdBuffer) + ' buffer' : ''}`}
      />
      <Card
        active={active === 'deals'}
        onClick={() => onSelect('deals')}
        iconBg="#eaf0ff"
        iconColor="#2f5bff"
        icon="%"
        title="Mortgage deals"
        value={`${dealsPossible} possible`}
        caption={bestRatePercent !== null ? `Best: ${bestRatePercent}%` : 'No live rates yet'}
        tag={dealsPossible > 0 ? `${dealsPossible} watch-ready` : undefined}
      />
      <Card
        active={active === 'moving'}
        onClick={() => onSelect('moving')}
        iconBg="#fdf1e2"
        iconColor="#e08a2b"
        icon="📦"
        title="Moving home"
        value={`${movingSearches} searches`}
        caption="Saved searches & move costs"
      />
      <Card
        active={active === 'valuation'}
        onClick={() => onSelect('valuation')}
        iconBg="#e8f9ee"
        iconColor="#0f9d58"
        icon="📍"
        title="Valuation sources"
        value={valuationEstimate ? formatGBP(valuationEstimate) : '—'}
        caption={`${valuationSourceCount} source${valuationSourceCount === 1 ? '' : 's'}`}
        tag="Updated"
      />
      <Card
        active={active === 'overpayments'}
        onClick={() => onSelect('overpayments')}
        iconBg="#f2ecfd"
        iconColor="#7c3aed"
        icon="⚡"
        title="Overpayments"
        value="Explore"
        caption="See how overpaying could help"
        tag="New"
      />
    </div>
  );
}
