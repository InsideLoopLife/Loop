// app/api/household/members/route.ts
//
// New route — checked the repo directly, there was no existing endpoint or
// client hook for "list this household's people" (app/spending/page.tsx and
// others query the `people` table server-side inline, per-page, rather than
// through a shared route). This gives ScopeBadge something real to call.

import { NextResponse } from "next/server";
import { createServerDatabaseClient } from "@/platform/database/server-client";
import { getActiveHouseholdContext, householdPeopleOrFilter } from "@/domains/identity/household";
import { dedupeHouseholdPeople } from "@/domains/identity/household";

export async function GET() {
  const supabase = await createServerDatabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const householdContext = await getActiveHouseholdContext(supabase, user);
  const householdPeopleFilter = householdPeopleOrFilter(householdContext);

  const { data: people, error } = await supabase
    .from("people")
    .select("id, user_id, name, relationship, birth_date, avatar_url, linked_user_id, email, account_status, active_until")
    .or(householdPeopleFilter)
    .or("account_status.is.null,account_status.neq.duplicate_merged")
    .order("relationship")
    .order("name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const deduped = dedupeHouseholdPeople(people ?? [], householdContext.dataOwnerUserId);

  return NextResponse.json({
    householdId: householdContext.householdId,
    members: deduped.map((p) => ({ id: p.id, displayName: p.name, relationship: p.relationship })),
  });
}
