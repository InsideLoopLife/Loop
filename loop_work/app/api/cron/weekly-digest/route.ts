import { NextResponse, type NextRequest } from "next/server";
import crypto from "crypto";
import { createWorkerDatabaseClient } from "@/platform/database/worker-client";
import { buildDigestVariables, markdownToBasicHtml, markdownToPlainText, renderTemplate } from "@/lib/notifications/digest";
import { sendEmailViaResend } from "@/lib/notifications/send";

function unauthorised() {
  return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const headerSecret = request.headers.get("x-cron-secret") || request.nextUrl.searchParams.get("secret");
  if (!secret || headerSecret !== secret) return unauthorised();

  const supabase = createWorkerDatabaseClient("notifications");
  const { data: prefs, error } = await supabase
    .from("app_notification_preferences")
    .select("user_id, household_id, weekly_email_enabled, finance_digest_enabled, health_digest_enabled")
    .eq("weekly_email_enabled", true)
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: template } = await supabase
    .from("app_email_templates")
    .select("*")
    .eq("template_key", "weekly_household_money_digest")
    .maybeSingle();

  const results = [];
  for (const pref of prefs || []) {
    const { data: profile } = await supabase
      .from("app_user_profiles")
      .select("email, display_name")
      .eq("user_id", pref.user_id)
      .maybeSingle();

    const email = profile?.email;
    if (!email || !template) continue;

    const [payEvents, plannedItems, lifestyleBills, meals] = await Promise.all([
      supabase.from("pay_events").select("label, net_amount, amount").eq("user_id", pref.user_id).limit(80),
      supabase.from("planned_items").select("label, amount, monthly_cost").eq("user_id", pref.user_id).limit(120),
      supabase.from("lifestyle_bills").select("label, provider, monthly_cost, contract_end, notice_days").eq("user_id", pref.user_id).limit(50),
      supabase.from("food_meals").select("label, estimated_cost, calories, protein_g").eq("user_id", pref.user_id).limit(20),
    ]);

    const vars = buildDigestVariables({
      email,
      payEvents: payEvents.data || [],
      plannedItems: plannedItems.data || [],
      lifestyleBills: lifestyleBills.data || [],
      meals: meals.data || [],
    });
    const subject = renderTemplate(template.subject, vars);
    const body = renderTemplate(template.body_markdown, vars);
    let status = "queued";
    let errorMessage = null;
    try {
      const sent = await sendEmailViaResend({ to: email, subject, html: markdownToBasicHtml(body), text: markdownToPlainText(body) });
      status = sent.sent ? "sent" : "created";
      errorMessage = sent.skipped;
    } catch (err: any) {
      status = "failed";
      errorMessage = err?.message || "Send failed";
    }

    await supabase.from("app_notifications").insert({
      user_id: pref.user_id,
      household_id: pref.household_id,
      notification_type: "weekly_digest",
      channel: "in_app",
      status: "unread",
      severity: "info",
      title: "Your weekly household update is ready",
      body: markdownToPlainText(body).slice(0, 500),
      cta_label: "Open dashboard",
      cta_href: "/dashboard",
    });

    await supabase.from("app_email_runs").insert({
      template_id: template.id,
      user_id: pref.user_id,
      household_id: pref.household_id,
      run_type: "scheduled",
      status,
      subject,
      preview_body: body,
      send_to_email_hash: crypto.createHash("sha256").update(email.toLowerCase()).digest("hex"),
      sent_at: status === "sent" ? new Date().toISOString() : null,
      error_message: errorMessage,
    });

    results.push({ user_id: pref.user_id, status, error: errorMessage });
  }

  return NextResponse.json({ ok: true, processed: results.length, results });
}
