"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdminAccess } from "@/lib/admin/access";
import { parseBoeCsvUpload } from "@/lib/rates/boe-csv";
import { createWorkerDatabaseClient } from "@/platform/database/worker-client";

export async function uploadBoeBenchmarks(formData: FormData) {
  await requireAdminAccess();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) redirect("/admin/boe-benchmarks?error=Choose%20the%20CSV%20file%20first");
  if (file.size > 2_000_000) redirect("/admin/boe-benchmarks?error=That%20file%20is%20too%20big%20to%20be%20the%20BoE%20export");

  const { rows, unrecognised } = parseBoeCsvUpload(await file.text());
  if (!rows.length) redirect("/admin/boe-benchmarks?error=No%20rates%20found.%20Check%20it%20is%20the%20CSV%20from%20the%20link%20above");

  const ratesDb = createWorkerDatabaseClient("rates");
  const { error } = await ratesDb.from("mortgage_market_rate_benchmarks").upsert(
    rows.map((r) => ({
      series_code: r.seriesCode,
      term_type: r.termType,
      ltv_tier: r.ltvTier,
      rate_percent: r.ratePercent,
      effective_month: r.effectiveMonth,
      raw_series_title: r.rawTitle,
      source: "boe_iadb_admin_upload",
      fetched_at: new Date().toISOString(),
    })),
    { onConflict: "series_code,effective_month" },
  );
  if (error) redirect(`/admin/boe-benchmarks?error=${encodeURIComponent(error.message)}`);

  revalidatePath("/admin/boe-benchmarks");
  revalidatePath("/mortgage");
  redirect(`/admin/boe-benchmarks?saved=${rows.length}${unrecognised.length ? `&skipped=${unrecognised.join(",")}` : ""}`);
}
