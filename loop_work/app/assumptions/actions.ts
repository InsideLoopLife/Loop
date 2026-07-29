"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseNumber } from "@/lib/format/money";
import { OFFICIAL_ASSUMPTION_DEFAULTS } from "@/lib/assumptions/catalog";
import { ensureDefaultAssumptions, recordAssumptionCheck } from "@/lib/assumptions/server";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  return { supabase, user };
}

export async function seedOfficialAssumptions() {
  const { supabase, user } = await requireUser();

  const { data: existing } = await supabase
    .from("statutory_rate_assumptions")
    .select("rate_key")
    .eq("user_id", user.id);

  const existingKeys = new Set((existing ?? []).map((row: { rate_key: string }) => row.rate_key));
  const rows = OFFICIAL_ASSUMPTION_DEFAULTS
    .filter((item) => !existingKeys.has(item.rate_key))
    .map((item) => ({
      user_id: user.id,
      rate_key: item.rate_key,
      label: item.label,
      value_numeric: item.value_numeric ?? null,
      value_text: item.value_text ?? null,
      source_url: item.source_url || null,
      source_name: item.source_name,
      effective_from: item.effective_from,
      effective_until: item.effective_until ?? null,
      category: item.category,
      verified_by: "official_seed",
      review_status: "active",
      notes: item.notes,
    }));

  if (rows.length > 0) {
    const { error } = await supabase.from("statutory_rate_assumptions").insert(rows);
    if (error) throw new Error(error.message);
  }

  await recordAssumptionCheck({
    supabase,
    userId: user.id,
    area: "assumptions",
    status: "ok",
    message: rows.length > 0 ? `Seeded ${rows.length} official/source assumptions.` : "Official/source assumptions were already present.",
    assumptionKeys: OFFICIAL_ASSUMPTION_DEFAULTS.map((item) => item.rate_key),
  });

  revalidatePath("/assumptions");
}

export async function runAssumptionHealthCheck() {
  const { supabase, user } = await requireUser();
  await ensureDefaultAssumptions(supabase, user.id);

  const { data: rates } = await supabase
    .from("statutory_rate_assumptions")
    .select("rate_key, checked_at, source_url, review_status")
    .eq("user_id", user.id);

  const missingSources = (rates ?? []).filter((rate: { source_url: string | null }) => !rate.source_url).length;
  const missingRequired = OFFICIAL_ASSUMPTION_DEFAULTS.filter(
    (item) => !(rates ?? []).some((rate: { rate_key: string }) => rate.rate_key === item.rate_key),
  );

  await recordAssumptionCheck({
    supabase,
    userId: user.id,
    area: "assumptions",
    status: missingRequired.length || missingSources ? "needs_review" : "ok",
    message: missingRequired.length
      ? `Missing ${missingRequired.length} expected assumptions. Use Seed official defaults.`
      : missingSources
        ? `${missingSources} assumptions have no source URL and should be reviewed before relying on them.`
        : "Assumptions have expected baseline keys and source URLs.",
    assumptionKeys: missingRequired.map((item) => item.rate_key),
  });

  revalidatePath("/assumptions");
}

export async function saveAssumption(formData: FormData) {
  const { supabase, user } = await requireUser();
  const id = String(formData.get("id") || "");

  const payload = {
    user_id: user.id,
    rate_key: String(formData.get("rate_key") || "custom_assumption"),
    label: String(formData.get("label") || "Assumption"),
    value_numeric: parseNumber(formData.get("value_numeric")),
    value_text: String(formData.get("value_text") || "") || null,
    source_url: String(formData.get("source_url") || "") || null,
    source_name: String(formData.get("source_name") || "") || null,
    effective_from: String(formData.get("effective_from") || "") || null,
    effective_until: String(formData.get("effective_until") || "") || null,
    category: String(formData.get("category") || "custom"),
    verified_by: String(formData.get("verified_by") || "manual"),
    review_status: String(formData.get("review_status") || "active"),
    notes: String(formData.get("notes") || ""),
  };

  if (id) {
    const { error } = await supabase
      .from("statutory_rate_assumptions")
      .update(payload)
      .eq("id", id)
      .eq("user_id", user.id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("statutory_rate_assumptions").insert(payload);
    if (error) throw new Error(error.message);
  }

  await recordAssumptionCheck({
    supabase,
    userId: user.id,
    area: "assumptions",
    status: payload.source_url ? "ok" : "needs_review",
    message: payload.source_url
      ? `Saved ${payload.label} with source details.`
      : `Saved ${payload.label}, but it needs a source URL before it should drive calculations.`,
    assumptionKeys: [payload.rate_key],
  });

  revalidatePath("/assumptions");
}

export async function deleteAssumption(formData: FormData) {
  const { supabase, user } = await requireUser();
  const id = String(formData.get("id") || "");
  const { error } = await supabase.from("statutory_rate_assumptions").delete().eq("id", id).eq("user_id", user.id);
  if (error) throw new Error(error.message);
  revalidatePath("/assumptions");
}

export async function clearAssumptionLog() {
  const { supabase, user } = await requireUser();
  const { error } = await supabase.from("assumption_check_log").delete().eq("user_id", user.id);
  if (error) throw new Error(error.message);
  revalidatePath("/assumptions");
}
