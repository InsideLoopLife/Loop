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

const PAYMENT_TABLES = ["planned_items", "pay_events", "child_costs", "spending_entries", "home_mortgage_deals"] as const;

/** Say which account a payment (or pay) goes through. */
async function setPaymentAccount__save(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in again to continue.");
  const household = await getActiveHouseholdContext(supabase, user);
  const table = String(formData.get("table") || "") as (typeof PAYMENT_TABLES)[number];
  const id = String(formData.get("id") || "");
  const accountId = String(formData.get("payment_account_id") || "");
  if (!PAYMENT_TABLES.includes(table) || !UUID.test(id)) throw new Error("That payment isn't available.");
  if (!UUID.test(accountId)) throw new Error("Choose an account.");
  const { data: account } = await supabase.from("financial_accounts").select("id").eq("id", accountId).or(visibleDataOrFilter(household)).maybeSingle();
  if (!account) throw new Error("That account isn't available.");
  const { data: existing } = await supabase.from(table).select("id").eq("id", id).maybeSingle();
  if (!existing) throw new Error("That payment isn't available.");
  const { error } = await changeRecord(supabase.from(table).update({ payment_account_id: accountId } as any), id, household);
  if (error) throw new Error(error.message);
  revalidate();
}

export async function setPaymentAccount(formData: FormData): Promise<void> {
  return runFriendly(() => setPaymentAccount__save(formData)) as unknown as Promise<void>;
}

export async function renameAccount(formData: FormData): Promise<void> {
  return runFriendly(() => renameAccount__save(formData)) as unknown as Promise<void>;
}

export async function changeAccountOwner(formData: FormData): Promise<void> {
  return runFriendly(() => changeAccountOwner__save(formData)) as unknown as Promise<void>;
}
