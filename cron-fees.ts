// cron-fees.ts (at root)
import { runStaleFeeVerification } from "./lib/investments/pension-fee-refresher";
// Assuming you add backfillMissingIsins to the same refresher file:
import { backfillMissingIsins } from "./lib/investments/pension-fee-refresher"; 
import dotenv from "dotenv";

// 1. Force load the .env file because Next.js isn't doing it for us here
dotenv.config({ path: ".env.local" }); 
dotenv.config(); 

async function runAllJobs() {
  console.log("Starting scheduled background jobs...");

  try {
    // 2. Run the ISIN scraper you asked for
    console.log("--- Running ISIN Backfill ---");
    await backfillMissingIsins();

    // 3. Run the fee verification
    console.log("--- Running Fee Verification ---");
    const feeRes = await runStaleFeeVerification();
    console.log("Fee verification finished:", feeRes);

    process.exit(0);
  } catch (err) {
    console.error("A background job crashed:", err);
    process.exit(1);
  }
}

runAllJobs();
