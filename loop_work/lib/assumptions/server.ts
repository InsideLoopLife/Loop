import type { SupabaseClient } from "@supabase/supabase-js";
import { OFFICIAL_ASSUMPTION_DEFAULTS } from "./catalog";

type ClientLike = SupabaseClient<any, any, any>;

export async function ensureDefaultAssumptions(supabase: ClientLike, userId: string) {
  const { count, error } = await supabase
    .from("statutory_rate_assumptions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (error || (count ?? 0) > 0) return;

  await supabase.from("statutory_rate_assumptions").insert(
    OFFICIAL_ASSUMPTION_DEFAULTS.map((item) => ({
      user_id: userId,
      rate_key: item.rate_key,
      label: item.label,
      value_numeric: item.value_numeric ?? null,
      value_text: item.value_text ?? null,
      source_url: item.source_url || null,
      source_name: item.source_name,
      effective_from: item.effective_from,
      effective_until: item.effective_until ?? null,
      notes: `${item.category}: ${item.notes}`,
    })),
  );
}

export async function getLatestAssumptionValue(supabase: ClientLike, userId: string, rateKey: string) {
  const { data } = await supabase
    .from("statutory_rate_assumptions")
    .select("value_numeric, value_text, label, source_name, source_url, checked_at")
    .eq("user_id", userId)
    .eq("rate_key", rateKey)
    .order("effective_from", { ascending: false })
    .order("checked_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data;
}

export async function recordAssumptionCheck({
  supabase,
  userId,
  area,
  relatedTable,
  relatedId,
  status,
  message,
  assumptionKeys,
}: {
  supabase: ClientLike;
  userId: string;
  area: string;
  relatedTable?: string | null;
  relatedId?: string | null;
  status: "ok" | "warning" | "needs_review";
  message: string;
  assumptionKeys?: string[];
}) {
  // Do not let the checker break normal data entry if the V11 migration has not been run yet.
  try {
    await supabase.from("assumption_check_log").insert({
      user_id: userId,
      area,
      related_table: relatedTable ?? null,
      related_id: relatedId ?? null,
      status,
      message,
      assumption_keys: assumptionKeys ?? [],
    });
  } catch {
    // no-op
  }
}
