"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseNumber } from "@/lib/format/money";
import { applyMutableRecordFilter, applyVisibleDataFilter, getActiveHouseholdContext, householdWriteFields } from "@/lib/auth/household-context";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  const householdContext = await getActiveHouseholdContext(supabase, user);
  return { supabase, user, householdContext };
}

export async function addFinancialAccount(formData: FormData) {
  const { supabase, user, householdContext } = await requireUser();

  const accountType = String(formData.get("account_type") || "other");
  const isLiability = ["mortgage", "credit_card", "loan"].includes(accountType);

  const { error } = await supabase.from("financial_accounts").insert({
    ...householdWriteFields(householdContext, user.id),
    name: String(formData.get("name") || "Account"),
    provider: String(formData.get("provider") || ""),
    account_type: accountType,
    current_balance: parseNumber(formData.get("current_balance")) ?? 0,
    is_liability: isLiability,
    manual_update: true,
  });

  if (error) throw new Error(error.message);
  revalidatePath("/accounts");
}

export async function updateFinancialAccount(formData: FormData) {
  const { supabase, householdContext } = await requireUser();
  const id = String(formData.get("id"));

  const { error } = await applyMutableRecordFilter(
    supabase
      .from("financial_accounts")
      .update({
        current_balance: parseNumber(formData.get("current_balance")) ?? 0,
        updated_at: new Date().toISOString(),
      }),
    id,
    householdContext
  );

  if (error) throw new Error(error.message);
  revalidatePath("/accounts");
}

export async function deleteFinancialAccount(formData: FormData) {
  const { supabase, householdContext } = await requireUser();
  const id = String(formData.get("id"));

  const { error } = await applyMutableRecordFilter(supabase.from("financial_accounts").delete(), id, householdContext);

  if (error) throw new Error(error.message);
  revalidatePath("/accounts");
}

export async function snapshotToday() {
  const { supabase, user, householdContext } = await requireUser();
  const today = new Date().toISOString().slice(0, 10);

  const accountsQuery = supabase.from("financial_accounts").select("id, current_balance");
  const { data: accounts, error: accountsError } = await applyVisibleDataFilter(accountsQuery, householdContext);

  if (accountsError) throw new Error(accountsError.message);

  const payload = (accounts ?? []).map((account) => ({
    ...householdWriteFields(householdContext, user.id),
    account_id: account.id,
    snapshot_date: today,
    balance: Number(account.current_balance ?? 0),
    source: "manual",
  }));

  if (payload.length > 0) {
    const { error } = await supabase
      .from("account_balance_snapshots")
      .upsert(payload, { onConflict: "account_id,snapshot_date" });

    if (error) throw new Error(error.message);
  }

  revalidatePath("/accounts");
  revalidatePath("/dashboard");
}
