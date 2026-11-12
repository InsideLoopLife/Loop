// The site's own address for links in emails, invites and QR codes. Uses the
// configured address when set; in production it never falls back to
// localhost, which would send people a link that can't open.
export const APP_FALLBACK_URL = process.env.NODE_ENV === "production" ? "https://loop-web-jf7p.onrender.com" : "http://localhost:3000";

export function appBaseUrl() {
  return (process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || APP_FALLBACK_URL).replace(/\/$/, "");
}
