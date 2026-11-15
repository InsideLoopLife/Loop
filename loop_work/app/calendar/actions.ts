"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveHouseholdContext } from "@/lib/auth/household-context";

/** Adds your own event (school play, dentist, party) to the household calendar. */
export async function addCalendarEvent(input: { date: string; title: string; personId?: string | null; shared?: boolean }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in again to add events.");
  const title = String(input.title || "").trim().slice(0, 140);
  if (!title) throw new Error("Give the event a name.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error("Pick a valid date.");
  const household = await getActiveHouseholdContext(supabase, user);
  const shared = input.shared !== false && Boolean(household.householdId);
  const { error } = await supabase.from("calendar_events").insert({
    user_id: user.id,
    household_id: shared ? household.householdId : null,
    visibility_scope: shared ? "household" : "private",
    person_id: input.personId || null,
    source: "loop_manual",
    event_type: "manual",
    external_id: `manual:${crypto.randomUUID()}`,
    title,
    event_date: input.date,
    metadata: {},
  });
  if (error) throw new Error(error.message);
  revalidatePath("/calendar");
  return { ok: true };
}

export async function deleteCalendarEvent(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in again.");
  const { error } = await supabase.from("calendar_events").delete().eq("id", id).eq("user_id", user.id).eq("source", "loop_manual");
  if (error) throw new Error(error.message);
  revalidatePath("/calendar");
  return { ok: true };
}
