"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseNumber } from "@/lib/format/money";
import { calculateSavingsAccruedBalance } from "@/lib/wealth/savings-accrual";
import {
  applyMutableRecordFilter,
  getActiveHouseholdContext,
  householdWriteFields,
  visibleDataOrFilter,
} from "@/lib/auth/household-context";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  const householdContext = await getActiveHouseholdContext(supabase, user);
  return { supabase, user, householdContext };
}

function cleanSavingsFrequency(value: FormDataEntryValue | null, fallback: string) {
  const clean = String(value || "").trim().toLowerCase();
  return ["none", "daily", "monthly", "annually", "maturity"].includes(clean) ? clean : fallback;
}

function taxYearLabel(dateText?: string | null) {
  const d = dateText ? new Date(dateText) : new Date();
  const year = Number.isFinite(d.getTime()) && d.getMonth() >= 3 ? d.getFullYear() : Number.isFinite(d.getTime()) ? d.getFullYear() - 1 : new Date().getFullYear();
  return `${year}/${String(year + 1).slice(2)}`;
}

async function savingsCategoryId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
) {
  const { data: existing } = await supabase
    .from("spending_categories")
    .select("id")
    .eq("user_id", userId)
    .ilike("name", "Savings")
    .limit(1)
    .maybeSingle();
  if (existing?.id) return existing.id as string;
  const { data } = await supabase
    .from("spending_categories")
    .insert({
      user_id: userId,
      name: "Savings",
      type: "saving",
      category_icon: "💰",
      monthly_budget: null,
    })
    .select("id")
    .maybeSingle();
  return data?.id as string | undefined;
}

async function syncSavingsTopUpPlanner(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  accountId: string,
  householdContext: any,
  values: {
    provider?: string | null;
    product?: string | null;
    name?: string | null;
    monthlyTopUp?: number | null;
    topUpDay?: number | null;
    startDate?: string | null;
    endDate?: string | null;
    personId?: string | null;
    visibilityScope?: "private" | "household";
  },
) {
  const marker = `[linked_savings_account:${accountId}]`;
  await supabase
    .from("planned_items")
    .delete()
    .eq("user_id", userId)
    .ilike("notes", `%${marker}%`);

  const amount = Number(values.monthlyTopUp || 0);
  const day = Math.max(
    1,
    Math.min(28, Math.round(Number(values.topUpDay || 1))),
  );
  if (!Number.isFinite(amount) || amount <= 0) return;

  const categoryId = await savingsCategoryId(supabase, userId);
  const label =
    `Savings transfer: ${values.name || values.product || values.provider || "Savings account"}`.slice(
      0,
      140,
    );
  const startDate = values.startDate || new Date().toISOString().slice(0, 10);

  const visibilityScope =
    values.visibilityScope === "private" ? "private" : "household";
  const { error } = await supabase.from("planned_items").insert({
    ...householdWriteFields(householdContext, userId, visibilityScope),
    person_id: values.personId || null,
    category_id: categoryId || null,
    direction: "outgoing",
    item_type: "saving_investment",
    label,
    amount,
    recurrence: "monthly",
    start_date: startDate,
    end_date: values.endDate || null,
    end_behavior: values.endDate ? "drops_off" : "renews",
    renewal_notice_days: 30,
    day_of_month: day,
    payment_timing: "fixed_day",
    payment_adjustment: "previous_workday",
    brand_name: values.provider || "Savings",
    brand_domain: null,
    brand_logo_url: null,
    brand_logo_source: "savings_link",
    brand_logo_checked_at: new Date().toISOString(),
    notes: `${marker} Planned monthly transfer created from savings account top-up settings.`,
  } as any);
  if (error) console.warn("Savings planner sync failed", error.message);
}


async function autoSaveProviderRelationship(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  providerSlug?: string | null,
  providerName?: string | null,
  relationshipType = "savings_account",
) {
  const slug = String(providerSlug || "").trim();
  if (!slug) return;
  await supabase.from("user_financial_provider_relationships").upsert(
    {
      user_id: userId,
      provider_slug: slug,
      provider_name: String(providerName || slug),
      relationship_type: relationshipType,
      is_active: true,
      notes: "Auto-added from a tracked savings account so eligibility logic can use it.",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,provider_slug" },
  );
}


function signedSavingsMovementAmount(type: string, amount: number) {
  const clean = String(type || "").toLowerCase();
  if (["withdrawal", "fee", "transfer_out"].includes(clean)) return -Math.abs(amount);
  if (["deposit", "interest", "transfer_in", "opening_balance"].includes(clean)) return Math.abs(amount);
  return amount;
}

async function recalculateSavingsAccountFromLedger(
  supabase: Awaited<ReturnType<typeof createClient>>,
  accountId: string,
  householdContext: any,
) {
  const householdVisibleFilter = visibleDataOrFilter(householdContext);
  const [{ data: account }, { data: rows }] = await Promise.all([
    supabase
      .from("financial_accounts")
      .select("id,current_balance,opening_balance_assumption,balance_last_confirmed_value")
      .eq("id", accountId)
      .or(householdVisibleFilter)
      .maybeSingle(),
    supabase
      .from("savings_account_movements")
      .select("movement_type,amount,balance_delta,resulting_balance,effective_at,created_at")
      .eq("financial_account_id", accountId)
      .or(householdVisibleFilter)
      .order("effective_at", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);
  if (!account?.id) return;

  const movements = rows ?? [];
  const hasOpening = movements.some((row: any) => row.movement_type === "opening_balance");
  let balance = Math.max(
    0,
    Number(
      hasOpening
        ? 0
        : account.opening_balance_assumption ??
          account.balance_last_confirmed_value ??
          account.current_balance ??
          0,
    ),
  );

  for (const movement of movements as any[]) {
    const type = String(movement.movement_type || "").toLowerCase();
    if (["opening_balance", "balance_correction"].includes(type)) {
      balance = Math.max(0, Number(movement.resulting_balance ?? movement.amount ?? balance));
      continue;
    }
    const delta = movement.balance_delta != null
      ? Number(movement.balance_delta)
      : signedSavingsMovementAmount(type, Number(movement.amount || 0));
    balance = Math.max(0, balance + delta);
    if (movement.resulting_balance != null) balance = Math.max(0, Number(movement.resulting_balance));
  }

  const nowIso = new Date().toISOString();
  await applyMutableRecordFilter(
    supabase.from("financial_accounts").update({
      current_balance: balance,
      balance_last_confirmed_value: balance,
      balance_last_confirmed_at: nowIso,
      updated_at: nowIso,
    } as any),
    accountId,
    householdContext,
  );
}

export async function addFinancialAccount(formData: FormData) {
  const { supabase, user, householdContext } = await requireUser();

  const accountType = String(formData.get("account_type") || "savings");
  const isLiability = ["mortgage", "credit_card", "loan"].includes(accountType);

  const ownerPersonId = String(formData.get("owner_person_id") || "") || null;
  const ownershipScope = String(
    formData.get("ownership_scope") ||
      (ownerPersonId ? "personal" : "household"),
  );
  const visibilityScope =
    String(formData.get("visibility_scope") || "household") === "private"
      ? "private"
      : "household";
  const savingsLimitScope = String(
    formData.get("savings_limit_scope") ||
      (ownershipScope === "household"
        ? "household"
        : ownershipScope === "joint"
          ? "joint"
          : ownershipScope === "child"
            ? "child"
            : "individual"),
  );
  const currentBalance = parseNumber(formData.get("current_balance")) ?? 0;
  const nowIso = new Date().toISOString();

  const payload = {
    ...householdWriteFields(householdContext, user.id, visibilityScope),
    owner_person_id: ownerPersonId,
    ownership_scope: ownershipScope,
    savings_limit_scope: savingsLimitScope,
    name: String(formData.get("name") || "Savings account"),
    provider: String(formData.get("provider") || ""),
    provider_slug: String(formData.get("provider_slug") || "") || null,
    savings_product_name:
      String(formData.get("savings_product_name") || "") || null,
    savings_rate_deal_id:
      String(formData.get("savings_rate_deal_id") || "") || null,
    deal_duration_mode: String(formData.get("deal_duration_mode") || "ongoing"),
    account_type: accountType,
    current_balance: currentBalance,
    opening_balance_assumption:
      parseNumber(formData.get("opening_balance_assumption")) ??
      currentBalance,
    balance_last_confirmed_value: currentBalance,
    balance_last_confirmed_at: nowIso,
    interest_rate: parseNumber(formData.get("interest_rate")),
    interest_accrual_frequency: cleanSavingsFrequency(formData.get("interest_accrual_frequency"), "daily"),
    interest_compounding_frequency: cleanSavingsFrequency(formData.get("interest_compounding_frequency"), "monthly"),
    interest_rate_end_date:
      String(formData.get("interest_rate_end_date") || "") || null,
    top_up_day: parseNumber(formData.get("top_up_day")),
    monthly_top_up_amount: parseNumber(formData.get("monthly_top_up_amount")),
    savings_goal_name: String(formData.get("savings_goal_name") || "") || null,
    savings_goal_target_amount: parseNumber(formData.get("savings_goal_target_amount")),
    savings_goal_target_date: String(formData.get("savings_goal_target_date") || "") || null,
    savings_goal_monthly_contribution_override: parseNumber(formData.get("savings_goal_monthly_contribution_override")),
    savings_goal_priority: parseNumber(formData.get("savings_goal_priority")),
    savings_goal_status: String(formData.get("savings_goal_status") || "active"),
    start_date: String(formData.get("start_date") || "") || null,
    end_date: String(formData.get("end_date") || "") || null,
    is_liability: isLiability,
    manual_update: true,
  };

  const { data, error } = await supabase
    .from("financial_accounts")
    .insert(payload)
    .select("id")
    .single();

  if (error) throw new Error(error.message);
  if (!isLiability && data?.id) {
    const openingBalance = Math.max(0, Number(payload.opening_balance_assumption || currentBalance || 0));
    const openingDate = payload.start_date || new Date().toISOString().slice(0, 10);
    const { error: openingError } = await supabase.from("savings_account_movements").insert({
      ...householdWriteFields(householdContext, user.id, visibilityScope),
      financial_account_id: data.id,
      movement_type: "opening_balance",
      amount: openingBalance,
      previous_balance: 0,
      balance_delta: openingBalance,
      resulting_balance: openingBalance,
      effective_at: openingDate,
      note: "Opening balance",
      source_type: "account_setup",
      tax_year: taxYearLabel(openingDate),
      source_note: "Opening savings baseline created with the account.",
    } as any);
    if (openingError && !/duplicate/i.test(openingError.message || "")) throw new Error(openingError.message);

    await autoSaveProviderRelationship(
      supabase,
      user.id,
      payload.provider_slug,
      payload.provider,
      "savings_account",
    );
    await syncSavingsTopUpPlanner(
      supabase,
      user.id,
      data.id,
      householdContext,
      {
        provider: payload.provider,
        product: payload.savings_product_name,
        name: payload.name,
        monthlyTopUp: payload.monthly_top_up_amount,
        topUpDay: payload.top_up_day,
        startDate: payload.start_date,
        endDate: payload.end_date,
        personId: payload.owner_person_id,
        visibilityScope,
      },
    );
  }
  revalidatePath("/accounts");
  revalidatePath("/spending");
  revalidatePath("/financial-flow");
}

export async function updateFinancialAccount(formData: FormData) {
  const { supabase, user, householdContext } = await requireUser();
  const householdVisibleFilter = visibleDataOrFilter(householdContext);
  const id = String(formData.get("id"));

  const { data: existing } = await supabase
    .from("financial_accounts")
    .select(
      "id,name,provider,provider_slug,savings_product_name,start_date,end_date,is_liability,owner_person_id,visibility_scope,current_balance,opening_balance_assumption,balance_last_confirmed_value,balance_last_confirmed_at,interest_rate,interest_accrual_frequency,interest_compounding_frequency,updated_at,created_at",
    )
    .eq("id", id)
    .or(householdVisibleFilter)
    .maybeSingle();

  const ownerPersonId = String(formData.get("owner_person_id") || "") || null;
  const visibilityScope =
    String(
      formData.get("visibility_scope") ||
        existing?.visibility_scope ||
        "household",
    ) === "private"
      ? "private"
      : "household";

  const accrualBeforeUpdate = existing ? calculateSavingsAccruedBalance(existing as any) : null;
  const previousConfirmedBalance = Math.max(0, Number(existing?.balance_last_confirmed_value ?? existing?.current_balance ?? 0));
  const currentBalance = parseNumber(formData.get("current_balance")) ?? previousConfirmedBalance;
  const nowIso = new Date().toISOString();

  const updatePayload = {
    owner_person_id: ownerPersonId,
    ownership_scope: String(formData.get("ownership_scope") || "personal"),
    savings_limit_scope: String(
      formData.get("savings_limit_scope") || "individual",
    ),
    visibility_scope: visibilityScope,
    current_balance: currentBalance,
    balance_last_confirmed_value: currentBalance,
    balance_last_confirmed_at: nowIso,
    interest_rate: parseNumber(formData.get("interest_rate")),
    interest_accrual_frequency: cleanSavingsFrequency(formData.get("interest_accrual_frequency"), "daily"),
    interest_compounding_frequency: cleanSavingsFrequency(formData.get("interest_compounding_frequency"), "monthly"),
    interest_rate_end_date:
      String(formData.get("interest_rate_end_date") || "") || null,
    monthly_top_up_amount: parseNumber(formData.get("monthly_top_up_amount")),
    top_up_day: parseNumber(formData.get("top_up_day")),
    savings_goal_name: String(formData.get("savings_goal_name") || "") || null,
    savings_goal_target_amount: parseNumber(formData.get("savings_goal_target_amount")),
    savings_goal_target_date: String(formData.get("savings_goal_target_date") || "") || null,
    savings_goal_monthly_contribution_override: parseNumber(formData.get("savings_goal_monthly_contribution_override")),
    savings_goal_priority: parseNumber(formData.get("savings_goal_priority")),
    savings_goal_status: String(formData.get("savings_goal_status") || "active"),
    deal_duration_mode:
      String(formData.get("deal_duration_mode") || "") || undefined,
    updated_at: nowIso,
  };

  const { error } = await applyMutableRecordFilter(
    supabase.from("financial_accounts").update(updatePayload),
    id,
    householdContext,
  );

  if (error) throw new Error(error.message);
  if (!existing?.is_liability) {
    const balanceDelta = currentBalance - previousConfirmedBalance;
    if (Math.abs(balanceDelta) >= 0.01) {
      const effectiveAt = new Date().toISOString().slice(0, 10);
      const requestedReason = String(formData.get("balance_change_reason") || "auto").toLowerCase();
      const allowedReasons = new Set(["deposit", "withdrawal", "interest", "fee", "balance_correction"]);
      const estimatedAccruedInterest = Math.max(0, Number(accrualBeforeUpdate?.interestAccrued || 0));
      const looksLikeInterest = balanceDelta > 0 && estimatedAccruedInterest > 0 && Math.abs(balanceDelta - estimatedAccruedInterest) <= Math.max(1, estimatedAccruedInterest * 0.25);
      const inferredType = looksLikeInterest ? "interest" : "balance_correction";
      const movementType = allowedReasons.has(requestedReason) ? requestedReason : inferredType;
      const normalisedType = movementType === "deposit" && balanceDelta < 0
        ? "withdrawal"
        : movementType === "withdrawal" && balanceDelta > 0
          ? "deposit"
          : movementType === "interest" && balanceDelta < 0
            ? "balance_correction"
            : movementType === "fee" && balanceDelta > 0
              ? "balance_correction"
              : movementType;
      const { error: movementError } = await supabase.from("savings_account_movements").insert({
        ...householdWriteFields(householdContext, user.id, visibilityScope),
        financial_account_id: id,
        movement_type: normalisedType,
        amount: normalisedType === "balance_correction" ? currentBalance : Math.abs(balanceDelta),
        previous_balance: previousConfirmedBalance,
        balance_delta: balanceDelta,
        resulting_balance: currentBalance,
        effective_at: effectiveAt,
        note: normalisedType === "interest"
          ? "Confirmed interest payment inferred from the account balance update."
          : "Confirmed balance updated from the savings account editor.",
        source_type: "account_editor",
        tax_year: taxYearLabel(effectiveAt),
        source_note: `Balance change logged as ${normalisedType} so charts preserve the dated movement.`,
      } as any);
      if (movementError) throw new Error(movementError.message);
    }

    await autoSaveProviderRelationship(
      supabase,
      user.id,
      (existing as any)?.provider_slug,
      existing?.provider,
      "savings_account",
    );
    await syncSavingsTopUpPlanner(supabase, user.id, id, householdContext, {
      provider: existing?.provider,
      product: existing?.savings_product_name,
      name: existing?.name,
      monthlyTopUp: parseNumber(formData.get("monthly_top_up_amount")),
      topUpDay: parseNumber(formData.get("top_up_day")),
      startDate: existing?.start_date || null,
      endDate: String(formData.get("interest_rate_end_date") || "") || null,
      personId: ownerPersonId || existing?.owner_person_id || null,
      visibilityScope,
    });
  }
  revalidatePath("/accounts");
  revalidatePath("/spending");
  revalidatePath("/financial-flow");
}

export async function assignSavingsAccountOwner(formData: FormData) {
  const { supabase, user, householdContext } = await requireUser();
  const householdVisibleFilter = visibleDataOrFilter(householdContext);
  const id = String(formData.get("id") || "");
  const ownerPersonId = String(formData.get("owner_person_id") || "") || null;
  const ownershipScope = String(formData.get("ownership_scope") || (ownerPersonId ? "personal" : "household"));
  const savingsLimitScope = String(formData.get("savings_limit_scope") || (ownershipScope === "household" ? "household" : ownershipScope === "joint" ? "joint" : ownershipScope === "child" ? "child" : "individual"));
  const visibilityScope = String(formData.get("visibility_scope") || "household") === "private" ? "private" : "household";

  const { data: existing } = await supabase
    .from("financial_accounts")
    .select("id,name,provider,savings_product_name,start_date,end_date,is_liability,monthly_top_up_amount,top_up_day")
    .eq("id", id)
    .or(householdVisibleFilter)
    .maybeSingle();

  if (!existing?.id) throw new Error("Savings account not found or not editable.");

  const { error } = await applyMutableRecordFilter(
    supabase.from("financial_accounts").update({
      owner_person_id: ownerPersonId,
      ownership_scope: ownershipScope,
      savings_limit_scope: savingsLimitScope,
      visibility_scope: visibilityScope,
      updated_at: new Date().toISOString(),
    } as any),
    id,
    householdContext,
  );

  if (error) throw new Error(error.message);

  if (!existing.is_liability) {
    await syncSavingsTopUpPlanner(supabase, user.id, id, householdContext, {
      provider: existing.provider,
      product: existing.savings_product_name,
      name: existing.name,
      monthlyTopUp: parseNumber((existing as any).monthly_top_up_amount),
      topUpDay: parseNumber((existing as any).top_up_day),
      startDate: existing.start_date || null,
      endDate: existing.end_date || null,
      personId: ownerPersonId,
      visibilityScope,
    });
  }

  revalidatePath("/accounts");
  revalidatePath("/spending");
}

export async function deleteFinancialAccount(formData: FormData) {
  const { supabase, user, householdContext } = await requireUser();
  const id = String(formData.get("id"));

  const { error } = await applyMutableRecordFilter(
    supabase.from("financial_accounts").delete(),
    id,
    householdContext,
  );

  if (error) throw new Error(error.message);
  await supabase
    .from("planned_items")
    .delete()
    .eq("user_id", user.id)
    .ilike("notes", `%[linked_savings_account:${id}]%`);
  revalidatePath("/accounts");
  revalidatePath("/spending");
}


export async function addSavingsAccountMovement(formData: FormData) {
  const { supabase, user, householdContext } = await requireUser();
  const householdVisibleFilter = visibleDataOrFilter(householdContext);
  const accountId = String(formData.get("financial_account_id") || "");
  const requestedMovementType = String(formData.get("movement_type") || "deposit").trim().toLowerCase();
  const allowedMovementTypes = new Set([
    "deposit",
    "withdrawal",
    "interest",
    "fee",
    "balance_correction",
    "transfer_in",
    "transfer_out",
    "manual_adjustment",
  ]);
  const movementType = allowedMovementTypes.has(requestedMovementType)
    ? requestedMovementType
    : "deposit";
  const amountRaw = parseNumber(formData.get("amount")) ?? 0;
  const note = String(formData.get("note") || "").trim() || null;
  const effectiveAt = String(formData.get("effective_at") || "").trim() || new Date().toISOString().slice(0, 10);
  if (!accountId) throw new Error("Savings account missing.");

  const { data: account, error: accountError } = await supabase
    .from("financial_accounts")
    .select("id,current_balance,interest_rate,interest_accrual_frequency,interest_compounding_frequency,balance_last_confirmed_value,balance_last_confirmed_at,updated_at,created_at,start_date,end_date,visibility_scope")
    .eq("id", accountId)
    .or(householdVisibleFilter)
    .maybeSingle();

  if (accountError) throw new Error(accountError.message);
  if (!account?.id) throw new Error("Savings account not found.");

  const previousConfirmedBalance = Math.max(0, Number(account.balance_last_confirmed_value ?? account.current_balance ?? 0));
  const signedAmount = signedSavingsMovementAmount(movementType, amountRaw);
  const resultingBalance = movementType === "balance_correction"
    ? Math.max(0, amountRaw)
    : Math.max(0, previousConfirmedBalance + signedAmount);
  const balanceDelta = resultingBalance - previousConfirmedBalance;
  const nowIso = new Date().toISOString();

  const { error: updateError } = await applyMutableRecordFilter(
    supabase.from("financial_accounts").update({
      current_balance: resultingBalance,
      balance_last_confirmed_value: resultingBalance,
      balance_last_confirmed_at: nowIso,
      updated_at: nowIso,
    } as any),
    accountId,
    householdContext,
  );
  if (updateError) throw new Error(updateError.message);

  const { error: movementError } = await supabase.from("savings_account_movements").insert({
    ...householdWriteFields(
      householdContext,
      user.id,
      account.visibility_scope === "private" ? "private" : "household",
    ),
    financial_account_id: accountId,
    movement_type: movementType,
    amount: movementType === "balance_correction" ? resultingBalance : Math.abs(amountRaw),
    previous_balance: previousConfirmedBalance,
    balance_delta: balanceDelta,
    resulting_balance: resultingBalance,
    effective_at: effectiveAt,
    note,
    source_type: "manual",
    tax_year: taxYearLabel(effectiveAt),
    source_note: "Manual savings movement logged by user.",
  } as any);

  if (movementError) throw new Error(movementError.message);
  revalidatePath("/accounts");
  revalidatePath("/spending");
  revalidatePath("/financial-flow");
}

export async function deleteSavingsAccountMovement(formData: FormData) {
  const { supabase, householdContext } = await requireUser();
  const id = String(formData.get("id") || "");
  if (!id) return;
  const householdVisibleFilter = visibleDataOrFilter(householdContext);
  const { data: movement } = await supabase
    .from("savings_account_movements")
    .select("id,financial_account_id,movement_type")
    .eq("id", id)
    .or(householdVisibleFilter)
    .maybeSingle();
  if (movement?.movement_type === "opening_balance") {
    throw new Error("The opening balance anchors this account history and cannot be removed. Use a balance correction instead.");
  }
  const { error } = await applyMutableRecordFilter(
    supabase.from("savings_account_movements").delete(),
    id,
    householdContext,
  );
  if (error) throw new Error(error.message);
  if (movement?.financial_account_id) {
    await recalculateSavingsAccountFromLedger(supabase, movement.financial_account_id, householdContext);
  }
  revalidatePath("/accounts");
  revalidatePath("/financial-flow");
}

export async function snapshotToday() {
  const { supabase, user, householdContext } = await requireUser();
  const householdVisibleFilter = visibleDataOrFilter(householdContext);
  const today = new Date().toISOString().slice(0, 10);

  const { data: accounts, error: accountsError } = await supabase
    .from("financial_accounts")
    .select("id, current_balance, interest_rate, interest_accrual_frequency, interest_compounding_frequency, balance_last_confirmed_value, balance_last_confirmed_at, updated_at, created_at, start_date, end_date, visibility_scope")
    .or(householdVisibleFilter);

  if (accountsError) throw new Error(accountsError.message);

  const payload = (accounts ?? []).map((account) => ({
    ...householdWriteFields(
      householdContext,
      user.id,
      account.visibility_scope === "private" ? "private" : "household",
    ),
    account_id: account.id,
    snapshot_date: today,
    balance: calculateSavingsAccruedBalance(account as any).estimatedBalance,
    source: "estimated_accrual",
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

export async function saveFinancialProviderRelationship(formData: FormData) {
  const { supabase, user } = await requireUser();
  const providerSlug = String(formData.get("provider_slug") || "").trim();
  const providerName = String(formData.get("provider_name") || "").trim();
  const relationshipType = String(
    formData.get("relationship_type") || "existing_customer",
  ).trim();

  if (!providerSlug) return;

  if (relationshipType === "remove") {
    const { error } = await supabase
      .from("user_financial_provider_relationships")
      .delete()
      .eq("user_id", user.id)
      .eq("provider_slug", providerSlug);
    if (error) throw new Error(error.message);
    revalidatePath("/accounts");
    revalidatePath("/account");
    return;
  }

  const { error } = await supabase
    .from("user_financial_provider_relationships")
    .upsert(
      {
        user_id: user.id,
        provider_slug: providerSlug,
        provider_name: providerName || providerSlug,
        relationship_type: relationshipType || "existing_customer",
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,provider_slug" },
    );

  if (error) throw new Error(error.message);
  revalidatePath("/accounts");
  revalidatePath("/account");
}



export async function savePensionPerformanceAssumption(formData: FormData) {
  const { supabase, user } = await requireUser();
  const pensionFundId = String(formData.get("pension_fund_id") || "");
  if (!pensionFundId) throw new Error("Choose a pension fund.");
  const five = parseNumber(formData.get("annualised_5y_percent"));
  const ten = parseNumber(formData.get("annualised_10y_percent"));
  if (five == null && ten == null) throw new Error("Enter a 5-year or 10-year annualised performance figure.");
  const { data: fund, error: fundError } = await supabase
    .from("pension_funds")
    .select("id,user_id,pension_account_id,fund_name,current_value,units,unit_price")
    .eq("id", pensionFundId)
    .maybeSingle();
  if (fundError) throw new Error(fundError.message);
  if (!fund || fund.user_id !== user.id) throw new Error("Pension fund not found for this account.");
  const values = [five, ten].filter((value): value is number => value != null && Number.isFinite(value));
  const low = Math.min(...values);
  const high = Math.max(...values);
  const middle = values.reduce((sum, value) => sum + value, 0) / values.length;
  const currentValue = Number(fund.current_value || 0) > 0 ? Number(fund.current_value) : Number(fund.units || 0) * Number(fund.unit_price || 0);
  const asOfDate = String(formData.get("as_of_date") || new Date().toISOString().slice(0, 10));
  const { error } = await supabase.from("pension_fund_performance_assumptions").upsert({
    user_id: user.id,
    pension_account_id: fund.pension_account_id,
    pension_fund_id: fund.id,
    fund_name: fund.fund_name,
    current_value: currentValue,
    annualised_5y_percent: five,
    annualised_10y_percent: ten,
    low_percent: low,
    middle_percent: middle,
    high_percent: high,
    as_of_date: asOfDate,
    source_name: String(formData.get("source_name") || "Official provider fund factsheet"),
    source_url: String(formData.get("source_url") || "") || null,
    source_kind: "official_provider_factsheet",
    verified_at: new Date().toISOString(),
    metadata: { entered_via: "projection_evidence_form" },
    updated_at: new Date().toISOString(),
  } as any, { onConflict: "user_id,pension_fund_id,as_of_date" });
  if (error) throw new Error(error.message);
  revalidatePath("/accounts");
}

function inferSavingsGoalType(name: string, requested?: string | null) {
  const explicit = String(requested || "").toLowerCase();
  if (["holiday", "emergency", "house", "car", "education", "christmas", "repairs", "other"].includes(explicit)) return explicit;
  const text = name.toLowerCase();
  if (/holiday|travel|trip|flight|cruise/.test(text)) return "holiday";
  if (/emergency|rainy|buffer/.test(text)) return "emergency";
  if (/house|home|deposit|mortgage/.test(text)) return "house";
  if (/car|vehicle|motor/.test(text)) return "car";
  if (/school|education|university|college|course/.test(text)) return "education";
  if (/christmas|gift|birthday/.test(text)) return "christmas";
  if (/repair|maintenance|renovation|improvement/.test(text)) return "repairs";
  return "other";
}

async function uploadSavingsPotImage(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, file: FormDataEntryValue | null) {
  if (!(file instanceof File) || file.size <= 0) return null;
  if (!file.type.startsWith("image/")) throw new Error("The pot reference file must be an image.");
  if (file.size > 8 * 1024 * 1024) throw new Error("The pot reference image must be smaller than 8MB.");
  const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${userId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from("savings-pot-images").upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: false });
  if (error) throw new Error(error.message);
  return supabase.storage.from("savings-pot-images").getPublicUrl(path).data.publicUrl;
}

export async function createSavingsPot(formData: FormData) {
  const { supabase, user, householdContext } = await requireUser();
  const name = String(formData.get("name") || "").trim();
  if (!name) throw new Error("Give the savings pot a name.");

  const visibilityScope = String(formData.get("visibility_scope") || "household") === "private"
    ? "private"
    : householdContext.householdId
      ? "household"
      : "private";
  const personId = String(formData.get("person_id") || "") || null;
  const targetAmount = Math.max(0, Number(parseNumber(formData.get("target_amount")) || 0));
  const targetDate = String(formData.get("target_date") || "") || null;
  const requestedMonthlyTarget = Math.max(0, Number(parseNumber(formData.get("monthly_target")) || 0));
  const monthsRemaining = targetDate
    ? Math.max(1, (new Date(`${targetDate}T12:00:00`).getFullYear() - new Date().getFullYear()) * 12 + new Date(`${targetDate}T12:00:00`).getMonth() - new Date().getMonth())
    : 0;
  const monthlyTarget = requestedMonthlyTarget > 0 ? requestedMonthlyTarget : monthsRemaining > 0 && targetAmount > 0 ? targetAmount / monthsRemaining : 0;
  const accountId = String(formData.get("financial_account_id") || "") || null;
  const allocationAmount = parseNumber(formData.get("allocation_amount"));
  const allocationPercent = parseNumber(formData.get("allocation_percent"));
  const uploadUrl = await uploadSavingsPotImage(supabase, user.id, formData.get("reference_image_file"));
  const referenceImageUrl = uploadUrl || String(formData.get("reference_image_url") || "").trim() || null;
  const goalType = inferSavingsGoalType(name, String(formData.get("goal_type") || ""));
  const priorityImportant = String(formData.get("priority_is_important") || "false") === "true";
  const priorityScore = Math.max(1, Math.min(100, Number(parseNumber(formData.get("priority_score")) || 50)));

  const fullPayload = {
    user_id: user.id,
    household_id: householdContext.householdId,
    person_id: personId,
    name,
    target_amount: targetAmount,
    target_date: targetDate,
    monthly_target: monthlyTarget,
    current_allocated_amount: 0,
    priority: parseNumber(formData.get("priority")) ?? (priorityImportant ? 101 - priorityScore : 80),
    priority_is_important: priorityImportant,
    priority_score: priorityScore,
    goal_type: goalType,
    colour: String(formData.get("colour") || "") || null,
    icon: String(formData.get("icon") || "🎯") || "🎯",
    status: "active",
    visibility_scope: visibilityScope,
    notes: String(formData.get("notes") || "") || null,
    reference_image_url: referenceImageUrl,
  } as any;
  let result = await supabase.from("savings_pots").insert(fullPayload).select("id").single();
  if (result.error && /schema cache|reference_image_url|goal_type|priority_score|priority_is_important|person_id/i.test(result.error.message || "")) {
    // Keep pot creation working on databases that have not yet run the visual-pot migration.
    // The migration remains required to retain image, goal type and priority metadata.
    const corePayload = {
      user_id: user.id,
      household_id: householdContext.householdId,
      name,
      target_amount: targetAmount,
      target_date: targetDate,
      monthly_target: monthlyTarget,
      current_allocated_amount: 0,
      priority: fullPayload.priority,
      colour: fullPayload.colour,
      icon: fullPayload.icon,
      status: "active",
      visibility_scope: visibilityScope,
      notes: fullPayload.notes,
    } as any;
    result = await supabase.from("savings_pots").insert(corePayload).select("id").single();
  }
  const pot = result.data;
  if (result.error) throw new Error(result.error.message);

  if (pot?.id && accountId && ((allocationAmount ?? 0) > 0 || (allocationPercent ?? 0) > 0)) {
    const { error: allocationError } = await supabase.from("savings_pot_allocations").insert({
      user_id: user.id,
      household_id: householdContext.householdId,
      savings_pot_id: pot.id,
      financial_account_id: accountId,
      allocation_type: "account_balance",
      amount: Math.max(0, Number(allocationAmount || 0)),
      allocation_percent: allocationPercent != null ? Math.max(0, Math.min(100, allocationPercent)) : null,
      effective_from: new Date().toISOString().slice(0, 10),
      notes: "Initial account allocation created with the pot.",
    } as any);
    if (allocationError) throw new Error(allocationError.message);
  }

  revalidatePath("/accounts");
  revalidatePath("/financial-flow");
}

export async function addSavingsPotMovement(formData: FormData) {
  const { supabase, user, householdContext } = await requireUser();
  const potId = String(formData.get("savings_pot_id") || "");
  const amount = Math.max(0, Number(parseNumber(formData.get("amount")) || 0));
  const movementType = String(formData.get("movement_type") || "allocation");
  if (!potId || amount <= 0) throw new Error("Choose a pot and enter an amount.");
  if (!["allocation", "deallocation", "correction"].includes(movementType)) throw new Error("Unknown pot movement type.");
  const signedAmount = movementType === "deallocation" ? -amount : amount;
  const { error } = await supabase.from("savings_pot_movements").insert({
    user_id: user.id,
    household_id: householdContext.householdId,
    savings_pot_id: potId,
    amount: signedAmount,
    movement_type: movementType,
    effective_at: String(formData.get("effective_at") || new Date().toISOString().slice(0, 10)),
    note: String(formData.get("note") || "") || null,
    visibility_scope: householdContext.householdId ? "household" : "private",
  } as any);
  if (error) throw new Error(error.message);
  revalidatePath("/accounts");
  revalidatePath("/financial-flow");
}

export async function addSavingsPotAllocation(formData: FormData) {
  const { supabase, user, householdContext } = await requireUser();
  const potId = String(formData.get("savings_pot_id") || "");
  const accountId = String(formData.get("financial_account_id") || "") || null;
  const amount = Math.max(0, Number(parseNumber(formData.get("amount")) || 0));
  const percentValue = parseNumber(formData.get("allocation_percent"));
  const allocationPercent = percentValue != null ? Math.max(0, Math.min(100, percentValue)) : null;
  if (!potId) throw new Error("Savings pot missing.");
  if (!accountId && amount <= 0) throw new Error("Choose an account or add a manual amount.");
  if (accountId && amount <= 0 && !(allocationPercent && allocationPercent > 0)) {
    throw new Error("Enter an amount or percentage to allocate.");
  }

  const { data: pot } = await supabase
    .from("savings_pots")
    .select("id")
    .eq("id", potId)
    .or(visibleDataOrFilter(householdContext))
    .maybeSingle();
  if (!pot?.id) throw new Error("Savings pot not found.");

  const { error } = await supabase.from("savings_pot_allocations").insert({
    user_id: user.id,
    household_id: householdContext.householdId,
    savings_pot_id: potId,
    financial_account_id: accountId,
    allocation_type: accountId ? "account_balance" : "manual",
    amount,
    allocation_percent: allocationPercent,
    effective_from: new Date().toISOString().slice(0, 10),
    notes: String(formData.get("notes") || "") || null,
  } as any);
  if (error) throw new Error(error.message);
  revalidatePath("/accounts");
}

export async function deleteSavingsPotAllocation(formData: FormData) {
  const { supabase, user, householdContext } = await requireUser();
  const id = String(formData.get("id") || "");
  if (!id) return;
  let query = supabase.from("savings_pot_allocations").delete().eq("id", id);
  if (householdContext.householdId) {
    query = query.or(`user_id.eq.${user.id},household_id.eq.${householdContext.householdId}`);
  } else {
    query = query.eq("user_id", user.id);
  }
  const { error } = await query;
  if (error) throw new Error(error.message);
  revalidatePath("/accounts");
}

export async function deleteSavingsPot(formData: FormData) {
  const { supabase, householdContext } = await requireUser();
  const id = String(formData.get("id") || "");
  if (!id) return;
  const { error } = await applyMutableRecordFilter(
    supabase.from("savings_pots").delete(),
    id,
    householdContext,
  );
  if (error) throw new Error(error.message);
  revalidatePath("/accounts");
}

export async function saveSavingsDealEligibility(formData: FormData) {
  const { supabase, user } = await requireUser();
  const dealId = String(formData.get("savings_rate_deal_id") || "");
  const status = String(formData.get("eligibility_status") || "unknown");
  if (!dealId) throw new Error("Savings deal missing.");
  if (!["unknown", "eligible", "not_eligible"].includes(status)) throw new Error("Unknown eligibility status.");
  const { error } = await supabase.from("user_savings_deal_eligibility").upsert({
    user_id: user.id,
    savings_rate_deal_id: dealId,
    eligibility_status: status,
    used_before: formData.get("used_before") === "true",
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,savings_rate_deal_id" });
  if (error) throw new Error(error.message);
  revalidatePath("/accounts");
}
