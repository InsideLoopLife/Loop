// components/calendar/FilterBar.tsx
'use client';

import { FILTERABLE_TYPES, type CalendarEventType, type HouseholdPerson } from '@/lib/calendar/types';

interface FilterBarProps {
  activeTypes: Set<CalendarEventType>;
  onToggleType: (type: CalendarEventType) => void;
  people: HouseholdPerson[];
  activePersonId: string | 'all';
  onSelectPerson: (personId: string | 'all') => void;
}

export function FilterBar({ activeTypes, onToggleType, people, activePersonId, onSelectPerson }: FilterBarProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {FILTERABLE_TYPES.map(({ key, label }) => {
          const active = activeTypes.has(key);
          return (
            <button
              key={key}
              type="button"
              onClick={() => onToggleType(key)}
              aria-pressed={active}
              className={[
                'rounded-full border px-3 py-1 text-sm transition-colors',
                active ? 'border-transparent bg-slate-900 text-white' : 'border-slate-300 bg-transparent text-slate-600 hover:bg-slate-100',
              ].join(' ')}
            >
              {label}
            </button>
          );
        })}
      </div>

      {people.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onSelectPerson('all')}
            className={[
              'rounded-full border px-3 py-1 text-xs',
              activePersonId === 'all' ? 'border-transparent bg-indigo-600 text-white' : 'border-slate-300 text-slate-600',
            ].join(' ')}
          >
            Whole household
          </button>
          {people.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelectPerson(p.id)}
              className={[
                'rounded-full border px-3 py-1 text-xs',
                activePersonId === p.id ? 'border-transparent bg-indigo-600 text-white' : 'border-slate-300 text-slate-600',
              ].join(' ')}
            >
              {p.displayName ?? 'Unnamed'}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
