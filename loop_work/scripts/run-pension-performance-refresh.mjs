const baseUrl = String(process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
const secret = String(process.env.CRON_SECRET || process.env.LOOP_CRON_SECRET || "").trim();
const url = new URL("/api/cron/pension-performance-refresh", baseUrl);
const response = await fetch(url, {
  headers: secret ? { authorization: `Bearer ${secret}` } : {},
  signal: AbortSignal.timeout(15 * 60 * 1000),
});
const text = await response.text();
let body;
try { body = JSON.parse(text); } catch { body = { raw: text }; }
console.log(JSON.stringify({ ok: response.ok, status: response.status, body }, null, 2));
if (!response.ok) process.exitCode = 1;
