"use server";

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createBestAdminClient, requireAdminAccess } from "@/lib/admin/access";
import { buildDigestVariables, markdownToBasicHtml, markdownToPlainText, renderTemplate } from "@/lib/notifications/digest";
import { sendEmailViaResend } from "@/lib/notifications/send";

async function adminClient() {
  return createBestAdminClient() || await createClient();
}

async function loadPreviewData(supabase: any, userId: string, email?: string | null) {
  const [payEvents, plannedItems, lifestyleBills, meals] = await Promise.all([
    supabase.from("pay_events").select("label, net_amount, amount").eq("user_id", userId).limit(80),
    supabase.from("planned_items").select("label, amount, monthly_cost").eq("user_id", userId).limit(120),
    supabase.from("lifestyle_bills").select("label, provider, monthly_cost, contract_end, notice_days").eq("user_id", userId).limit(50),
    supabase.from("food_meals").select("label, estimated_cost, calories, protein_g").eq("user_id", userId).limit(20),
  ]);

  return buildDigestVariables({
    email,
    payEvents: payEvents.data || [],
    plannedItems: plannedItems.data || [],
    lifestyleBills: lifestyleBills.data || [],
    meals: meals.data || [],
  });
}

export async function saveEmailTemplate(formData: FormData) {
  const access = await requireAdminAccess();
  const supabase = await adminClient();
  const id = String(formData.get("id") || "");
  const templateKey = String(formData.get("template_key") || "").trim();
  const name = String(formData.get("name") || "").trim();
  const category = String(formData.get("category") || "finance");
  const cadence = String(formData.get("cadence") || "weekly");
  const subject = String(formData.get("subject") || "").trim();
  const preheader = String(formData.get("preheader") || "").trim();
  const body = String(formData.get("body_markdown") || "").trim();
  const enabled = formData.get("enabled") === "on";

  if (!templateKey || !name || !subject || !body) throw new Error("Template key, name, subject and body are required.");

  const payload = {
    template_key: templateKey,
    name,
    category,
    cadence,
    subject,
    preheader: preheader || null,
    body_markdown: body,
    enabled,
    created_by: access.user.id,
    updated_at: new Date().toISOString(),
  };

  const result = id
    ? await supabase.from("app_email_templates").update(payload).eq("id", id)
    : await supabase.from("app_email_templates").upsert(payload, { onConflict: "template_key" });

  if (result.error) throw new Error(result.error.message);
  revalidatePath("/admin");
}

export async function createDigestPreview(formData: FormData) {
  const access = await requireAdminAccess();
  const supabase = await adminClient();
  const templateId = String(formData.get("template_id") || "");
  const targetUserId = String(formData.get("target_user_id") || access.user.id);
  const targetEmail = String(formData.get("target_email") || access.user.email || "");

  const { data: template, error } = await supabase
    .from("app_email_templates")
    .select("*")
    .eq("id", templateId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!template) throw new Error("Template not found.");

  const variables = await loadPreviewData(supabase, targetUserId, targetEmail);
  const subject = renderTemplate(template.subject, variables);
  const body = renderTemplate(template.body_markdown, variables);
  const emailHash = targetEmail ? crypto.createHash("sha256").update(targetEmail.toLowerCase()).digest("hex") : null;

  const { error: insertError } = await supabase.from("app_email_runs").insert({
    template_id: template.id,
    user_id: targetUserId,
    created_by: access.user.id,
    run_type: "preview",
    status: "created",
    subject,
    preview_body: body,
    send_to_email_hash: emailHash,
  });
  if (insertError) throw new Error(insertError.message);
  revalidatePath("/admin");
}

export async function sendTestDigest(formData: FormData) {
  const access = await requireAdminAccess();
  const supabase = await adminClient();
  const templateId = String(formData.get("template_id") || "");
  const targetUserId = String(formData.get("target_user_id") || access.user.id);
  const targetEmail = String(formData.get("target_email") || access.user.email || "");
  if (!targetEmail) throw new Error("No target email provided.");

  const { data: template, error } = await supabase
    .from("app_email_templates")
    .select("*")
    .eq("id", templateId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!template) throw new Error("Template not found.");

  const variables = await loadPreviewData(supabase, targetUserId, targetEmail);
  const subject = renderTemplate(template.subject, variables);
  const body = renderTemplate(template.body_markdown, variables);
  const emailHash = crypto.createHash("sha256").update(targetEmail.toLowerCase()).digest("hex");

  let status = "queued";
  let errorMessage: string | null = null;
  try {
    const sent = await sendEmailViaResend({
      to: targetEmail,
      subject,
      html: markdownToBasicHtml(body),
      text: markdownToPlainText(body),
    });
    status = sent.sent ? "sent" : "created";
    errorMessage = sent.skipped || null;
  } catch (error: any) {
    status = "failed";
    errorMessage = error?.message || "Email failed.";
  }

  const { error: insertError } = await supabase.from("app_email_runs").insert({
    template_id: template.id,
    user_id: targetUserId,
    created_by: access.user.id,
    run_type: "test",
    status,
    subject,
    preview_body: body,
    send_to_email_hash: emailHash,
    sent_at: status === "sent" ? new Date().toISOString() : null,
    error_message: errorMessage,
  });
  if (insertError) throw new Error(insertError.message);
  revalidatePath("/admin");
}

export async function createInsightNotification(formData: FormData) {
  const access = await requireAdminAccess();
  const supabase = await adminClient();
  const targetUserId = String(formData.get("target_user_id") || access.user.id);
  const title = String(formData.get("title") || "").trim();
  const body = String(formData.get("body") || "").trim();
  const severity = String(formData.get("severity") || "info");
  const notificationType = String(formData.get("notification_type") || "admin_insight");
  const ctaHref = String(formData.get("cta_href") || "").trim();

  if (!title) throw new Error("Title is required.");

  const { data: membership } = await supabase
    .from("app_household_members")
    .select("household_id")
    .eq("user_id", targetUserId)
    .eq("status", "active")
    .maybeSingle();

  const { error } = await supabase.from("app_notifications").insert({
    user_id: targetUserId,
    household_id: membership?.household_id || null,
    notification_type: notificationType,
    channel: "in_app",
    status: "unread",
    severity,
    title,
    body,
    cta_label: ctaHref ? "Open" : null,
    cta_href: ctaHref || null,
    data: { created_by_admin: access.user.id },
  });
  if (error) throw new Error(error.message);
  revalidatePath("/admin");
}

export async function updateUserPaymentTier(formData: FormData) {
  const access = await requireAdminAccess();
  const supabase = await adminClient();
  const targetUserId = String(formData.get("target_user_id") || "").trim();
  if (!targetUserId) throw new Error("Choose a user first.");

  const paymentTier = String(formData.get("payment_tier") || "free");
  const paymentStatus = String(formData.get("payment_tier_status") || "inactive");
  const marketDataTier = String(formData.get("market_data_tier") || "manual");
  const providerStatus = String(formData.get("market_data_provider_status") || "not_configured");
  const realtimeEnabled = String(formData.get("market_data_realtime_enabled") || "false") === "true";
  const email = String(formData.get("email") || "").trim() || null;
  const checkedAt = new Date().toISOString();

  const { error } = await supabase.from("app_user_profiles").upsert({
    user_id: targetUserId,
    email,
    payment_tier: paymentTier,
    payment_tier_status: paymentStatus,
    market_data_tier: marketDataTier,
    market_data_provider_status: providerStatus,
    market_data_realtime_enabled: realtimeEnabled,
    tier_checked_at: checkedAt,
    tier_check_note: `Manual admin update by ${access.user.email || access.user.id}`,
    updated_at: checkedAt,
  }, { onConflict: "user_id" });
  if (error) throw new Error(error.message);

  await supabase.from("app_customer_entitlement_checks").insert({
    user_id: targetUserId,
    checked_by: access.user.id,
    check_kind: "manual_admin_update",
    payment_tier: paymentTier,
    payment_tier_status: paymentStatus,
    market_data_tier: marketDataTier,
    provider_status: providerStatus,
    result_status: realtimeEnabled && marketDataTier === "realtime" && providerStatus !== "connected" ? "needs_provider" : "updated",
    notes: realtimeEnabled && providerStatus !== "connected" ? "Realtime was enabled but provider is not marked connected yet." : "Tier/profile updated from admin page.",
  });

  const paidStatusOk = ["active", "trialing", "manual_review"].includes(paymentStatus);
  const providerAccessActive = paidStatusOk && realtimeEnabled && marketDataTier === "realtime" && providerStatus === "connected";
  if (providerAccessActive) {
    await supabase.rpc("loop_reactivate_snaptrade_investments_for_user", {
      p_user_id: targetUserId,
      p_reason: "admin_tier_provider_access_restored",
    }).then(() => null, () => null);
  } else {
    await supabase.rpc("loop_restore_manual_investments_for_user", {
      p_user_id: targetUserId,
      p_reason: "admin_tier_provider_access_removed",
    }).then(() => null, () => null);
  }

  revalidatePath("/admin");
  revalidatePath("/investments");
}

export async function runCustomerEntitlementCheck(formData: FormData) {
  const access = await requireAdminAccess();
  const supabase = await adminClient();
  const targetUserId = String(formData.get("target_user_id") || "").trim();
  if (!targetUserId) throw new Error("Choose a user first.");

  const { data: profile, error } = await supabase
    .from("app_user_profiles")
    .select("user_id, email, payment_tier, payment_tier_status, billing_provider, billing_customer_id, billing_subscription_id, market_data_tier, market_data_provider_status, market_data_realtime_enabled")
    .eq("user_id", targetUserId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!profile) throw new Error("No profile found for this user.");

  const providerConnected = String(profile.market_data_provider_status || "") === "connected";
  const paymentTier = String(profile.payment_tier || "free");
  const paidStatusOk = paymentTier !== "free" && ["active", "trialing", "manual_review"].includes(String(profile.payment_tier_status || ""));
  const realtimeRequested = String(profile.market_data_tier || "") === "realtime" || paymentTier === "realtime" || paymentTier === "enterprise";
  const result = realtimeRequested && (!providerConnected || !paidStatusOk)
    ? "blocked"
    : paidStatusOk
      ? "eligible"
      : "manual_only";
  const note = result === "blocked"
    ? "Realtime requested but payment/provider status is not ready. Keep profile on enhanced delayed or manual until billing/provider is confirmed."
    : result === "eligible"
      ? "Payment status is eligible. Market-data tier can be honoured subject to provider limits."
      : "Payment status is not active; keep user on manual/delayed data.";

  const now = new Date().toISOString();
  const { error: updateError } = await supabase.from("app_user_profiles").update({
    tier_checked_at: now,
    tier_check_note: note,
    updated_at: now,
  }).eq("user_id", targetUserId);
  if (updateError) throw new Error(updateError.message);

  await supabase.from("app_customer_entitlement_checks").insert({
    user_id: targetUserId,
    checked_by: access.user.id,
    check_kind: "admin_customer_check",
    payment_tier: profile.payment_tier,
    payment_tier_status: profile.payment_tier_status,
    market_data_tier: profile.market_data_tier,
    provider_status: profile.market_data_provider_status,
    result_status: result,
    notes: `${note} Billing provider: ${profile.billing_provider || "manual"}; customer: ${profile.billing_customer_id || "not linked"}; subscription: ${profile.billing_subscription_id || "not linked"}.`,
  });

  revalidatePath("/admin");
}
