#!/usr/bin/env node

const baseUrl = process.env.LOOP_APP_URL || process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
const secret = process.env.LOOP_CRON_SECRET || process.env.CRON_SECRET;
const limit = process.env.LOOP_PRICE_REFRESH_LIMIT || "20";
const delayMs = process.env.LOOP_PRICE_REFRESH_DELAY_MS || "750";

if (!secret) {
  console.error("Missing LOOP_CRON_SECRET or CRON_SECRET.");
  process.exit(1);
}

const url = `${baseUrl.replace(/\/$/, "")}/api/cron/product-price-refresh?limit=${encodeURIComponent(limit)}&delay_ms=${encodeURIComponent(delayMs)}`;

const response = await fetch(url, {
  headers: { authorization: `Bearer ${secret}` },
});

const text = await response.text();
if (!response.ok) {
  console.error(text);
  process.exit(1);
}

console.log(text);
