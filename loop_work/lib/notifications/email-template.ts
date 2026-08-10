// Shared visual shell for transactional emails, so a sign-up code or a
// password-reset code looks like it came from the same product as the
// welcome email — not a plain unstyled system message.
//
// Pulled out of welcome.ts's gradient header / white card / dark footer
// pattern rather than invented fresh, so anything sent through this stays
// visually consistent with the one email that was already properly
// branded.

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function baseUrl() {
  return (process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
}

const buttonStyle = "display:inline-block;text-decoration:none;border-radius:999px;padding:14px 22px;font-size:14px;font-weight:900;";

export type BrandedEmailArgs = {
  /** Hidden preview text shown in inbox lists before the email is opened. */
  preheader: string;
  /** Small uppercase label above the heading, e.g. "Create account". */
  eyebrow: string;
  /** The big headline in the gradient header. */
  heading: string;
  /** Raw HTML for the message body, rendered inside the white card.
   *  Caller is responsible for escaping any user-supplied values. */
  bodyHtml: string;
  /** Optional call-to-action button in the dark footer band. */
  cta?: { label: string; href: string };
  /** Small print at the very bottom, e.g. "If you didn't request this...". */
  footerNote?: string;
};

export function renderBrandedEmail({ preheader, eyebrow, heading, bodyHtml, cta, footerNote }: BrandedEmailArgs) {
  const appUrl = baseUrl();

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="x-apple-disable-message-reformatting">
  <title>${escapeHtml(heading)}</title>
</head>
<body style="margin:0;padding:0;background:#eaf1f8;font-family:Inter,Arial,Helvetica,sans-serif;color:#0f172a;-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}</div>

  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eaf1f8;margin:0;padding:28px 14px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:30px;overflow:hidden;border:1px solid #dbe6f2;box-shadow:0 24px 70px rgba(15,23,42,.16);">
          <tr>
            <td style="background:linear-gradient(135deg,#020617 0%,#073b3a 44%,#ff5a14 100%);padding:32px 32px 28px;color:#ffffff;">
              <div style="font-size:12px;font-weight:900;letter-spacing:.28em;text-transform:uppercase;color:#7dd3fc;">LOOP</div>
              <div style="margin-top:10px;font-size:12px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#dbeafe;opacity:.85;">${escapeHtml(eyebrow)}</div>
              <h1 style="margin:10px 0 0;font-size:28px;line-height:1.15;font-weight:950;color:#ffffff;">${escapeHtml(heading)}</h1>
            </td>
          </tr>

          <tr>
            <td style="padding:30px 32px 28px;background:#ffffff;">
              ${bodyHtml}
              ${cta ? `<div style="margin-top:22px;"><a href="${cta.href}" style="${buttonStyle}background:#020617;color:#ffffff;">${escapeHtml(cta.label)}</a></div>` : ""}
            </td>
          </tr>

          <tr>
            <td style="padding:0 32px 30px;background:#ffffff;">
              <div style="height:1px;background:#e2e8f0;margin-bottom:18px;"></div>
              <p style="margin:0;font-size:12px;line-height:1.7;color:#64748b;">${footerNote ? footerNote : "If you didn't request this, you can safely ignore this email."}</p>
              <p style="margin:10px 0 0;font-size:12px;color:#94a3b8;">Loop · <a href="${appUrl}" style="color:#94a3b8;">${appUrl.replace(/^https?:\/\//, "")}</a></p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** For the very common "here's your N-digit code" shape. */
export function renderCodeEmailBody({ intro, code, expiryMinutes }: { intro: string; code: string; expiryMinutes: number }) {
  return `<p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#334155;font-weight:600;">${intro}</p>
<p style="margin:0 0 18px;font-size:34px;font-weight:950;letter-spacing:6px;color:#020617;">${escapeHtml(code)}</p>
<p style="margin:0;font-size:13px;line-height:1.6;color:#64748b;">This code expires in ${expiryMinutes} minutes.</p>`;
}
