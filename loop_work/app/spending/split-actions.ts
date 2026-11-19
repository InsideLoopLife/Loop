"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { changeRecord, getActiveHouseholdContext, householdMemberDataOrFilter, householdWriteFields } from "@/lib/auth/household-context";
import { DEFAULT_SPLIT_SETTINGS, type SplitGroup, type SplitMember, type SplitMethod, type SplitSettings } from "@/lib/spending/split";

const METHODS: SplitMethod[] = ["equal_leftover", "equal", "income_share", "custom", "one_person"];
const MEMBER_KINDS: SplitMember["kind"][] = ["category_group", "category", "children", "mortgage", "line"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type SplitConfig = { groups: SplitGroup[]; settings: SplitSettings };

async function context() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in again to continue.");
  const household = await getActiveHouseholdContext(supabase, user);
  return { supabase, user, household, filter: householdMemberDataOrFilter(household) };
}

function toGroup(row: any): SplitGroup {
  return {
    id: row.id,
    name: row.name,
    method: METHODS.includes(row.method) ? row.method : "equal_leftover",
    customShares: row.custom_shares && typeof row.custom_shares === "object" ? row.custom_shares : {},
    payerPersonId: row.payer_person_id || null,
    members: Array.isArray(row.members) ? row.members : [],
    sortOrder: Number(row.sort_order || 0),
  };
}

/** Groups and settings visible to this person (their household's, or their own). */
export async function listSplitConfig(): Promise<SplitConfig> {
  const { supabase, filter } = await context();
  const [{ data: groups }, { data: settings }] = await Promise.all([
    supabase.from("household_split_groups").select("id, name, method, custom_shares, payer_person_id, members, sort_order").is("archived_at", null).or(filter).order("sort_order").order("created_at"),
    supabase.from("household_split_settings").select("savings_mode, low_earner_mode, owner_covers, updated_at").or(filter).order("updated_at", { ascending: false }).limit(1),
  ]);
  const s = settings?.[0] as any;
  return {
    groups: (groups || []).map(toGroup),
    settings: s ? { savingsMode: s.savings_mode === "first" ? "first" : "separate", lowEarnerMode: s.low_earner_mode === "top_up" ? "top_up" : "zero", ownerCovers: s.owner_covers === "group" ? "group" : "owner" } : DEFAULT_SPLIT_SETTINGS,
  };
}

export type SplitGroupInput = {
  id?: string | null;
  name: string;
  method: SplitMethod;
  customShares?: Record<string, number>;
  payerPersonId?: string | null;
  members: SplitMember[];
  sortOrder?: number;
};

function cleanMembers(members: unknown): SplitMember[] {
  if (!Array.isArray(members)) return [];
  const out: SplitMember[] = [];
  const seen = new Set<string>();
  for (const raw of members.slice(0, 300)) {
    const kind = (raw as any)?.kind;
    if (!MEMBER_KINDS.includes(kind)) continue;
    const ref = String((raw as any)?.ref ?? "").slice(0, 100);
    if ((kind === "category_group" || kind === "category") && !UUID.test(ref)) continue;
    if (kind === "line" && !/^(planned|child|mortgage|entry|pay):[0-9a-f-]{36}$/i.test(ref)) continue;
    const key = `${kind}:${ref}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ kind, ref, include: (raw as any)?.include !== false });
  }
  return out;
}

function revalidate() {
  revalidatePath("/spending");
  revalidatePath("/financial-flow");
}

export async function saveSplitGroup(input: SplitGroupInput): Promise<SplitConfig> {
  const { supabase, user, household, filter } = await context();
  const name = String(input.name || "").trim().slice(0, 60);
  if (!name) throw new Error("Give the group a name.");
  if (!METHODS.includes(input.method)) throw new Error("Choose how to split it.");
  const customShares: Record<string, number> = {};
  for (const [personId, value] of Object.entries(input.customShares || {})) {
    if (!UUID.test(personId)) continue;
    const n = Number(value);
    if (Number.isFinite(n) && n >= 0 && n <= 100) customShares[personId] = Math.round(n * 100) / 100;
  }
  const row = {
    name,
    method: input.method,
    custom_shares: customShares,
    payer_person_id: input.payerPersonId && UUID.test(input.payerPersonId) ? input.payerPersonId : null,
    members: cleanMembers(input.members),
    sort_order: Math.max(0, Math.min(999, Math.round(Number(input.sortOrder || 0)))),
    updated_at: new Date().toISOString(),
  };
  if (input.id) {
    if (!UUID.test(input.id)) throw new Error("That group isn't available.");
    const { data: existing } = await supabase.from("household_split_groups").select("id").eq("id", input.id).or(filter).maybeSingle();
    if (!existing) throw new Error("That group isn't available.");
    const { error } = await changeRecord(supabase.from("household_split_groups").update(row), input.id, household);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("household_split_groups").insert({ ...householdWriteFields(household, user.id), visibility_scope: household?.householdId ? "household" : "private", ...row });
    if (error) throw new Error(error.message);
  }
  revalidate();
  return listSplitConfig();
}

export async function archiveSplitGroup(id: string): Promise<SplitConfig> {
  const { supabase, household, filter } = await context();
  if (!UUID.test(id)) throw new Error("That group isn't available.");
  const { data: existing } = await supabase.from("household_split_groups").select("id").eq("id", id).or(filter).maybeSingle();
  if (!existing) throw new Error("That group isn't available.");
  const { error } = await changeRecord(supabase.from("household_split_groups").update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() }), id, household);
  if (error) throw new Error(error.message);
  revalidate();
  return listSplitConfig();
}

export async function saveSplitSettings(input: SplitSettings): Promise<SplitConfig> {
  const { supabase, user, household, filter } = await context();
  const row = {
    savings_mode: input.savingsMode === "first" ? "first" : "separate",
    low_earner_mode: input.lowEarnerMode === "top_up" ? "top_up" : "zero",
    owner_covers: input.ownerCovers === "group" ? "group" : "owner",
    updated_at: new Date().toISOString(),
  };
  const { data: existing } = await supabase.from("household_split_settings").select("id").or(filter).order("updated_at", { ascending: false }).limit(1);
  const id = (existing?.[0] as any)?.id;
  if (id) {
    const { error } = await changeRecord(supabase.from("household_split_settings").update(row), id, household);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("household_split_settings").insert({ ...householdWriteFields(household, user.id), visibility_scope: household?.householdId ? "household" : "private", ...row });
    if (error) throw new Error(error.message);
  }
  revalidate();
  return listSplitConfig();
}
