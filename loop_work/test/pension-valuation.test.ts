import assert from "node:assert/strict";
import test from "node:test";
import {
  pensionAccountValue,
  totalPensionValue,
} from "../lib/investments/pension-valuation";

test("uses child funds instead of adding them to their parent pension pot", () => {
  const accounts = [
    { id: "lg", current_value: 85_729.48 },
    { id: "pensionbee", current_value: 0 },
  ];
  const funds = [
    { pension_account_id: "lg", current_value: 82_126.44 },
    { pension_account_id: "pensionbee", current_value: 8_829 },
  ];

  assert.equal(pensionAccountValue(accounts[0], funds), 82_126.44);
  assert.equal(totalPensionValue(accounts, funds), 90_955.44);
});

test("falls back to the provider pot value when no usable child fund exists", () => {
  assert.equal(
    totalPensionValue(
      [{ id: "provider-pot", current_value: 12_345 }],
      [{ pension_account_id: "provider-pot", current_value: 0 }],
    ),
    12_345,
  );
});

test("keeps an orphaned fund visible without double counting known accounts", () => {
  assert.equal(
    totalPensionValue(
      [{ id: "known", current_value: 100 }],
      [
        { pension_account_id: "known", current_value: 90 },
        { pension_account_id: "missing", current_value: 10 },
      ],
    ),
    100,
  );
});

