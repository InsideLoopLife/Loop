// A holding that has stopped trading (delisted, wound up, or no price for a
// month) is not removed by LOOP on its own. The person gets a notification
// asking whether to record what they paid as a one-off loss and archive it,
// so it stops counting towards their investments.
import type { SupabaseClient } from "@supabase/supabase-js";

export const WRITE_OFF_NOTIFICATION_TYPE = "investment_write_off_approval";

type HoldingForWriteOff = {
  id: string;
  user_id: string;
  household_id?: string | null;
  asset_name?: string | null;
  ticker?: string | null;
  units?: number | string | null;
  average_buy_price?: number | string | null;
  imported_invested_value?: number | string | null;
  price_quote_unit?: string | null;
  latest_price_date?: string | null;
};

/** What the person put in, in pounds: the loss if the holding is now worth nothing. */
export function amountPaidGbp(holding: HoldingForWriteOff) {
  const invested = Number(holding.imported_invested_value || 0);
  if (invested > 0) return invested;
  const units = Number(holding.units || 0);
  const average = Number(holding.average_buy_price || 0);
  const pence = String(holding.price_quote_unit || "").toLowerCase() === "gbx";
  const paid = units * average * (pence ? 0.01 : 1);
  return Number.isFinite(paid) && paid > 0 ? Math.round(paid * 100) / 100 : 0;
}

const pounds = (value: number) => `£${value.toLocaleString("en-GB", { minimumFractionDigits: value < 100 ? 2 : 0, maximumFractionDigits: value < 100 ? 2 : 0 })}`;

/** One notification per holding, ever (until it's answered and asked again). */
export async function notifyPossibleWriteOff(
  supabase: SupabaseClient,
  holdingId: string,
  reason: string,
) {
  try {
    const { data } = await supabase
      .from("investment_holdings")
      .select("id, user_id, household_id, asset_name, ticker, units, average_buy_price, imported_invested_value, price_quote_unit, latest_price_date, record_status")
      .eq("id", holdingId)
      .maybeSingle();
    if (!data || data.record_status === "archived") return;
    const holding = data as HoldingForWriteOff;
    const periodKey = `write-off:${holding.id}`;
    const { data: existing } = await supabase
      .from("app_notifications")
      .select("id")
      .eq("user_id", holding.user_id)
      .eq("period_key", periodKey)
      .limit(1);
    if (existing?.length) return;

    const name = holding.asset_name || holding.ticker || "A holding";
    const paid = amountPaidGbp(holding);
    const since = holding.latest_price_date
      ? new Date(`${String(holding.latest_price_date).slice(0, 10)}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
      : null;
    await supabase.from("app_notifications").insert({
      user_id: holding.user_id,
      household_id: holding.household_id ?? null,
      notification_type: WRITE_OFF_NOTIFICATION_TYPE,
      category: "wealth",
      channel: "in_app",
      status: "unread",
      severity: "warning",
      title: `${name} looks like it has stopped trading`,
      body: [
        reason,
        since ? `Its last price was on ${since}.` : null,
        paid > 0
          ? `You paid ${pounds(paid)}. Record that as a one-off loss and archive it, so it no longer counts in your investments?`
          : "Archive it so it no longer counts in your investments?",
      ].filter(Boolean).join(" "),
      cta_label: "Open investments",
      cta_href: "/investments",
      period_key: periodKey,
      metadata: { holding_id: holding.id, ticker: holding.ticker ?? null, loss_gbp: paid },
    });
  } catch (caught) {
    console.error(`[write-off] could not write notification for holding ${holdingId}`, caught);
  }
}

/** Archive the holding and keep what was paid as a one-off loss. */
export async function writeOffHolding(supabase: SupabaseClient, holdingId: string, userId: string) {
  const { data: holding, error } = await supabase
    .from("investment_holdings")
    .select("id, user_id, units, average_buy_price, imported_invested_value, price_quote_unit")
    .eq("id", holdingId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!holding || holding.user_id !== userId) throw new Error("That holding wasn't found.");
  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("investment_holdings")
    .update({
      record_status: "archived",
      archive_reason: "written_off",
      archived_at: now,
      written_off_at: now,
      written_off_loss_gbp: amountPaidGbp(holding as HoldingForWriteOff),
      price_polling_enabled: false,
      price_check_status: "inactive",
      updated_at: now,
    })
    .eq("id", holdingId);
  if (updateError) throw new Error(updateError.message);
}
