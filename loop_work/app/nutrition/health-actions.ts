"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { newIngestToken } from "@/lib/health/tokens";
import { appBaseUrl } from "@/lib/app-url";

async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in again to continue.");
  return { supabase, user };
}

async function ownPerson(supabase: any, userId: string, personId: string) {
  const { data } = await supabase.from("people").select("id, name, household_id, user_id").eq("id", personId).maybeSingle();
  if (!data) throw new Error("Couldn't find that person.");
  if (data.user_id !== userId) throw new Error("Only the person who added them can change these details.");
  return data as { id: string; name: string; household_id: string | null; user_id: string };
}

const ACTIVITY = new Set(["sedentary", "light", "moderate", "active", "very_active"]);
const GOALS = new Set(["maintain", "lose", "gain", "eat_better"]);
const DIETS = new Set(["omnivore", "pescatarian", "vegetarian", "vegan", "other"]);

export type PersonHealthSnapshot = {
  person: { id: string; name: string; birth_date: string | null; nutrition_reference_sex: string | null; weight_kg: number | null; height_cm: number | null; activity_level: string | null; nutrition_goal: string | null; diet_type: string | null; food_allergies: string[]; caffeine_limit_mg: number | null; canEdit: boolean };
  weights: Array<{ id: string; measured_on: string; weight_kg: number; source: string }>;
  links: Array<{ id: string; label: string; token_hint: string; created_at: string; last_used_at: string | null; last_summary: any; revoked_at: string | null }>;
  lastWeek: Record<string, { avg: number; days: number }>;
  workoutsLastWeek: number;
  importUrl: string;
};

/** Everything the health details panel shows for one person. */
export async function getPersonHealth(personId: string): Promise<PersonHealthSnapshot> {
  const { supabase, user } = await requireUser();
  const { data: person } = await supabase
    .from("people")
    .select("id, name, user_id, birth_date, nutrition_reference_sex, weight_kg, height_cm, activity_level, nutrition_goal, diet_type, food_allergies, caffeine_limit_mg")
    .eq("id", personId)
    .maybeSingle();
  if (!person) throw new Error("Couldn't find that person.");
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  const [weights, links, metrics, workouts] = await Promise.all([
    supabase.from("person_weight_logs").select("id, measured_on, weight_kg, source").eq("person_id", personId).order("measured_on", { ascending: false }).limit(30),
    supabase.from("health_ingest_links").select("id, label, token_hint, created_at, last_used_at, last_summary, revoked_at").eq("person_id", personId).order("created_at", { ascending: false }),
    supabase.from("health_daily_metrics").select("metric, value, metric_date").eq("person_id", personId).gte("metric_date", since),
    supabase.from("health_workouts").select("id", { count: "exact", head: true }).eq("person_id", personId).gte("started_at", `${since}T00:00:00Z`),
  ]);
  const lastWeek: PersonHealthSnapshot["lastWeek"] = {};
  for (const row of (metrics.data || []) as any[]) {
    const current = lastWeek[row.metric] || { avg: 0, days: 0 };
    current.avg = (current.avg * current.days + Number(row.value)) / (current.days + 1);
    current.days += 1;
    lastWeek[row.metric] = current;
  }
  return {
    person: { ...(person as any), food_allergies: (person as any).food_allergies || [], canEdit: (person as any).user_id === user.id },
    weights: (weights.data || []) as any,
    links: (links.data || []) as any,
    lastWeek,
    workoutsLastWeek: workouts.count || 0,
    importUrl: `${appBaseUrl()}/api/health/ingest`,
  };
}

export async function savePersonHealthDetails(input: {
  personId: string;
  birthDate?: string | null;
  referenceSex?: "male" | "female" | null;
  heightCm?: number | null;
  activityLevel?: string | null;
  goal?: string | null;
  dietType?: string | null;
  allergies?: string[];
  caffeineLimitMg?: number | null;
}) {
  const { supabase, user } = await requireUser();
  await ownPerson(supabase, user.id, input.personId);
  const update: Record<string, unknown> = {
    nutrition_reference_sex: input.referenceSex === "male" || input.referenceSex === "female" ? input.referenceSex : null,
    height_cm: input.heightCm && input.heightCm > 30 && input.heightCm < 260 ? Math.round(input.heightCm * 10) / 10 : null,
    activity_level: input.activityLevel && ACTIVITY.has(input.activityLevel) ? input.activityLevel : null,
    nutrition_goal: input.goal && GOALS.has(input.goal) ? input.goal : null,
    diet_type: input.dietType && DIETS.has(input.dietType) ? input.dietType : null,
    food_allergies: Array.from(new Set((input.allergies || []).map((item) => String(item).trim().toLowerCase()).filter(Boolean))).slice(0, 20),
    caffeine_limit_mg: input.caffeineLimitMg != null && input.caffeineLimitMg >= 0 && input.caffeineLimitMg <= 1000 ? Math.round(input.caffeineLimitMg) : null,
    updated_at: new Date().toISOString(),
  };
  if (input.birthDate && /^\d{4}-\d{2}-\d{2}$/.test(input.birthDate)) update.birth_date = input.birthDate;
  const { error } = await supabase.from("people").update(update).eq("id", input.personId).eq("user_id", user.id);
  if (error) throw new Error(error.message);
  revalidatePath("/nutrition");
  revalidatePath("/calendar");
  return { ok: true };
}

async function syncCurrentWeight(supabase: any, personId: string, userId: string) {
  const { data } = await supabase.from("person_weight_logs").select("weight_kg").eq("person_id", personId).order("measured_on", { ascending: false }).order("created_at", { ascending: false }).limit(1).maybeSingle();
  await supabase.from("people").update({ weight_kg: data?.weight_kg ?? null }).eq("id", personId).eq("user_id", userId);
}

export async function logWeight(input: { personId: string; date: string; weightKg: number }) {
  const { supabase, user } = await requireUser();
  const person = await ownPerson(supabase, user.id, input.personId);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error("Pick a date.");
  if (!(input.weightKg > 2 && input.weightKg < 400)) throw new Error("Enter a weight in kg.");
  const { error } = await supabase.from("person_weight_logs").upsert({
    user_id: user.id,
    household_id: person.household_id,
    person_id: person.id,
    measured_on: input.date,
    weight_kg: Math.round(input.weightKg * 10) / 10,
    source: "manual",
  }, { onConflict: "person_id,measured_on,source" });
  if (error) throw new Error(error.message);
  await syncCurrentWeight(supabase, person.id, user.id);
  revalidatePath("/nutrition");
  return { ok: true };
}

export async function deleteWeight(input: { id: string; personId: string }) {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("person_weight_logs").delete().eq("id", input.id).eq("user_id", user.id);
  if (error) throw new Error(error.message);
  await syncCurrentWeight(supabase, input.personId, user.id);
  revalidatePath("/nutrition");
  return { ok: true };
}

/** Creates a private import link for one person's phone. The key is returned once and never shown again. */
export async function createHealthLink(input: { personId: string; label?: string }) {
  const { supabase, user } = await requireUser();
  const person = await ownPerson(supabase, user.id, input.personId);
  const { token, hash, hint } = newIngestToken();
  const { error } = await supabase.from("health_ingest_links").insert({
    user_id: user.id,
    person_id: person.id,
    label: String(input.label || "iPhone").trim().slice(0, 60) || "iPhone",
    token_hash: hash,
    token_hint: hint,
  });
  if (error) throw new Error(error.message);
  return { token, url: `${appBaseUrl()}/api/health/ingest` };
}

export async function revokeHealthLink(id: string) {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("health_ingest_links").update({ revoked_at: new Date().toISOString() }).eq("id", id).eq("user_id", user.id);
  if (error) throw new Error(error.message);
  return { ok: true };
}

/** Removes everything imported from a phone for this person (manual weights are kept). */
export async function deleteImportedHealthData(personId: string) {
  const { supabase, user } = await requireUser();
  await ownPerson(supabase, user.id, personId);
  const results = await Promise.all([
    supabase.from("health_daily_metrics").delete().eq("person_id", personId).eq("user_id", user.id),
    supabase.from("health_workouts").delete().eq("person_id", personId).eq("user_id", user.id),
    supabase.from("person_weight_logs").delete().eq("person_id", personId).eq("user_id", user.id).neq("source", "manual"),
  ]);
  const failed = results.find((result) => result.error);
  if (failed?.error) throw new Error(failed.error.message);
  await syncCurrentWeight(supabase, personId, user.id);
  revalidatePath("/nutrition");
  return { ok: true };
}
