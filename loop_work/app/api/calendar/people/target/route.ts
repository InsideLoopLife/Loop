// app/api/calendar/people/target/route.ts
//
// PATCH { person_id, daily_calorie_target } — sets a per-person calorie target (new `people` column
// added in the migration; previously only the hardcoded 2200 default
// existed anywhere in the app).
//
// You can set your own target. Setting someone else's needs the same
// "manage people" permission as other edits to household people (owners,
// admins, or members given that permission).

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
    .select('id, user_id, household_id, relationship')
    .eq('id', personId)
    .single();

  if (personError || !person) return NextResponse.json({ error: 'person not found' }, { status: 404 });

  const sameHousehold = Boolean(household.householdId && person.household_id === household.householdId);
  const { data: selfPerson } = await db.from('people').select('id').eq('id', personId).eq('linked_user_id', user.id).maybeSingle();
  const isSelf = Boolean(selfPerson) || (person.user_id === user.id && (person.relationship === 'self' || !person.household_id));
  if (!isSelf && !(sameHousehold && household.canManagePeople)) {
    return NextResponse.json({ error: 'not authorized for this person' }, { status: 403 });
  }

  const { error } = await db.from('people').update({ daily_calorie_target: target }).eq('id', personId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
