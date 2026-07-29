import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkUrl } from "@/lib/admin/uptime";

export async function GET() {
  const supabase = await createClient();

  const { data: targets, error } = await supabase
    .from("loop_uptime_targets")
    .select("*")
    .eq("enabled", true)
    .order("last_checked_at", { ascending: true, nullsFirst: true })
    .limit(25);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const results = [];

  for (const target of targets || []) {
    const result = await checkUrl(
      target.target_url,
      target.timeout_ms,
      target.expected_status_min,
      target.expected_status_max
    );

    await supabase.from("loop_uptime_checks").insert({
      target_id: target.id,
      status: result.status,
      status_code: result.statusCode || null,
      latency_ms: result.latencyMs || null,
      error: result.error || null,
      payload: result,
    });

    const isOk = result.status === "up" || result.status === "slow";
    const consecutiveFailures = isOk ? 0 : Number(target.consecutive_failures || 0) + 1;

    await supabase.from("loop_uptime_targets").update({
      last_status: result.status,
      last_status_code: result.statusCode || null,
      last_latency_ms: result.latencyMs || null,
      last_checked_at: new Date().toISOString(),
      last_success_at: isOk ? new Date().toISOString() : target.last_success_at,
      consecutive_failures: consecutiveFailures,
    }).eq("id", target.id);

    if (!isOk || result.status === "slow") {
      await supabase.rpc("loop_admin_raise_alert", {
        p_area: "uptime",
        p_severity: consecutiveFailures >= 3 ? "critical" : "high",
        p_alert_key: "uptime_target_problem",
        p_title: "Uptime target needs attention",
        p_summary: `${target.target_name} returned ${result.status}`,
        p_detail: result.error || `Status: ${result.status}; HTTP ${result.statusCode || "unknown"}`,
        p_entity_kind: "uptime_target",
        p_entity_id: target.id,
        p_action_url: "/admin/uptime",
        p_payload: { target, result },
        p_check_cadence_minutes: Math.max(5, target.check_frequency_minutes || 15),
      });
    }

    results.push({ target: target.target_name, result });
  }

  return NextResponse.json({ ok: true, checked: results.length, results });
}
