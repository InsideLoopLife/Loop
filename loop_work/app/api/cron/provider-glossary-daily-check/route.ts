import { NextResponse } from "next/server";
import { createWorkerDatabaseClient } from "@/platform/database/worker-client";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || new URL(request.url).searchParams.get("secret");
  if (secret && provided !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createWorkerDatabaseClient("market");
  const { data: providers, error } = await supabase
    .from("investment_provider_glossary")
    .select("id, provider_name, docs")
    .order("provider_name", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const today = new Date().toISOString().slice(0, 10);
  const rows = (providers || []).map((provider) => ({
    provider_id: provider.id,
    check_date: today,
    check_type: "fees_terms_names",
    status: "queued",
    summary: `Queued provider glossary review for ${provider.provider_name}. Future worker can compare fees, names and docs against source URLs.`,
    source_urls: Array.isArray(provider.docs) ? provider.docs.map((doc: { url?: string }) => doc.url).filter(Boolean) : [],
  }));
  if (rows.length) {
    const { error: upsertError } = await supabase.from("investment_provider_daily_checks").upsert(rows, { onConflict: "provider_id,check_date,check_type" });
    if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }
  return NextResponse.json({ queued: rows.length, date: today });
}
