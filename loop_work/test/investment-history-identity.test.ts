import assert from "node:assert/strict";
import test from "node:test";
import { snapshotMatchesCurrentIdentity } from "../lib/investments/history-identity";

test("rejects snapshots from a listing that was replaced by a corrected fund mapping", () => {
  const holdings = new Map([
    ["holding-1", { id: "holding-1", listing_id: "lifestrategy-80" }],
  ]);
  assert.equal(
    snapshotMatchesCurrentIdentity(
      { holding_id: "holding-1", listing_id: "old-wrong-fund" },
      holdings,
    ),
    false,
  );
  assert.equal(
    snapshotMatchesCurrentIdentity(
      { holding_id: "holding-1", listing_id: "lifestrategy-80" },
      holdings,
    ),
    true,
  );
});

test("legacy unlinked holdings only accept legacy unlinked snapshots", () => {
  const holdings = new Map([["holding-2", { id: "holding-2" }]]);
  assert.equal(snapshotMatchesCurrentIdentity({ holding_id: "holding-2" }, holdings), true);
  assert.equal(
    snapshotMatchesCurrentIdentity(
      { holding_id: "holding-2", listing_id: "another-listing" },
      holdings,
    ),
    false,
  );
});
