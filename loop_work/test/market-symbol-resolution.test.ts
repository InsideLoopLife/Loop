import assert from "node:assert/strict";
import test from "node:test";
import {
  validateVerifiedFundQuote,
  verifiedYahooFundSymbol,
} from "../lib/investments/verified-fund-symbols";

test("maps Vanguard LifeStrategy 80% Acc to its own Yahoo fund quote", () => {
  const symbol = verifiedYahooFundSymbol("GB00B4PQW151");
  assert.equal(symbol, "0P0000TKZM.L");
  assert.notEqual(symbol, "0P0000TKZO.L");
});

test("accepts the correct LifeStrategy 80 provider identity", () => {
  const result = validateVerifiedFundQuote(
    "GB00B4PQW151",
    "Vanguard LifeStrategy 80% Equity Fund A Acc",
    "0P0000TKZM.L",
  );
  assert.equal(result.status, "verified");
});

test("rejects a valid quote belonging to LifeStrategy 100", () => {
  const result = validateVerifiedFundQuote(
    "GB00B4PQW151",
    "Vanguard LifeStrategy 100% Equity Fund A Acc",
    "0P0000TKZO.L",
  );
  assert.equal(result.status, "conflict");
});

test("fails closed when a known provider fund has no verifiable name", () => {
  const result = validateVerifiedFundQuote(
    "0P0000TKZM.L",
    "",
    "0P0000TKZM.L",
  );
  assert.equal(result.status, "conflict");
});
