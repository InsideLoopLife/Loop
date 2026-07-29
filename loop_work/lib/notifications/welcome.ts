import crypto from "crypto";
import { createAdminClient, hasSupabaseAdminKey } from "@/lib/supabase/admin";
import { sendTransactionalEmail } from "@/lib/notifications/send";

type WelcomeArgs = {
  userId: string;
  email: string;
  name?: string | null;
  authProvider?: string | null;
  next?: string | null;
  supabase?: any;
};

function baseUrl() {
  return (process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
}

function firstName(nameOrEmail?: string | null) {
  const raw = (nameOrEmail || "").trim();
  if (!raw) return "there";
  const beforeAt = raw.includes("@") ? raw.split("@")[0] : raw;
  return beforeAt.split(/[\s._-]+/).filter(Boolean)[0] || "there";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function hashEmail(email: string) {
  return crypto.createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
}

export function buildWelcomeEmail({ name, email }: { name?: string | null; email: string }) {
  const appUrl = baseUrl();
  const greeting = escapeHtml(firstName(name || email));
  const subject = "Welcome to LOOP — start tracking smarter";
  const dashboardUrl = `${appUrl}/dashboard`;
  const householdUrl = `${appUrl}/household`;
  const mortgageUrl = `${appUrl}/mortgage`;
  const investmentsUrl = `${appUrl}/investments`;
  const integrationsUrl = `${appUrl}/integrations`;

  const text = `Hi ${firstName(name || email)},

Welcome to LOOP — your private household tracker for money, property, savings, pensions, investments and health.

Start here:
1. Set up your household: ${householdUrl}
2. Add your home and mortgage/rate details: ${mortgageUrl}
3. Review savings and money opportunities from your dashboard: ${dashboardUrl}
4. Connect investments or add them manually: ${investmentsUrl}
5. Manage secure integrations: ${integrationsUrl}

LOOP keeps imported data separate from user-approved decisions and highlights source confidence where it matters. You stay in control of what is connected, imported and shared.

Open LOOP: ${dashboardUrl}

The LOOP team`;

  const cardStyle = "background:#ffffff;border:1px solid #e2e8f0;border-radius:22px;padding:18px 18px 16px;box-shadow:0 16px 45px rgba(15,23,42,.08);";
  const pillStyle = "display:inline-block;padding:6px 10px;border-radius:999px;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;";
  const buttonStyle = "display:inline-block;text-decoration:none;border-radius:999px;padding:14px 20px;font-size:14px;font-weight:900;";

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="x-apple-disable-message-reformatting">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#eaf1f8;font-family:Inter,Arial,Helvetica,sans-serif;color:#0f172a;-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Your LOOP workspace is ready. Start with household, home, savings, mortgages and investments.</div>

  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eaf1f8;margin:0;padding:28px 14px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:760px;margin:0 auto;background:#ffffff;border-radius:30px;overflow:hidden;border:1px solid #dbe6f2;box-shadow:0 24px 70px rgba(15,23,42,.16);">
          <tr>
            <td style="background:linear-gradient(135deg,#020617 0%,#073b3a 44%,#ff5a14 100%);padding:34px 34px 30px;color:#ffffff;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="vertical-align:top;">
                    <div style="font-size:12px;font-weight:900;letter-spacing:.28em;text-transform:uppercase;color:#7dd3fc;">LOOP</div>
                    <h1 style="margin:13px 0 8px;font-size:36px;line-height:1.02;font-weight:950;color:#ffffff;">Welcome in, ${greeting}</h1>
                    <p style="margin:0;max-width:560px;font-size:16px;line-height:1.65;color:#dbeafe;font-weight:650;">Your private dashboard for household decisions, money movement, property planning and long-term tracking is ready.</p>
                  </td>
                </tr>
              </table>
              <div style="margin-top:24px;">
                <a href="${dashboardUrl}" style="${buttonStyle}background:#ffffff;color:#020617;">Open LOOP</a>
                <a href="${householdUrl}" style="${buttonStyle}background:rgba(255,255,255,.12);color:#ffffff;border:1px solid rgba(255,255,255,.28);margin-left:8px;">Set up household</a>
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding:30px 34px 8px;background:#f8fafc;">
              <p style="margin:0 0 18px;font-size:16px;line-height:1.7;color:#334155;font-weight:650;">LOOP helps you keep the important parts of household life together — then shows what changed, what needs checking and what may be worth acting on.</p>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td width="50%" style="padding:0 8px 16px 0;vertical-align:top;">
                    <div style="${cardStyle}">
                      <span style="${pillStyle}background:#dcfce7;color:#047857;">Savings</span>
                      <h2 style="margin:12px 0 8px;font-size:20px;line-height:1.2;color:#020617;">Find better places for cash</h2>
                      <p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#475569;">Track providers you already bank with, compare savings options and avoid deals you are not eligible for.</p>
                      <a href="${dashboardUrl}" style="font-size:14px;font-weight:900;color:#2563eb;text-decoration:none;">Review savings →</a>
                    </div>
                  </td>
                  <td width="50%" style="padding:0 0 16px 8px;vertical-align:top;">
                    <div style="${cardStyle}">
                      <span style="${pillStyle}background:#ffedd5;color:#c2410c;">Mortgages</span>
                      <h2 style="margin:12px 0 8px;font-size:20px;line-height:1.2;color:#020617;">Know your renewal window</h2>
                      <p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#475569;">Add your rate, balance and deal end date so LOOP can help compare current and future options.</p>
                      <a href="${mortgageUrl}" style="font-size:14px;font-weight:900;color:#2563eb;text-decoration:none;">Add mortgage details →</a>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td width="50%" style="padding:0 8px 16px 0;vertical-align:top;">
                    <div style="${cardStyle}">
                      <span style="${pillStyle}background:#ede9fe;color:#6d28d9;">Investments</span>
                      <h2 style="margin:12px 0 8px;font-size:20px;line-height:1.2;color:#020617;">Track pots, pies and cash</h2>
                      <p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#475569;">Connect a broker where supported or add holdings manually. Keep investments, ISA allowance and available cash visible.</p>
                      <a href="${investmentsUrl}" style="font-size:14px;font-weight:900;color:#2563eb;text-decoration:none;">Open investments →</a>
                    </div>
                  </td>
                  <td width="50%" style="padding:0 0 16px 8px;vertical-align:top;">
                    <div style="${cardStyle}">
                      <span style="${pillStyle}background:#e0f2fe;color:#0369a1;">Property</span>
                      <h2 style="margin:12px 0 8px;font-size:20px;line-height:1.2;color:#020617;">Compare moving options</h2>
                      <p style="margin:0 0 14px;font-size:14px;line-height:1.6;color:#475569;">Save listings, estimate running costs and compare affordability without changing your current-home view.</p>
                      <a href="${mortgageUrl}" style="font-size:14px;font-weight:900;color:#2563eb;text-decoration:none;">Explore property tools →</a>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:10px 34px 32px;background:#f8fafc;">
              <div style="background:#020617;border-radius:26px;padding:24px;color:#ffffff;">
                <p style="margin:0 0 10px;font-size:12px;font-weight:900;letter-spacing:.18em;text-transform:uppercase;color:#67e8f9;">Recommended first 10 minutes</p>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="font-size:15px;line-height:1.8;color:#e5e7eb;font-weight:700;">
                      1. Confirm your household<br>
                      2. Add home and mortgage/rate details<br>
                      3. Add savings providers you already use<br>
                      4. Connect or manually add investments when ready
                    </td>
                  </tr>
                </table>
                <div style="margin-top:18px;">
                  <a href="${dashboardUrl}" style="${buttonStyle}background:#ff5a14;color:#ffffff;">Start setup</a>
                  <a href="${integrationsUrl}" style="${buttonStyle}background:rgba(255,255,255,.10);color:#ffffff;border:1px solid rgba(255,255,255,.20);margin-left:8px;">Manage integrations</a>
                </div>
              </div>

              <p style="margin:22px 0 0;font-size:12px;line-height:1.7;color:#64748b;">You control what gets connected, imported and shared. LOOP separates source data from user-approved decisions and highlights confidence where it matters. This email was sent because your LOOP account was created or activated.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}

export async function sendWelcomeEmailForUser({ userId, email, name, authProvider, next, supabase: suppliedClient }: WelcomeArgs) {
  if (!userId || !email) return { sent: false, skipped: "Missing user id or email." };

  const supabase = suppliedClient || (hasSupabaseAdminKey() ? createAdminClient() : null);
  if (!supabase) return { sent: false, skipped: "No server client available for welcome email de-duplication." };

  const now = new Date().toISOString();

  const { data: profile, error: readError } = await supabase
    .from("app_user_profiles")
    .select("user_id, email, display_name, welcome_email_sent_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (readError) {
    // If the migration has not been run yet, do not send every login. Ask admin to run the SQL first.
    if (String(readError.message || "").toLowerCase().includes("welcome_email_sent_at")) {
      return { sent: false, skipped: "Run v28_22_social_login_welcome_email.sql before auto-sending welcome emails." };
    }
    return { sent: false, skipped: readError.message };
  }

  if (profile?.welcome_email_sent_at) {
    return { sent: false, skipped: "Welcome email already sent." };
  }

  await supabase.from("app_user_profiles").upsert({
    user_id: userId,
    email,
    display_name: profile?.display_name || name || null,
    signup_provider: authProvider || null,
    last_login_provider: authProvider || null,
    updated_at: now,
  }, { onConflict: "user_id" });

  const emailBody = buildWelcomeEmail({ name: name || profile?.display_name, email });
  const result = await sendTransactionalEmail({ to: email, ...emailBody });

  if (result.sent) {
    await supabase.from("app_user_profiles").update({
      welcome_email_sent_at: now,
      last_login_provider: authProvider || null,
      updated_at: now,
    }).eq("user_id", userId);
  }

  await supabase.from("app_email_runs").insert({
    user_id: userId,
    run_type: "manual",
    status: result.sent ? "sent" : "created",
    subject: emailBody.subject,
    preview_body: emailBody.text,
    send_to_email_hash: hashEmail(email),
    sent_at: result.sent ? now : null,
    error_message: result.skipped || null,
  }).then(() => null, () => null);

  return result;
}
