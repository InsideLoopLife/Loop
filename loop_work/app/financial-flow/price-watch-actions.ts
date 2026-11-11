"use server";

// Answers to price-change heads-ups, and "add it to my plan", which changes a
// bill's amount from the date the new price starts (keeping the old amount
// before it, so past months stay right).
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getActiveHouseholdContext } from "@/lib/auth/household-context";

const RESPONSES = ["applied", "dismissed", "fixed", "variable", "service"] as const;

function refresh() {
  revalidatePath("/financial-flow");
  revalidatePath("/spending");
  revalidatePath("/dashboard");
}

async function record(supabase: any, userId: string, householdId: string | null, input: { key: string; itemId: string | null; response: string; value?: string | null; fixedUntil?: string | null }) {
  const { error } = await supabase.from("bill_price_watch").upsert({
    user_id: userId,
    household_id: householdId,
    planned_item_id: input.itemId,
    watch_key: input.key,
    response: input.response,
    value: input.value ?? null,
    fixed_until: input.fixedUntil ?? null,
  }, { onConflict: "user_id,watch_key" });
  if (error) throw new Error(/does not exist|schema cache/i.test(error.message) ? "LOOP can't save this answer yet. It needs a small database update." : error.message);
}

export async function respondPriceWatch(input: { key: string; itemId: string | null; response: string; value?: string | null; fixedUntil?: string | null }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Please sign in again.");
  if (!RESPONSES.includes(input.response as any)) throw new Error("Unknown answer.");
  if (input.fixedUntil && !/^\d{4}-\d{2}-\d{2}$/.test(input.fixedUntil)) throw new Error("That date doesn't look right.");
  const household = await getActiveHouseholdContext(supabase, user);
  // A service or tariff answer is about the bill, not one alert: key it per bill.
  const key = input.response === "service" ? `service:${input.itemId}` : input.response === "fixed" || input.response === "variable" ? `energy-tariff:${input.itemId}` : input.key;
  await record(supabase, user.id, household.householdId ?? null, { ...input, key });
  refresh();
}

/** Put a price change into the plan from its start date. */
export async function applyPriceChange(input: { key: string; itemId: string; newAmount: number; effective: string }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Please sign in again.");
  const amount = Math.round(Number(input.newAmount) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000) throw new Error("That amount doesn't look right.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effective)) throw new Error("That date doesn't look right.");
  const household = await getActiveHouseholdContext(supabase, user);

  const { data: item, error } = await supabase.from("planned_items").select("*").eq("id", input.itemId).maybeSingle();
  if (error || !item) throw new Error("Couldn't find that bill.");
  const { id: _id, created_at: _c, updated_at: _u, ...rest } = item as Record<string, any>;
  const effective = input.effective;
  const dayBefore = new Date(new Date(`${effective}T12:00:00`).getTime() - 86400000).toISOString().slice(0, 10);

  if (effective <= item.start_date) {
    const { error: upErr } = await supabase.from("planned_items").update({ amount }).eq("id", item.id);
    if (upErr) throw new Error(upErr.message);
  } else if (item.end_date && item.end_date < effective) {
    // The bill's plan has ended (council tax for the year): add next year's.
    const span = new Date(`${item.end_date}T12:00:00`).getTime() - new Date(`${item.start_date}T12:00:00`).getTime();
    const start = `${effective.slice(0, 8)}${String(item.day_of_month || Number(item.start_date.slice(8, 10))).padStart(2, "0")}`;
    const end = new Date(new Date(`${start}T12:00:00`).getTime() + span).toISOString().slice(0, 10);
    const { error: insErr } = await supabase.from("planned_items").insert({ ...rest, amount, start_date: start, end_date: end });
    if (insErr) throw new Error(insErr.message);
  } else {
    const { error: endErr } = await supabase.from("planned_items").update({ end_date: dayBefore }).eq("id", item.id);
    if (endErr) throw new Error(endErr.message);
    const { error: insErr } = await supabase.from("planned_items").insert({ ...rest, amount, start_date: effective, end_date: item.end_date });
    if (insErr) {
      await supabase.from("planned_items").update({ end_date: item.end_date }).eq("id", item.id);
      throw new Error(insErr.message);
    }
  }
  await record(supabase, user.id, household.householdId ?? null, { key: input.key, itemId: item.id, response: "applied", value: String(amount) }).catch(() => undefined);
  refresh();
}
