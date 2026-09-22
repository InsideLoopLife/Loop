// app/api/calendar/people/target/route.ts
//
// PATCH { person_id, daily_calorie_target } — lets any household member
// with edit rights set a per-person calorie target (new `people` column
// added in the migration; previously only the hardcoded 2200 default
// existed anywhere in the app).
//
// TODO: this only checks that the caller is an active member of the
// same household as the target person — it doesn't check
// canManagePeople/permission tiers the way app/household/actions.ts
// does for other people-table edits. Decide whether calorie targets
// should be self-edit-only or follow the same admin-gated pattern as
// the rest of the people table, and tighten this before shipping.

import { NextRequest, NextResponse } from 'next/server';
import { createServerDatabaseClient } from '@/platform/database/server-client';
import { getActiveHouseholdContext } from '@/domains/identity/household';

export async function PATCH(req: NextRequest) {
  const db = await createServerDatabaseClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const body = await req.json();
  const personId = String(body.person_id || '');
  const target = body.daily_calorie_target === null ? null : Number(body.daily_calorie_target);

  if (!personId) return NextResponse.json({ error: 'person_id required' }, { status: 400 });
  if (target !== null && (!Number.isFinite(target) || target <= 0)) {
    return NextResponse.json({ error: 'daily_calorie_target must be a positive number or null' }, { status: 400 });
  }

  const household = await getActiveHouseholdContext(db, user);

  const { data: person, error: personError } = await db
    .from('people')
    .select('id, user_id, household_id')
    .eq('id', personId)
    .single();

  if (personError || !person) return NextResponse.json({ error: 'person not found' }, { status: 404 });

  const sameHousehold = household.householdId && person.household_id === household.householdId;
  const isSelf = person.user_id === user.id;
  if (!sameHousehold && !isSelf) {
    return NextResponse.json({ error: 'not authorized for this person' }, { status: 403 });
  }

  const { error } = await db.from('people').update({ daily_calorie_target: target }).eq('id', personId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
