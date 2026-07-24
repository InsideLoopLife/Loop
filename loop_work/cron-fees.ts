import dotenv from "dotenv";

// Next.js loads .env.local/.env automatically inside `next dev`/`next start`,
// but this script runs standalone via tsx on Render, so load it explicitly.
dotenv.config({ path: ".env.local" });
dotenv.config();

import { runStaleFeeVerification, backfillMissingIsins } from "./lib/investments/pension-fee-refresher";
import { refreshPensionFundPrices } from "./lib/investments/pension-price-refresher";

async function runAllJobs() {
  console.log("Starting scheduled background jobs...");
  let hadFailure = false;

  console.log("--- Running ISIN Backfill ---");
  try {
    const isinRes = await backfillMissingIsins();
    console.log("ISIN backfill finished:", isinRes);
    if (isinRes.ok === false) hadFailure = true;
  } catch (err) {
    console.error("ISIN backfill crashed:", err);
    hadFailure = true;
  }

  console.log("--- Running Fee Verification ---");
  try {
    const feeRes = await runStaleFeeVerification();
    console.log("Fee verification finished:", feeRes);
    if (feeRes.ok === false) hadFailure = true;
  } catch (err) {
    console.error("Fee verification crashed:", err);
    hadFailure = true;
  }

  console.log("--- Running Price Refresh ---");
  try {
    const priceRes = await refreshPensionFundPrices();
    console.log("Price refresh finished:", priceRes);
    if (priceRes.ok === false) hadFailure = true;
  } catch (err) {
    console.error("Price refresh crashed:", err);
    hadFailure = true;
  }

  process.exit(hadFailure ? 1 : 0);
}

runAllJobs();
