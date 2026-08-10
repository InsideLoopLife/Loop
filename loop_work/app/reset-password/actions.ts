"use server";

import crypto from "crypto";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, hasSupabaseAdminKey } from "@/lib/supabase/admin";
import { sendTransactionalEmail } from "@/lib/notifications/send";
import { renderBrandedEmail, renderCodeEmailBody } from "@/lib/notifications/email-template";

const RESET_CODE_EXPIRY_MINUTES = 10;

function normaliseEmail(email: string) {
  return email.trim().toLowerCase();
}

function sha256(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function randomCode() {
  return String(crypto.randomInt(0, 100_000_000)).padStart(8, "0");
}

function baseUrl() {
  return (process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
}

function recoveryRedirectUrl() {
  const callback = new URL("/auth/callback", baseUrl());
  callback.searchParams.set("next", "/account/update-password");
  return callback.toString();
}

async function findAuthUserByEmail(email: string) {
  if (!hasSupabaseAdminKey()) return null;
  const admin = createAdminClient();
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const found = data.users.find((candidate) => candidate.email?.toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (data.users.length < 1000) break;
  }
  return null;
}

export async function requestPasswordResetCode(formData: FormData) {
  const email = normaliseEmail(String(formData.get("email") || ""));
  if (!email) redirect("/reset-password?sent=1");

  const supabase = await createClient();
  const emailHash = sha256(email);

  if (!hasSupabaseAdminKey()) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: recoveryRedirectUrl(),
    });
    if (error) {
      redirect(`/reset-password?error=${encodeURIComponent(error.message)}`);
    }
    await supabase.from("app_security_events").insert({
      event_type: "password_reset_recovery_link_requested",
      status: "success",
      metadata: { email_hash: emailHash, sent_via: "supabase_native_recovery_link" },
    });
    redirect(`/reset-password?sent=1&native=1`);
  }

  const admin = createAdminClient();
  let sentVia = "not_sent";

  console.log("[password-reset] request received", {
    email,
    provider: process.env.EMAIL_PROVIDER || "resend/default",
    smtpHost: process.env.SMTP_HOST || null,
    smtpUser: process.env.SMTP_USER || null,
    hasSmtpPassword: Boolean(process.env.SMTP_APP_PASSWORD || process.env.SMTP_PASSWORD),
    hasResendKey: Boolean(process.env.RESEND_API_KEY),
  });

  try {
    const authUser = await findAuthUserByEmail(email);
    console.log("[password-reset] auth user lookup", { email, found: Boolean(authUser?.id) });

    // Do not reveal whether an account exists in the UI. In dev logs, this makes it clear why no email arrived.
    if (!authUser?.id) {
      await supabase.from("app_security_events").insert({
        event_type: "password_reset_code_requested_no_account",
        status: "success",
        metadata: { email_hash: emailHash },
      });
      console.warn("[password-reset] no Supabase Auth user for email; no reset email sent", { email });
      redirect(`/reset-password/verify?email=${encodeURIComponent(email)}&sent=1`);
    }

    const code = randomCode();
    const codeHash = sha256(`${email}:${code}`);
    const { error: insertError } = await admin.from("auth_action_codes").insert({
      purpose: "password_reset",
      email,
      email_hash: emailHash,
      code_hash: codeHash,
      user_id: authUser.id,
      expires_at: new Date(Date.now() + RESET_CODE_EXPIRY_MINUTES * 60 * 1000).toISOString(),
      metadata: { channel: "branded_email", length: 8 },
    });
    if (insertError) throw new Error(insertError.message);

    const result = await sendTransactionalEmail({
      to: email,
      subject: "Your Loop password reset code",
      html: renderBrandedEmail({
        preheader: `Your Loop password reset code is inside — expires in ${RESET_CODE_EXPIRY_MINUTES} minutes.`,
        eyebrow: "Reset password",
        heading: "Your reset code",
        bodyHtml: renderCodeEmailBody({
          intro: "Enter this code to reset your Loop password:",
          code,
          expiryMinutes: RESET_CODE_EXPIRY_MINUTES,
        }),
        footerNote: "If you didn't request this, you can ignore this email — your password won't change.",
      }),
      text: `Reset your Loop password\n\nYour 8 digit reset code is: ${code}\n\nThis code expires in ${RESET_CODE_EXPIRY_MINUTES} minutes. If you did not request this, you can ignore this email.`,
    });

    console.log("[password-reset] email send result", result);

    if (!result.sent) {
      sentVia = `not_sent_${result.skipped || "unknown"}`;
      await admin.from("auth_action_codes").update({ consumed_at: new Date().toISOString(), metadata: { skipped: result.skipped || "email_not_sent" } }).eq("code_hash", codeHash);
      redirect(`/reset-password?error=${encodeURIComponent(result.skipped || "Reset email was not sent. Check SMTP/Resend settings.")}`);
    }

    sentVia = `branded_${result.provider || "email"}`;
  } catch (err: any) {
    // Next redirect throws internally; allow it through.
    if (String(err?.message || err).includes("NEXT_REDIRECT")) throw err;
    console.error("[password-reset] request failed", err?.message || err);
    redirect(`/reset-password?error=${encodeURIComponent(err?.message || "Password reset failed. Check server logs.")}`);
  }

  await supabase.from("app_security_events").insert({
    event_type: "password_reset_code_requested",
    status: "success",
    metadata: { email_hash: emailHash, sent_via: sentVia },
  });

  redirect(`/reset-password/verify?email=${encodeURIComponent(email)}&sent=1`);
}

export async function resetPasswordWithCode(formData: FormData) {
  const email = normaliseEmail(String(formData.get("email") || ""));
  const code = String(formData.get("code") || "").replace(/\D/g, "");
  const password = String(formData.get("password") || "");
  const confirmPassword = String(formData.get("confirm_password") || "");

  if (!hasSupabaseAdminKey()) {
    throw new Error("A Supabase admin key is required for branded code-based password reset.");
  }
  if (!email || code.length !== 8) throw new Error("Enter the 8 digit reset code.");
  if (password.length < 8) throw new Error("Use at least 8 characters for the new password.");
  if (password !== confirmPassword) throw new Error("Passwords do not match.");

  const supabase = await createClient();
  const admin = createAdminClient();
  const emailHash = sha256(email);
  const codeHash = sha256(`${email}:${code}`);

  const { data: resetCode, error } = await admin
    .from("auth_action_codes")
    .select("*")
    .eq("purpose", "password_reset")
    .eq("email_hash", emailHash)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!resetCode) throw new Error("Reset code not found. Request a fresh code.");
  if (new Date(resetCode.expires_at) < new Date()) throw new Error("Reset code expired. Request a fresh code.");
  if (Number(resetCode.attempts || 0) >= Number(resetCode.max_attempts || 5)) throw new Error("Too many attempts. Request a fresh code.");

  if (resetCode.code_hash !== codeHash) {
    await admin.from("auth_action_codes").update({ attempts: Number(resetCode.attempts || 0) + 1 }).eq("id", resetCode.id);
    throw new Error("Reset code does not match.");
  }

  const authUser = resetCode.user_id ? { id: resetCode.user_id } : await findAuthUserByEmail(email);
  if (!authUser?.id) throw new Error("No account was found for this reset code.");

  const { error: updateError } = await admin.auth.admin.updateUserById(authUser.id, {
    password,
    email_confirm: true,
  });
  if (updateError) throw new Error(updateError.message);

  await admin.from("auth_action_codes").update({ consumed_at: new Date().toISOString() }).eq("id", resetCode.id);
  await supabase.from("app_security_events").insert({
    user_id: authUser.id,
    event_type: "password_reset_code_consumed",
    status: "success",
    metadata: { email_hash: emailHash },
  });

  redirect("/login?reset=1");
}
