"use server";

import { revalidatePath } from "next/cache";
import { runFriendly } from "@/lib/actions/friendly";
import { createClient } from "@/lib/supabase/server";
import { changeRecord, getActiveHouseholdContext, householdMemberDataOrFilter, householdWriteFields } from "@/lib/auth/household-context";
import type { TransferFrequency } from "@/lib/accounts/standing-transfers";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FREQUENCIES: TransferFrequency[] = ["weekly", "fortnightly", "four_weekly", "monthly"];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

async function context() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Sign in again to continue.");
  const household = await getActiveHouseholdContext(supabase, user);
  return { supabase, user, household, filter: householdMemberDataOrFilter(household) };
}

function revalidate() {
  revalidatePath("/accounts");
  revalidatePath("/spending");
  revalidatePath("/financial-flow");
}

async function saveAccountTransfer__save(formData: FormData) {
  const { supabase, user, household, filter } = await context();
  const id = String(formData.get("id") || "").trim();
  const personId = String(formData.get("person_id") || "").trim();
  const toAccountId = String(formData.get("to_account_id") || "").trim();
  const fromAccountId = String(formData.get("from_account_id") || "").trim();
  const frequency = String(formData.get("frequency") || "weekly") as TransferFrequency;
  const amount = Math.round(Number(formData.get("amount") || 0) * 100) / 100;
  const weekday = Math.round(Number(formData.get("weekday") || 0));
  const dayOfMonth = Math.round(Number(formData.get("day_of_month") || 0));
  const startDate = String(formData.get("start_date") || "").trim() || new Date().toISOString().slice(0, 10);
  const endDate = String(formData.get("end_date") || "").trim();
  const note = String(formData.get("note") || "").trim().slice(0, 140);

  if (!UUID.test(personId)) throw new Error("Choose who makes the transfer.");
  if (!UUID.test(toAccountId)) throw new Error("Choose the account the money goes into.");
  if (fromAccountId && !UUID.test(fromAccountId)) throw new Error("Choose the account the money comes from.");
  if (fromAccountId && fromAccountId === toAccountId) throw new Error("The money has to move between two different accounts.");
  if (!FREQUENCIES.includes(frequency)) throw new Error("Choose how often it happens.");
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) throw new Error("Enter how much moves each time.");
  if (frequency === "monthly" ? dayOfMonth < 1 || dayOfMonth > 31 : weekday < 1 || weekday > 7) throw new Error(frequency === "monthly" ? "Choose the day of the month." : "Choose the day of the week.");
  if (!DATE.test(startDate) || (endDate && !DATE.test(endDate))) throw new Error("Check the dates.");
  if (endDate && endDate < startDate) throw new Error("The end date is before the start date.");

  // Accounts and person must be ones this household can already see.
  const accountIds = [toAccountId, fromAccountId].filter(Boolean);
  const [{ data: accounts }, { data: person }] = await Promise.all([
    supabase.from("financial_accounts").select("id").in("id", accountIds),
    supabase.from("people").select("id").eq("id", personId).maybeSingle(),
  ]);
  if ((accounts || []).length !== accountIds.length) throw new Error("That account isn't available.");
  if (!person) throw new Error("That person isn't in your household.");

  const row = {
    person_id: personId,
    to_account_id: toAccountId,
    from_account_id: fromAccountId || null,
    amount,
    frequency,
    weekday: frequency === "monthly" ? null : weekday,
    day_of_month: frequency === "monthly" ? dayOfMonth : null,
    start_date: startDate,
    end_date: endDate || null,
    note: note || null,
    updated_at: new Date().toISOString(),
  };

  if (id) {
    if (!UUID.test(id)) throw new Error("That transfer isn't available.");
    const { data: existing } = await supabase.from("household_account_transfers").select("id").eq("id", id).or(filter).maybeSingle();
    if (!existing) throw new Error("That transfer isn't available.");
    const { error } = await changeRecord(supabase.from("household_account_transfers").update(row), id, household);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("household_account_transfers").insert({
      ...householdWriteFields(household, user.id),
      visibility_scope: household?.householdId ? "household" : "private",
      ...row,
    });
    if (error) throw new Error(error.message);
  }
  revalidate();
}

async function removeAccountTransfer__save(formData: FormData) {
  const { supabase, household, filter } = await context();
  const id = String(formData.get("id") || "").trim();
  if (!UUID.test(id)) throw new Error("That transfer isn't available.");
  const { data: existing } = await supabase.from("household_account_transfers").select("id").eq("id", id).or(filter).maybeSingle();
  if (!existing) throw new Error("That transfer isn't available.");
  const now = new Date().toISOString();
  const { error } = await changeRecord(supabase.from("household_account_transfers").update({ archived_at: now, updated_at: now }), id, household);
  if (error) throw new Error(error.message);
  revalidate();
}

/** Change only how much moves each time (used by Split's "Set to £X"). */
async function setAccountTransferAmount__save(id: string, amount: number) {
  const { supabase, household, filter } = await context();
  const rounded = Math.round(Number(amount) * 100) / 100;
  if (!UUID.test(id)) throw new Error("That transfer isn't available.");
  if (!Number.isFinite(rounded) || rounded <= 0 || rounded > 1_000_000) throw new Error("Enter how much moves each time.");
  const { data: existing } = await supabase.from("household_account_transfers").select("id").eq("id", id).is("archived_at", null).or(filter).maybeSingle();
  if (!existing) throw new Error("That transfer isn't available.");
  const { error } = await changeRecord(supabase.from("household_account_transfers").update({ amount: rounded, updated_at: new Date().toISOString() }), id, household);
  if (error) throw new Error(error.message);
  revalidate();
}

export async function setAccountTransferAmount(id: string, amount: number): Promise<void> {
  return runFriendly(() => setAccountTransferAmount__save(id, amount)) as unknown as Promise<void>;
}

export async function saveAccountTransfer(formData: FormData): Promise<void> {
  return runFriendly(() => saveAccountTransfer__save(formData)) as unknown as Promise<void>;
}

export async function removeAccountTransfer(formData: FormData): Promise<void> {
  return runFriendly(() => removeAccountTransfer__save(formData)) as unknown as Promise<void>;
}
