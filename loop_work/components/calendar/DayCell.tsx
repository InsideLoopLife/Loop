// components/calendar/DayCell.tsx
'use client';

import type { CalendarEvent, CalorieProgressMetadata } from '@/lib/calendar/types';

interface DayCellProps {
  date: Date;
  events: CalendarEvent[];
  isCurrentMonth: boolean;
}

const RING_RADIUS = 9;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export function DayCell({ date, events, isCurrentMonth }: DayCellProps) {
  const payments = events.filter((e) => e.event_type === 'payment_due');
  const income = events.filter((e) => e.event_type === 'income_expected');
  const calorieEvents = events.filter((e) => e.event_type === 'calorie_progress'); // one per person on multi-person view
  const synced = events.filter((e) => e.event_type === 'manual');

  return (
    <div
      className={[
        'flex min-h-[84px] flex-col gap-1 rounded-lg border border-slate-200 p-2',
        isCurrentMonth ? 'bg-white' : 'bg-slate-50 text-slate-400',
      ].join(' ')}
    >
      <div className="flex items-start justify-between">
        <span className="text-sm font-medium">{date.getDate()}</span>
        <div className="flex -space-x-1">
          {calorieEvents.slice(0, 3).map((e) => (
            <CalorieRing key={e.id} meta={e.metadata as unknown as CalorieProgressMetadata} />
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-1">
        {payments.map((p) => (
          <span key={p.id} title={`${p.title} — £${p.amount?.toFixed(2)} due`} className="inline-block h-2 w-2 rounded-full bg-rose-500" />
        ))}
        {income.map((i) => (
          <span key={i.id} title={`${i.title} — £${i.amount?.toFixed(2)} expected`} className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
        ))}
        {synced.map((s) => (
          <span key={s.id} title={s.title} className="inline-block h-2 w-2 rounded-full bg-slate-400" />
        ))}
      </div>

      {(payments.length > 0 || income.length > 0) && (
        <div className="mt-auto truncate text-[11px] text-slate-500">
          {payments[0]?.title ?? income[0]?.title}
          {payments.length + income.length > 1 && ` +${payments.length + income.length - 1}`}
        </div>
      )}
    </div>
  );
}

function CalorieRing({ meta }: { meta: CalorieProgressMetadata }) {
  const pct = Math.max(0, Math.min(100, meta.pct));
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-label={`Calories: ${meta.consumed} of ${meta.target}${meta.isDefaultTarget ? ' (default target)' : ''}`}>
      <circle cx="12" cy="12" r={RING_RADIUS} fill="none" stroke="#e2e8f0" strokeWidth="3" />
      <circle
        cx="12"
        cy="12"
        r={RING_RADIUS}
        fill="none"
        stroke={meta.pct > 100 ? '#dc2626' : '#16a34a'}
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray={RING_CIRCUMFERENCE}
        strokeDashoffset={RING_CIRCUMFERENCE - (pct / 100) * RING_CIRCUMFERENCE}
        transform="rotate(-90 12 12)"
      />
    </svg>
  );
}

