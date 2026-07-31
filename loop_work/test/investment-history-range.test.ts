import assert from "node:assert/strict";
import test from "node:test";
import {
  bucketIntervalForRange,
  historySpansSelectedRange,
  yahooIntervalForChart,
  yahooRangeForChart,
} from "../lib/investments/history-range";

const NOW = Date.parse("2026-07-30T18:00:00.000Z");

test("maps every chart range to the cron worker's stored interval", () => {
  assert.deepEqual(
    ["1d", "5d", "1m", "6m", "ytd", "1y", "5y", "max"].map((range) => [
      range,
      bucketIntervalForRange(range),
    ]),
    [
      ["1d", "1m"],
      ["5d", "30m"],
      ["1m", "60m"],
      ["6m", "1d"],
      ["ytd", "1d"],
      ["1y", "1wk"],
      ["5y", "1mo"],
      ["max", "1mo"],
    ],
  );
});

test("rejects same-day snapshots for a six-month chart", () => {
  const points = [
    { at: "2026-07-30T08:00:00.000Z" },
    { at: "2026-07-30T16:00:00.000Z" },
  ];
  assert.equal(
    historySpansSelectedRange(
      points,
      "6m",
      "2026-01-28T18:00:00.000Z",
      NOW,
    ),
    false,
  );
});

test("accepts daily history that genuinely spans a six-month selection", () => {
  const points = [
    { at: "2026-01-29T16:00:00.000Z" },
    { at: "2026-07-30T16:00:00.000Z" },
  ];
  assert.equal(
    historySpansSelectedRange(
      points,
      "6m",
      "2026-01-28T18:00:00.000Z",
      NOW,
    ),
    true,
  );
});

test("uses Yahoo's reliable five-day minute window for the 1D chart", () => {
  assert.equal(yahooRangeForChart("1d"), "5d");
  assert.equal(yahooIntervalForChart("1d"), "1m");
});
