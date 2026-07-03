const appUrl = process.env.LOOP_APP_URL || process.env.NEXT_PUBLIC_ADMIN_URL || "http://localhost:3000";
const secret = process.env.LOOP_CRON_SECRET;

if (!secret) {
  console.error("LOOP_CRON_SECRET is required.");
  process.exit(1);
}

const url = new URL("/api/cron/money-deals-daily", appUrl);
url.searchParams.set("limit", process.env.LOOP_MONEY_DAILY_LIMIT || "75");
url.searchParams.set("delay_ms", process.env.LOOP_MONEY_DAILY_DELAY_MS || "1000");

const res = await fetch(url, {
  headers: {
    authorization: `Bearer ${secret}`,
  },
});

const text = await res.text();
console.log(text);

if (!res.ok) process.exit(1);
