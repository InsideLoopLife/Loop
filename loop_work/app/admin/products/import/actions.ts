"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createProductImportJob(formData: FormData) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();

  const payload = {
    requested_by: authData.user?.id || null,
    retailer_key: String(formData.get("retailer_key") || "unknown").toLowerCase().trim(),
    source_url: String(formData.get("source_url") || "").trim(),
    source_kind: String(formData.get("source_kind") || "category_url"),
    import_scope: String(formData.get("import_scope") || "food_drink"),
    scan_mode: String(formData.get("scan_mode") || "discover_and_review"),
    max_pages: Number(formData.get("max_pages") || 50),
    status: "queued",
    priority: Number(formData.get("priority") || 100),
  };

  if (!payload.source_url) throw new Error("Source URL is required.");

  const { error } = await supabase.from("loop_product_import_scan_jobs").insert(payload);
  if (error) throw new Error(error.message);

  revalidatePath("/admin/products/import");
}
