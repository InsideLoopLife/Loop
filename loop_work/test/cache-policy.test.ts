import assert from "node:assert/strict";
import test from "node:test";
import { isPublicOrAuthRoute, normaliseLoopPath, routePolicy } from "../lib/cache/route-policy";
import { routeArrivalDecision } from "../lib/cache/client-route-cache";

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

test("does not issue a duplicate refresh after a current first render", () => {
  assert.equal(routeArrivalDecision({ visited: false, previousCheck: 0, maxAgeMs: 60_000, now: 120_000 }), "accept-current");
  assert.equal(routeArrivalDecision({ visited: true, previousCheck: 100_000, maxAgeMs: 60_000, now: 120_000 }), "reuse-fresh");
  assert.equal(routeArrivalDecision({ visited: true, previousCheck: 10_000, maxAgeMs: 60_000, now: 120_000 }), "refresh-after-paint");
});
