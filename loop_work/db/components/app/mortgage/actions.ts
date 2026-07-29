"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseNumber } from "@/lib/format/money";
import { applyMutableRecordFilter, getActiveHouseholdContext, householdWriteFields, visibleDataOrFilter } from "@/lib/auth/household-context";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  const householdContext = await getActiveHouseholdContext(supabase, user);
  return { supabase, user, householdContext };
}

export async function addHome(formData: FormData) {
  const { supabase, user, householdContext } = await requireUser();

  const { data: home, error } = await supabase
    .from("homes")
    .insert({
      ...householdWriteFields(householdContext, user.id),
      label: String(formData.get("label") || "Home"),
      address_line: String(formData.get("address_line") || "") || null,
      postcode: String(formData.get("postcode") || "") || null,
      house_number: String(formData.get("house_number") || "") || null,
      uprn: String(formData.get("uprn") || "") || null,
      property_type: String(formData.get("property_type") || "") || null,
      lookup_source: String(formData.get("lookup_source") || "") || null,
      purchase_source_url: String(formData.get("purchase_source_url") || "") || null,
      full_address: String(formData.get("full_address") || "") || null,
      city: String(formData.get("city") || "") || null,
      region: String(formData.get("region") || "") || null,
      country: String(formData.get("country") || "United Kingdom") || "United Kingdom",
      latitude: parseNumber(formData.get("latitude")),
      longitude: parseNumber(formData.get("longitude")),
      map_url: String(formData.get("map_url") || "") || null,
      ownership_status: String(formData.get("ownership_status") || "current_home"),
      property_value: parseNumber(formData.get("property_value")) ?? 0,
      estimated_value_low: parseNumber(formData.get("estimated_value_low")),
      estimated_value_mid: parseNumber(formData.get("estimated_value_mid")),
      estimated_value_high: parseNumber(formData.get("estimated_value_high")),
      estimated_value_date: String(formData.get("estimated_value_date") || "") || null,
      purchase_price: parseNumber(formData.get("purchase_price")),
      purchase_date: String(formData.get("purchase_date") || "") || null,
      last_lookup_at: String(formData.get("last_lookup_at") || "") || null,
      target_purchase_price: parseNumber(formData.get("target_purchase_price")),
      target_extra_cash: parseNumber(formData.get("target_extra_cash")),
      target_interest_rate: parseNumber(formData.get("target_interest_rate")),
      target_term_years: parseNumber(formData.get("target_term_years")),
      notes: String(formData.get("notes") || ""),
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  const ownerIds = formData.getAll("owner_ids").map(String).filter(Boolean);
  if (home?.id && ownerIds.length > 0) {
    const rows = ownerIds.map((personId) => ({
      ...householdWriteFields(householdContext, user.id),
      home_id: home.id,
      person_id: personId,
      ownership_percent: ownerIds.length ? 100 / ownerIds.length : 100,
    }));
    const { error: ownerError } = await supabase.from("home_owners").insert(rows);
    if (ownerError) throw new Error(ownerError.message);
  }

  revalidatePath("/mortgage");
  revalidatePath("/affordability");
  revalidatePath("/dashboard");
}

export async function updateHome(formData: FormData) {
  const { supabase, user, householdContext } = await requireUser();
  const id = String(formData.get("id") || "");
  if (!id) throw new Error("Missing home id");

  const { error } = await supabase
    .from("homes")
    .update({
      label: String(formData.get("label") || "Home"),
      address_line: String(formData.get("address_line") || "") || null,
      postcode: String(formData.get("postcode") || "") || null,
      house_number: String(formData.get("house_number") || "") || null,
      uprn: String(formData.get("uprn") || "") || null,
      property_type: String(formData.get("property_type") || "") || null,
      lookup_source: String(formData.get("lookup_source") || "") || null,
      purchase_source_url: String(formData.get("purchase_source_url") || "") || null,
      full_address: String(formData.get("full_address") || "") || null,
      city: String(formData.get("city") || "") || null,
      region: String(formData.get("region") || "") || null,
      country: String(formData.get("country") || "United Kingdom") || "United Kingdom",
      latitude: parseNumber(formData.get("latitude")),
      longitude: parseNumber(formData.get("longitude")),
      map_url: String(formData.get("map_url") || "") || null,
      ownership_status: String(formData.get("ownership_status") || "current_home"),
      property_value: parseNumber(formData.get("property_value")) ?? 0,
      estimated_value_low: parseNumber(formData.get("estimated_value_low")),
      estimated_value_mid: parseNumber(formData.get("estimated_value_mid")),
      estimated_value_high: parseNumber(formData.get("estimated_value_high")),
      estimated_value_date: String(formData.get("estimated_value_date") || "") || null,
      purchase_price: parseNumber(formData.get("purchase_price")),
      purchase_date: String(formData.get("purchase_date") || "") || null,
      last_lookup_at: String(formData.get("last_lookup_at") || "") || null,
      target_purchase_price: parseNumber(formData.get("target_purchase_price")),
      target_extra_cash: parseNumber(formData.get("target_extra_cash")),
      target_interest_rate: parseNumber(formData.get("target_interest_rate")),
      target_term_years: parseNumber(formData.get("target_term_years")),
      notes: String(formData.get("notes") || ""),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .or(visibleDataOrFilter(householdContext));

  if (error) throw new Error(error.message);

  const ownerIds = formData.getAll("owner_ids").map(String).filter(Boolean);
  await supabase.from("home_owners").delete().eq("home_id", id).or(visibleDataOrFilter(householdContext));
  if (ownerIds.length > 0) {
    const rows = ownerIds.map((personId) => ({
      ...householdWriteFields(householdContext, user.id),
      home_id: id,
      person_id: personId,
      ownership_percent: ownerIds.length ? 100 / ownerIds.length : 100,
    }));
    const { error: ownerError } = await supabase.from("home_owners").insert(rows);
    if (ownerError) throw new Error(ownerError.message);
  }

  revalidatePath("/mortgage");
  revalidatePath("/affordability");
  revalidatePath("/dashboard");
}

export async function deleteHome(formData: FormData) {
  const { supabase, householdContext } = await requireUser();
  const id = String(formData.get("id") || "");
  if (!id) throw new Error("Missing home id");

  const { error } = await applyMutableRecordFilter(supabase.from("homes").delete(), id, householdContext);
  if (error) throw new Error(error.message);

  revalidatePath("/mortgage");
  revalidatePath("/affordability");
  revalidatePath("/dashboard");
}

export async function addHomeMortgageDeal(formData: FormData) {
  const { supabase, user, householdContext } = await requireUser();

  const { error } = await supabase.from("home_mortgage_deals").insert({
    ...householdWriteFields(householdContext, user.id),
    home_id: String(formData.get("home_id") || "") || null,
    lender: String(formData.get("lender") || "") || null,
    product_name: String(formData.get("product_name") || "") || null,
    balance: parseNumber(formData.get("balance")) ?? 0,
    balance_as_of_date: String(formData.get("balance_as_of_date") || "") || String(formData.get("start_date") || "") || new Date().toISOString().slice(0, 10),
    interest_rate: parseNumber(formData.get("interest_rate")) ?? 0,
    rate_type: String(formData.get("rate_type") || "fixed"),
    repayment_type: String(formData.get("repayment_type") || "repayment"),
    initial_period_end: String(formData.get("initial_period_end") || "") || null,
    term_years: parseNumber(formData.get("term_years")) ?? 25,
    monthly_payment_override: parseNumber(formData.get("monthly_payment_override")),
    start_date: String(formData.get("start_date") || "") || new Date().toISOString().slice(0, 10),
    end_date: String(formData.get("end_date") || "") || null,
    notes: String(formData.get("notes") || ""),
  });

  if (error) throw new Error(error.message);

  revalidatePath("/mortgage");
  revalidatePath("/affordability");
  revalidatePath("/dashboard");
}

export async function deleteHomeMortgageDeal(formData: FormData) {
  const { supabase, householdContext } = await requireUser();
  const id = String(formData.get("id") || "");
  if (!id) throw new Error("Missing mortgage deal id");

  const { error } = await applyMutableRecordFilter(supabase.from("home_mortgage_deals").delete(), id, householdContext);
  if (error) throw new Error(error.message);

  revalidatePath("/mortgage");
  revalidatePath("/affordability");
  revalidatePath("/dashboard");
}


export async function updateHomeMortgageDeal(formData: FormData) {
  const { supabase, householdContext } = await requireUser();
  const id = String(formData.get("id") || "");
  if (!id) throw new Error("Missing mortgage deal id");

  const { error } = await supabase
    .from("home_mortgage_deals")
    .update({
      home_id: String(formData.get("home_id") || "") || null,
      lender: String(formData.get("lender") || "") || null,
      product_name: String(formData.get("product_name") || "") || null,
      balance: parseNumber(formData.get("balance")) ?? 0,
      balance_as_of_date: String(formData.get("balance_as_of_date") || "") || String(formData.get("start_date") || "") || new Date().toISOString().slice(0, 10),
      interest_rate: parseNumber(formData.get("interest_rate")) ?? 0,
      rate_type: String(formData.get("rate_type") || "fixed"),
      repayment_type: String(formData.get("repayment_type") || "repayment"),
      initial_period_end: String(formData.get("initial_period_end") || "") || null,
      term_years: parseNumber(formData.get("term_years")) ?? 25,
      monthly_payment_override: parseNumber(formData.get("monthly_payment_override")),
      start_date: String(formData.get("start_date") || "") || new Date().toISOString().slice(0, 10),
      end_date: String(formData.get("end_date") || "") || null,
      notes: String(formData.get("notes") || ""),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .or(visibleDataOrFilter(householdContext));

  if (error) throw new Error(error.message);

  revalidatePath("/mortgage");
  revalidatePath("/affordability");
  revalidatePath("/dashboard");
}

export async function addHomeValuationSource(formData: FormData) {
  const { supabase, user, householdContext } = await requireUser();

  const { error } = await supabase.from("home_valuation_sources").insert({
    ...householdWriteFields(householdContext, user.id),
    home_id: String(formData.get("home_id") || ""),
    source_name: String(formData.get("source_name") || "Valuation source"),
    source_type: String(formData.get("source_type") || "user_estimate"),
    valuation_low: parseNumber(formData.get("valuation_low")),
    valuation_mid: parseNumber(formData.get("valuation_mid")) ?? parseNumber(formData.get("valuation_amount")) ?? 0,
    valuation_high: parseNumber(formData.get("valuation_high")),
    valuation_amount: parseNumber(formData.get("valuation_amount")),
    confidence: String(formData.get("confidence") || "medium"),
    valuation_date: String(formData.get("valuation_date") || "") || new Date().toISOString().slice(0, 10),
    source_url: String(formData.get("source_url") || "") || null,
    notes: String(formData.get("notes") || ""),
  });

  if (error) throw new Error(error.message);
  revalidatePath("/mortgage");
  revalidatePath("/affordability");
  revalidatePath("/dashboard");
}

export async function updateHomeValuationSource(formData: FormData) {
  const { supabase, householdContext } = await requireUser();
  const id = String(formData.get("id") || "");
  if (!id) throw new Error("Missing valuation id");

  const { error } = await supabase
    .from("home_valuation_sources")
    .update({
      source_name: String(formData.get("source_name") || "Valuation source"),
      source_type: String(formData.get("source_type") || "user_estimate"),
      valuation_low: parseNumber(formData.get("valuation_low")),
      valuation_mid: parseNumber(formData.get("valuation_mid")) ?? parseNumber(formData.get("valuation_amount")) ?? 0,
      valuation_high: parseNumber(formData.get("valuation_high")),
      valuation_amount: parseNumber(formData.get("valuation_amount")),
      confidence: String(formData.get("confidence") || "medium"),
      valuation_date: String(formData.get("valuation_date") || "") || null,
      source_url: String(formData.get("source_url") || "") || null,
      notes: String(formData.get("notes") || ""),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .or(visibleDataOrFilter(householdContext));

  if (error) throw new Error(error.message);
  revalidatePath("/mortgage");
  revalidatePath("/affordability");
  revalidatePath("/dashboard");
}

export async function deleteHomeValuationSource(formData: FormData) {
  const { supabase, householdContext } = await requireUser();
  const id = String(formData.get("id") || "");
  if (!id) throw new Error("Missing valuation id");

  const { error } = await applyMutableRecordFilter(supabase.from("home_valuation_sources").delete(), id, householdContext);
  if (error) throw new Error(error.message);
  revalidatePath("/mortgage");
  revalidatePath("/affordability");
  revalidatePath("/dashboard");
}

export async function addMortgageScenario(formData: FormData) {
  const { supabase, user } = await requireUser();

  const payload = {
    user_id: user.id,
    name: String(formData.get("name") || "Mortgage scenario"),
    balance: parseNumber(formData.get("balance")) ?? 0,
    interest_rate: parseNumber(formData.get("interest_rate")) ?? 0,
    term_years: parseNumber(formData.get("term_years")) ?? 25,
    monthly_overpayment: parseNumber(formData.get("monthly_overpayment")) ?? 0,
  };

  const { error } = await supabase.from("mortgage_scenarios").insert(payload);
  if (error) throw new Error(error.message);

  revalidatePath("/mortgage");
}

export async function deleteMortgageScenario(formData: FormData) {
  const { supabase, user } = await requireUser();

  const id = String(formData.get("id"));
  const { error } = await supabase
    .from("mortgage_scenarios")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);

  revalidatePath("/mortgage");
}
