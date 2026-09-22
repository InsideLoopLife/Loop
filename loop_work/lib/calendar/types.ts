// lib/calendar/types.ts

export type CalendarEventSource =
  | 'google'
  | 'loop_payment'
  | 'loop_income'
  | 'loop_calorie'
  | 'loop_manual';

export type CalendarEventType =
  | 'payment_due'
  | 'income_expected'
  | 'calorie_progress'
  | 'manual';

export interface CalendarEvent {
  id: string;
  user_id: string;
  household_id: string | null;
  visibility_scope: 'private' | 'household';
  person_id: string | null;
  source: CalendarEventSource;
  external_id: string | null;
  event_type: CalendarEventType;
  title: string;
  event_date: string; // 'YYYY-MM-DD'
  amount: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CalorieProgressMetadata {
  consumed: number;
  target: number;
  pct: number;
  isDefaultTarget: boolean; // true when falling back to the 2200 default
}

export const FILTERABLE_TYPES: { key: CalendarEventType; label: string }[] = [
  { key: 'payment_due', label: 'Payments' },
  { key: 'income_expected', label: 'Income' },
  { key: 'calorie_progress', label: 'Calories' },
  { key: 'manual', label: 'Synced events' },
];

// Matches app/api/household/members/route.ts's actual response shape:
// { householdId, members: [{ id, displayName, relationship }] }
export interface HouseholdPerson {
  id: string;
  displayName: string | null;
  relationship: string | null;
}
