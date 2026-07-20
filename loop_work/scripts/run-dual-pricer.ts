/**
 * ============================================================================
 * STANDALONE WORKER EXECUTION SCRIPT
 * Run via: npx ts-node loop_work/scripts/run-dual-pricer.ts
 * ============================================================================
 */
import { getFreshestQuote, PriceQuote } from '../lib/investments/dual-source-pricer';

// Add the symbols you want your worker to track here
const WATCHLIST = ['G4M.L', 'LLOY.L', 'SHEL.L', 'TSLA', 'BTC-USD'];

async function runWorker() {
  console.log(`\n[Price Worker] Starting dual-source fetch cycle at ${new Date().toISOString()}`);
  console.log('='.repeat(70));

  const results: Record<string, PriceQuote | { error: string }> = {};

  for (const ticker of WATCHLIST) {
    process.stdout.write(`Fetching ${ticker.padEnd(10)} -> `);
    try {
      const quote = await getFreshestQuote(ticker, { timeoutMs: 5000 });
      results[ticker] = quote;
      
      const delayTag = quote.isDelayed ? `(~${quote.delayMinutes}m delay)` : '(Real-time)';
      console.log(`SUCCESS | ${quote.price.toFixed(2).padStart(8)} ${quote.currency} | Source: ${quote.source.toUpperCase().padEnd(6)} ${delayTag}`);
    } catch (error: any) {
      results[ticker] = { error: error.message };
      console.log(`FAILED  | ${error.message.split('\n')[0]}`);
    }
  }

  console.log('='.repeat(70));
  console.log('[Price Worker] Cycle complete.\n');
}

// Execute the worker
runWorker().catch((err) => {
  console.error('Fatal worker error:', err);
  process.exit(1);
});
