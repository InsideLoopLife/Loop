import assert from "node:assert/strict";
import test from "node:test";
import { classifyIsaWrapper, isaAllowanceLimitForPerson, isaPersonEligibility, ukTaxYear } from "../lib/wealth/isa-allowance";
import { planSavingsMaintenance } from "../lib/wealth/savings-schedule";
import { savingsDealMatchesAccount } from "../lib/wealth/savings-intelligence";

test("keeps adult and Junior ISA eligibility separate", () => {
  const adult = { relationship: "self", birth_date: "1992-01-05" };
  const child = { relationship: "child", birth_date: "2022-01-01" };
  assert.equal(isaPersonEligibility(adult, classifyIsaWrapper("Junior Cash ISA"), "2026-08-07").eligible, false);
  assert.equal(isaPersonEligibility(child, classifyIsaWrapper("Junior Cash ISA"), "2026-08-07").eligible, true);
  assert.equal(isaPersonEligibility(child, classifyIsaWrapper("Cash ISA"), "2026-08-07").eligible, false);
});

test("uses versioned UK ISA limits", () => {
  const adult = { relationship: "self", birth_date: "1992-01-05" };
  const child = { relationship: "child", birth_date: "2022-01-01" };
  assert.equal(ukTaxYear("2026-08-07"), "2026/27");
  assert.equal(isaAllowanceLimitForPerson(adult, "cash_isa", "2026/27"), 20_000);
  assert.equal(isaAllowanceLimitForPerson(adult, "cash_isa", "2027/28"), 12_000);
  assert.equal(isaAllowanceLimitForPerson(child, "junior_cash_isa", "2026/27"), 9_000);
});

test("the savings matcher rejects ISA products for the wrong owner", () => {
  const adultAccount = { id: "adult", current_balance: 5_000, account_type: "savings", owner_relationship: "self", owner_birth_date: "1992-01-05" };
  const childAccount = { id: "child", current_balance: 1_000, account_type: "savings", owner_relationship: "child", owner_birth_date: "2022-01-01", owner_is_child: true };
  const juniorDeal = { id: "junior-deal", provider_name: "Bank", product_name: "Junior Cash ISA", account_type: "cash_isa", gross_aer: 5 };
  const adultDeal = { id: "adult-deal", provider_name: "Bank", product_name: "Cash ISA", account_type: "cash_isa", gross_aer: 5 };
  assert.equal(savingsDealMatchesAccount(adultAccount, juniorDeal), false);
  assert.equal(savingsDealMatchesAccount(childAccount, juniorDeal), true);
  assert.equal(savingsDealMatchesAccount(childAccount, adultDeal), false);
});

test("backfills each due top-up and completed interest month only once", () => {
  const account = {
    id: "11111111-1111-4111-8111-111111111111",
    user_id: "22222222-2222-4222-8222-222222222222",
    current_balance: 1_000,
    opening_balance_assumption: 1_000,
    interest_rate: 6,
    interest_accrual_frequency: "daily",
    interest_compounding_frequency: "monthly",
    monthly_top_up_amount: 100,
    top_up_day: 6,
    start_date: "2026-06-01",
    created_at: "2026-06-01T00:00:00Z",
  };
  const first = planSavingsMaintenance(account, [], "2026-08-07");
  assert.deepEqual(first.filter((row) => row.source_type === "scheduled_top_up").map((row) => row.effective_at), ["2026-06-06", "2026-07-06", "2026-08-06"]);
  assert.deepEqual(first.filter((row) => row.source_type === "modelled_interest").map((row) => row.effective_at), ["2026-06-30", "2026-07-31"]);
  assert.equal(planSavingsMaintenance(account, first, "2026-08-07").length, 0);
});
