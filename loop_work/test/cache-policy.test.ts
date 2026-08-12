import assert from "node:assert/strict";
import test from "node:test";
import { isPublicOrAuthRoute, normaliseLoopPath, routePolicy } from "../lib/cache/route-policy";

test("uses short refresh windows for investments and core money pages", () => {
  assert.equal(routePolicy("/investments").maxAgeMs, 30_000);
  assert.equal(routePolicy("/financial-flow?tab=spending").maxAgeMs, 60_000);
  assert.equal(routePolicy("/accounts").maxAgeMs, 60_000);
});

test("uses slower refresh windows for stable account and property data", () => {
  assert.equal(routePolicy("/account").maxAgeMs, 300_000);
  assert.equal(routePolicy("/mortgage").maxAgeMs, 300_000);
});

test("normalises paths and excludes authentication routes", () => {
  assert.equal(normaliseLoopPath("/accounts/?tab=pots"), "/accounts");
  assert.equal(isPublicOrAuthRoute("/login"), true);
  assert.equal(isPublicOrAuthRoute("/dashboard"), false);
});

