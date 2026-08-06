import assert from "node:assert/strict";
import test from "node:test";
import {
  marketDataQuality,
  quoteObservationTime,
} from "../lib/investments/market-data-quality";

test("classifies Alpaca IEX as realtime", () => {
  assert.equal(marketDataQuality("market-data:Alpaca:GOOGL").kind, "realtime");
});

test("uses Yahoo's declared cadence instead of assuming all Yahoo quotes are delayed", () => {
  assert.equal(marketDataQuality("market-data:Yahoo 1-minute market feed:GOOGL").kind, "minute");
  assert.equal(marketDataQuality("market-data:Yahoo 1-minute market feed · 15m exchange delay:G4M.L").kind, "delayed");
  assert.equal(marketDataQuality("market-data:Yahoo delayed/EOD:G4M.L").kind, "delayed");
  assert.equal(marketDataQuality("https://finance.yahoo.com/quote/GOOGL").kind, "unknown");
  assert.equal(marketDataQuality("market-data:Stooq delayed/EOD:thg.uk").kind, "eod");
});

test("uses the provider observation time when it is valid", () => {
  assert.equal(
    quoteObservationTime("2026-08-06T12:34:56Z", "2026-08-06T12:35:00Z"),
    "2026-08-06T12:34:56.000Z",
  );
  assert.equal(
    quoteObservationTime("invalid", "2026-08-06T12:35:00Z"),
    "2026-08-06T12:35:00Z",
  );
});
