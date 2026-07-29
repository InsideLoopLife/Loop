"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function updatePropertySourceStatus(formData: FormData) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("loop_property_data_sources")
    .update({ status: String(formData.get("status") || "planned"), updated_at: new Date().toISOString() })
    .eq("source_key", String(formData.get("source_key") || ""));
  if (error) throw new Error(error.message);
  revalidatePath("/admin/property-sources");
}

export async function saveCouncilTaxRate(formData: FormData) {
  const supabase = await createClient();
  const annual = Math.round(Number(String(formData.get("annual_charge") || "0").replace(/[^0-9.]/g, "")) * 100);
  const { error } = await supabase.from("loop_council_tax_rate_estimates").insert({
    local_authority_code: String(formData.get("local_authority_code") || "") || null,
    local_authority_name: String(formData.get("local_authority_name") || "") || null,
    country_code: String(formData.get("country_code") || "ENG"),
    band: String(formData.get("band") || "D").toUpperCase(),
    annual_charge_pence: annual,
    charge_year: String(formData.get("charge_year") || "2026/27"),
    source_kind: "admin_manual",
    source_url: String(formData.get("source_url") || "") || null,
    confidence: 80,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin/property-sources");
}
