"use server";

import crypto from "crypto";
import { redirect } from "next/navigation";
import { createAdminClient, hasSupabaseAdminKey } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { allowedAdminEmails, DEFAULT_ADMIN_EMAIL, isAllowedAdminEmail } from "@/lib/admin/access";
import { sendTransactionalEmail } from "@/lib/notifications/send";

function baseUrl() {
  return (process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
}

async function findAuthUserByEmail(admin: ReturnType<typeof createAdminClient>, email: string) {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const found = data.users.find((candidate) => candidate.email?.toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (data.users.length < 1000) break;
  }
  return null;
}

function recoveryLinkFromPayload(data: any) {
  return data?.properties?.action_link || data?.action_link || data?.properties?.hashed_token || null;
}

export async function requestAdminPasswordSetup(formData: FormData) {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  if (!email) redirect(`/admin/setup?error=${encodeURIComponent("Enter the admin email address.")}`);
  if (!isAllowedAdminEmail(email)) {
    redirect(`/admin/setup?error=${encodeURIComponent(`Admin setup is restricted to ${allowedAdminEmails().join(", ") || DEFAULT_ADMIN_EMAIL}.`)}`);
  }
  const redirectTo = `${baseUrl()}/account/update-password?next=/admin`;

  if (!hasSupabaseAdminKey()) {
    const supabase = await createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) redirect(`/admin/setup?error=${encodeURIComponent(error.message)}`);
    redirect(`/admin/setup?sent=1&warning=${encodeURIComponent("No Supabase service-role key is configured, so Loop sent a normal password-reset email instead. If this admin account does not exist yet, create it in Supabase Auth or set SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SECRET_KEY and retry setup.")}`);
  }

  const admin = createAdminClient();
  let authUser = await findAuthUserByEmail(admin, email);

  if (!authUser) {
    const temporaryPassword = crypto.randomBytes(36).toString("base64url");
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: { loop_admin: true, created_by_admin_setup: true },
    });
    if (error) redirect(`/admin/setup?error=${encodeURIComponent(error.message)}`);
    authUser = data.user;
  }

  await admin.from("app_admin_users").upsert({
    user_id: authUser.id,
    email,
    role: "creator",
    status: "active",
  }, { onConflict: "email" });

  const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo },
  } as any);
  if (linkError) redirect(`/admin/setup?error=${encodeURIComponent(linkError.message)}`);

  const actionLink = recoveryLinkFromPayload(linkData);
  if (!actionLink || !String(actionLink).startsWith("http")) {
    redirect(`/admin/setup?error=${encodeURIComponent("Supabase did not return a recovery link. Check the Supabase Auth email/recovery settings.")}`);
  }

  const sent = await sendTransactionalEmail({
    to: email,
    subject: "Set your Loop admin password",
    html: `<div style="font-family:Arial,sans-serif;line-height:1.5"><h2>Set your Loop admin password</h2><p>This setup link is for the protected Loop admin account.</p><p><a href="${actionLink}" style="display:inline-block;background:#020617;color:#fff;padding:12px 18px;border-radius:999px;text-decoration:none;font-weight:800">Set admin password</a></p><p>If you did not request this, ignore this email.</p></div>`,
    text: `Set your Loop admin password\n\nOpen this secure recovery link to set the password:\n${actionLink}\n\nIf you did not request this, ignore this email.`,
  });

  if (!sent.sent) {
    redirect(`/admin/setup?sent=0&warning=${encodeURIComponent(sent.skipped || "Email provider did not send. Check RESEND/SMTP settings.")}`);
  }

  redirect(`/admin/setup?sent=1`);
}
