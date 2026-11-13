"use server";

// Saves a figure someone has just checked with the provider: a student loan or
// mortgage balance, a pension value, or a confirmed new price for a bill.
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveHouseholdContext } from "@/lib/auth/household-context";
import { applyPriceChange } from "@/app/financial-flow/price-watch-actions";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function refresh() {
  for (const path of ["/dashboard", "/income", "/mortgage", "/investments", "/financial-flow", "/spending"]) revalidatePath(path);
}

export type CheckedFigure = {
  kind: "student_loan" | "mortgage" | "pension" | "price_confirm";
  recordId: string;
  amount: number;
  /** Date the figure is correct on. Defaults to today. */
  asOf?: string | null;
  lastPaymentDate?: string | null;
  /** Price changes: when the new amount starts. */
  effective?: string | null;
  watchKey?: string | null;
};

export async function saveCheckedFigure(input: CheckedFigure) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Please sign in again.");
  const amount = Math.round(Number(input.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount < 0 || amount > 100_000_000) throw new Error("That amount doesn't look right.");
  const today = new Date().toISOString().slice(0, 10);
  const asOf = input.asOf && ISO.test(input.asOf) ? input.asOf : today;
  if (asOf > today) throw new Error("The date can't be in the future.");
  if (input.lastPaymentDate && !ISO.test(input.lastPaymentDate)) throw new Error("That payment date doesn't look right.");
  const household = await getActiveHouseholdContext(supabase, user);

  if (input.kind === "student_loan") {
    const { data: account, error } = await supabase.from("student_loan_accounts").select("id, person_id, current_balance").eq("id", input.recordId).maybeSingle();
    if (error || !account) throw new Error("Couldn't find that student loan.");
    const { error: upErr } = await supabase.from("student_loan_accounts").update({ current_balance: amount, balance_date: asOf, updated_at: new Date().toISOString() } as any).eq("id", account.id);
    if (upErr) throw new Error(upErr.message);
    const change = Math.round((amount - Number(account.current_balance || 0)) * 100) / 100;
    await supabase.from("student_loan_balance_events").insert({
      student_loan_account_id: account.id,
      user_id: user.id,
      household_id: household.householdId || null,
      person_id: account.person_id,
      event_type: "balance_check",
      amount: change,
      balance_after: amount,
      effective_at: asOf,
      note: input.lastPaymentDate ? `Checked with the Student Loans Company · last repayment ${input.lastPaymentDate}` : "Checked with the Student Loans Company",
    } as any);
  } else if (input.kind === "mortgage") {
    const changes: Record<string, unknown> = { balance: amount, balance_as_of_date: asOf };
    // The last payment's day of the month is the payment day from now on.
    if (input.lastPaymentDate) changes.payment_day_of_month = Number(input.lastPaymentDate.slice(8, 10));
    const { error } = await supabase.from("home_mortgage_deals").update(changes as any).eq("id", input.recordId);
    if (error) throw new Error(error.message);
  } else if (input.kind === "pension") {
    const { error } = await supabase.from("pension_accounts").update({ current_value: amount, value_as_of_date: asOf } as any).eq("id", input.recordId);
    if (error) throw new Error(error.message);
  } else if (input.kind === "price_confirm") {
    if (!input.effective || !ISO.test(input.effective)) throw new Error("When does the new price start?");
    if (!input.watchKey) throw new Error("Missing which price this is.");
    await confirmPlannedPrice(supabase, input.recordId, amount, input.effective);
    // Record the heads-up as answered, and as confirmed so it isn't asked again.
    for (const key of [input.watchKey, `confirmed:${input.watchKey}`]) {
      const { error } = await supabase.from("bill_price_watch").upsert({
        user_id: user.id,
        household_id: household.householdId ?? null,
        planned_item_id: input.recordId,
        watch_key: key,
        response: "applied",
        value: String(amount),
      } as any, { onConflict: "user_id,watch_key" });
      if (error) throw new Error(error.message);
    }
  } else {
    throw new Error("Unknown figure.");
  }
  refresh();
}

/**
 * Replace an estimated price with the confirmed one. The estimate was saved as
 * its own line starting on the change date (same label), so update that line;
 * if there isn't one, add the change the normal way.
 */
async function confirmPlannedPrice(supabase: any, itemId: string, amount: number, effective: string) {
  const { data: item } = await supabase.from("planned_items").select("id, label, person_id, user_id").eq("id", itemId).maybeSingle();
  if (!item) throw new Error("Couldn't find that bill.");
  const { data: siblings } = await supabase
    .from("planned_items")
    .select("id, start_date, end_date")
    .eq("label", item.label)
    .eq("user_id", item.user_id)
    .order("start_date", { ascending: false });
  // The line that's in force on the start date, or one starting that month.
  const covering = (siblings || []).find((row: any) => row.start_date <= effective && (!row.end_date || row.end_date >= effective) && row.start_date.slice(0, 7) === effective.slice(0, 7))
    || (siblings || []).find((row: any) => row.id !== itemId && row.start_date <= effective && (!row.end_date || row.end_date >= effective));
  if (covering) {
    const { error } = await supabase.from("planned_items").update({ amount }).eq("id", covering.id);
    if (error) throw new Error(error.message);
    return;
  }
  await applyPriceChange({ key: `confirmed-direct:${itemId}:${effective}`, itemId, newAmount: amount, effective });
}
