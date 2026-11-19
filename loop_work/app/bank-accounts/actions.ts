"use server";

import { revalidatePath } from "next/cache";
import { runFriendly, isLoopError } from "@/lib/actions/friendly";
import { createClient } from "@/lib/supabase/server";
import { changeRecord, getActiveHouseholdContext, visibleDataOrFilter } from "@/lib/auth/household-context";
import { assignSavingsAccountOwner, setFinancialAccountSharing } from "@/app/accounts/actions";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function revalidate() {
  revalidatePath("/bank-accounts");
  revalidatePath("/accounts");
  revalidatePath("/spending");
  revalidatePath("/financial-flow");
}

/** Name and bank only — nothing that changes a calculation. */
async function renameAccount__save(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in again to continue.");
  const household = await getActiveHouseholdContext(supabase, user);
  const id = String(formData.get("id") || "");
  const name = String(formData.get("name") || "").trim().slice(0, 80);
  const provider = String(formData.get("provider") || "").trim().slice(0, 80);
  if (!UUID.test(id)) throw new Error("That account isn't available.");
  if (!name) throw new Error("Give the account a name.");
  const { data: existing } = await supabase.from("financial_accounts").select("id").eq("id", id).or(visibleDataOrFilter(household)).maybeSingle();
  if (!existing) throw new Error("That account isn't available.");
  const { error } = await changeRecord(supabase.from("financial_accounts").update({ name, provider, updated_at: new Date().toISOString() } as any), id, household);
  if (error) throw new Error(error.message);
  revalidate();
}

/**
 * Who the account belongs to (joint, or one person) and, for a personal account, whether the
 * household can see it. Reuses the Accounts actions so savings top-ups and history follow.
 */
async function changeAccountOwner__save(formData: FormData) {
  const id = String(formData.get("id") || "");
  const owner = String(formData.get("owner") || "joint");
  const shared = String(formData.get("visibility_scope") || "household") !== "private";
  if (!UUID.test(id)) throw new Error("That account isn't available.");
  if (owner !== "joint" && !UUID.test(owner)) throw new Error("Choose who owns it.");

  const ownership = new FormData();
  ownership.set("id", id);
  ownership.set("owner_person_id", owner === "joint" ? "" : owner);
  ownership.set("ownership_scope", owner === "joint" ? "joint" : "personal");
  ownership.set("visibility_scope", owner === "joint" || shared ? "household" : "private");
  const first = await assignSavingsAccountOwner(ownership);
  if (isLoopError(first)) throw new Error(first.__loopError);

  // Make the account's own history follow its new visibility (only possible inside a household).
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const household = user ? await getActiveHouseholdContext(supabase, user) : null;
  if (!household?.householdId) { revalidate(); return; }
  const sharing = new FormData();
  sharing.set("id", id);
  sharing.set("visibility_scope", owner === "joint" || shared ? "household" : "private");
  const second = await setFinancialAccountSharing(sharing);
  if (isLoopError(second)) throw new Error(second.__loopError);
  revalidate();
}

/**
 * Track these accounts' balances from a start day (normally the next payday): the balance Loop
 * already holds is the opening balance at the start of that day, and pay, bills and transfers move it
 * on from there. Nothing else about the account changes.
 */
async function trackFromPayday__save(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in again to continue.");
  const household = await getActiveHouseholdContext(supabase, user);
  const ids = formData.getAll("account_id").map(String);
  const dates = formData.getAll("tracked_from").map(String);
  if (!ids.length || ids.length !== dates.length || ids.length > 30) throw new Error("Choose the accounts to track.");
  for (let i = 0; i < ids.length; i += 1) {
    if (!UUID.test(ids[i]) || !/^\d{4}-\d{2}-\d{2}$/.test(dates[i])) throw new Error("Something's wrong with those dates.");
  }
  const { data: visible } = await supabase.from("financial_accounts").select("id").in("id", ids).or(visibleDataOrFilter(household));
  if ((visible || []).length !== new Set(ids).size) throw new Error("One of those accounts isn't available.");
  for (let i = 0; i < ids.length; i += 1) {
    const { error } = await changeRecord(supabase.from("financial_accounts").update({ balance_tracked_from: dates[i], updated_at: new Date().toISOString() } as any), ids[i], household);
    if (error) throw new Error(error.message);
  }
  revalidate();
}

export async function trackFromPayday(formData: FormData): Promise<void> {
  return runFriendly(() => trackFromPayday__save(formData)) as unknown as Promise<void>;
}

export async function renameAccount(formData: FormData): Promise<void> {
  return runFriendly(() => renameAccount__save(formData)) as unknown as Promise<void>;
}

export async function changeAccountOwner(formData: FormData): Promise<void> {
  return runFriendly(() => changeAccountOwner__save(formData)) as unknown as Promise<void>;
}
