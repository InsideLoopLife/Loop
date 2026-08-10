"use server";

import crypto from "crypto";
import { redirect } from "next/navigation";
import { createAdminClient, hasSupabaseAdminKey } from "@/lib/supabase/admin";
import { sendTransactionalEmail } from "@/lib/notifications/send";
import { renderBrandedEmail, renderCodeEmailBody } from "@/lib/notifications/email-template";
import { processPendingHouseholdLinksForUser } from "@/lib/auth/invite-linking";
import { createClient } from "@/lib/supabase/server";
import { sendWelcomeEmailForUser } from "@/lib/notifications/welcome";

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

function authCallbackUrl(next: string) {
  const callback = new URL("/auth/callback", baseUrl());
  callback.searchParams.set("next", next || "/dashboard");
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

export async function requestSignupCode(formData: FormData) {
  const email = normaliseEmail(String(formData.get("email") || ""));
  const next = String(formData.get("next") || "/dashboard");

  // Signup access codeword — the only way to create a new account right
  // now. Stored as an env var so it can be changed without a code deploy.
  // Falls back to "BASEBALL2!" if the env var isn't set, matching what
  // was requested — set SIGNUP_ACCESS_CODE on Render to change it later.
  const requiredCode = process.env.SIGNUP_ACCESS_CODE || "BASEBALL2!";
  const submittedCode = String(formData.get("access_code") || "").trim();
  if (submittedCode !== requiredCode) {
    redirect(`/signup?error=${encodeURIComponent("Incorrect access code.")}&email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`);
  }

  if (!email) throw new Error("Enter an email address.");
  if (!hasSupabaseAdminKey()) {
    redirect(`/signup/verify?email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}&native=1`);
  }

  const existing = await findAuthUserByEmail(email);
  if (existing) {
    // Existing account: don't create a new account. Send them to login; dashboard/login callback now auto-links pending household invites by email.
    redirect(`/login?already=1&email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`);
  }

  const code = randomCode();
  const emailHash = sha256(email);

  await createAdminClient().from("auth_action_codes").insert({
    purpose: "signup_email_verify",
    email,
    email_hash: emailHash,
    code_hash: sha256(`${email}:${code}`),
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    metadata: { next },
  });

  const emailResult = await sendTransactionalEmail({
    to: email,
    subject: "Your Loop account code",
    html: renderBrandedEmail({
      preheader: "Your Loop sign-up code is inside — expires in 10 minutes.",
      eyebrow: "Create account",
      heading: "Your sign-up code",
      bodyHtml: renderCodeEmailBody({
        intro: "Enter this code to finish creating your Loop account:",
        code,
        expiryMinutes: 10,
      }),
    }),
    text: `Create your Loop account\n\nYour 8 digit sign-up code is: ${code}\n\nThis code expires in 10 minutes.`,
  });

  console.log("[signup] code email result", { email, ...emailResult });
  if (!emailResult.sent) {
    redirect(`/signup?email=${encodeURIComponent(email)}&error=${encodeURIComponent(emailResult.skipped || "Email was not sent. Check SMTP/Resend settings.")}`);
  }

  redirect(`/signup/verify?email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}&sent=1`);
}

export async function verifySignupCodeAndCreateAccount(formData: FormData) {
  const email = normaliseEmail(String(formData.get("email") || ""));
  const code = String(formData.get("code") || "").replace(/\D/g, "");
  const password = String(formData.get("password") || "");
  const confirm = String(formData.get("confirm_password") || "");
  const next = String(formData.get("next") || "/dashboard");
  const nativeMode = String(formData.get("native_mode") || "") === "1";

  if (!email) throw new Error("Enter an email address.");
  if (password.length < 8) throw new Error("Use at least 8 characters.");
  if (password !== confirm) throw new Error("Passwords do not match.");

  if (!hasSupabaseAdminKey()) {
    if (!nativeMode) throw new Error("A Supabase admin key is required for branded sign-up codes.");
    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: authCallbackUrl(next) },
    });
    if (error) throw new Error(error.message);
    if (data.user?.id) {
      await processPendingHouseholdLinksForUser({ userId: data.user.id, email });
      await sendWelcomeEmailForUser({ userId: data.user.id, email, authProvider: "email", supabase }).catch((error) => console.error("[signup] welcome email failed", error?.message || error));
    }
    redirect(`/login?created=1&email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`);
  }

  if (code.length !== 8) throw new Error("Enter the 8 digit code.");

  const emailHash = sha256(email);
  const admin = createAdminClient();
  const { data: signupCode, error } = await admin
    .from("auth_action_codes")
    .select("*")
    .eq("purpose", "signup_email_verify")
    .eq("email_hash", emailHash)
    .is("consumed_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!signupCode) throw new Error("Sign-up code not found. Request a fresh code.");
  if (new Date(signupCode.expires_at) < new Date()) throw new Error("Sign-up code expired. Request a fresh code.");
  if (Number(signupCode.attempts || 0) >= Number(signupCode.max_attempts || 5)) throw new Error("Too many attempts. Request a fresh code.");

  if (signupCode.code_hash !== sha256(`${email}:${code}`)) {
    await admin.from("auth_action_codes").update({ attempts: Number(signupCode.attempts || 0) + 1 }).eq("id", signupCode.id);
    throw new Error("Sign-up code does not match.");
  }

  const existing = await findAuthUserByEmail(email);
  if (existing) {
    await admin.from("auth_action_codes").update({ consumed_at: new Date().toISOString() }).eq("id", signupCode.id);
    await processPendingHouseholdLinksForUser({ userId: existing.id, email });
    redirect(`/login?already=1&linked=1&email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`);
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { created_by: "loop_branded_signup" },
  });

  if (createError) throw new Error(createError.message);
  if (!created.user?.id) throw new Error("Supabase did not return a created user id.");

  await admin.from("auth_action_codes").update({ consumed_at: new Date().toISOString() }).eq("id", signupCode.id);

  // Critical: if this email was invited to a household/profile before account creation, link immediately.
  const linkResult = await processPendingHouseholdLinksForUser({ userId: created.user.id, email });
  console.log("[signup] post-create invite linking", { email, ...linkResult });
  await sendWelcomeEmailForUser({ userId: created.user.id, email, authProvider: "email", supabase: admin }).catch((error) => console.error("[signup] welcome email failed", error?.message || error));

  redirect(`/login?created=1&email=${encodeURIComponent(email)}&next=${encodeURIComponent(next)}`);
}
