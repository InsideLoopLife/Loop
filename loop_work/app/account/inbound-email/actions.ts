"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { buildMoveAssumptions, fetchSourceText, parseMoveListingFromSource } from "@/lib/wealth/source-ingestion";
import { getActiveHouseholdContext } from "@/lib/auth/household-context";

async function requireUser() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const householdContext = await getActiveHouseholdContext(supabase, user).catch(() => ({ dataOwnerUserId: user.id }));
  return { supabase, user, dataOwnerUserId: householdContext.dataOwnerUserId || user.id };
}

export async function claimInboundAlias(formData: FormData) {
  const { supabase } = await requireUser();
  const requested = String(formData.get("alias") || "").trim() || null;
  const { data, error } = await supabase.rpc("loop_claim_inbound_alias", { p_alias: requested });
  if (error) throw new Error(error.message);
  if ((data as any)?.ok === false) throw new Error((data as any)?.message || "Could not claim alias.");
  revalidatePath("/account/inbound-email");
}

export async function approveInboundImport(formData: FormData) {
  const { supabase, user, dataOwnerUserId } = await requireUser();
  const id = String(formData.get("id") || "");
  if (!id) throw new Error("Missing import id");

  const { data: item, error: readError } = await supabase
    .from("loop_inbound_imports")
    .select("id,user_id,import_kind,source_value,status")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (readError) throw new Error(readError.message);
  if (!item) throw new Error("Import not found");
  if (!["needs_review", "ready", "error"].includes(String(item.status))) throw new Error("This import has already been handled.");

  if (item.import_kind === "property_url") {
    const url = String(item.source_value || "").trim();
    const { data: existing } = await supabase
      .from("property_move_queries")
      .select("id")
      .eq("user_id", dataOwnerUserId)
      .eq("property_url", url)
      .maybeSingle();

    if (existing?.id) {
      await supabase.from("loop_inbound_imports").update({ status: "imported", imported_at: new Date().toISOString(), reviewed_at: new Date().toISOString(), parsed_json: { existing_property_move_query_id: existing.id } }).eq("id", id).eq("user_id", user.id);
    } else {
      let parsed: ReturnType<typeof parseMoveListingFromSource> | null = null;
      let ingestionError: string | null = null;
      try {
        const source = await fetchSourceText(url);
        parsed = parseMoveListingFromSource({ sourceUrl: source.url, text: source.text, fallbackTitle: "Inbound property search" });
      } catch (error: any) {
        ingestionError = error?.message || "Could not ingest listing URL.";
      }
      const askingPrice = parsed?.askingPrice ?? 0;
      const assumptions = buildMoveAssumptions({ askingPrice, targetDeposit: 0, expectedRate: 4.75, expectedTermYears: 30, epcRating: parsed?.epcRating || "" });
      const { data: created, error: insertError } = await supabase.from("property_move_queries").insert({
        user_id: dataOwnerUserId,
        title: parsed?.title || "Inbound property search",
        property_url: url,
        asking_price: askingPrice || null,
        postcode: parsed?.postcode || null,
        address_hint: parsed?.addressHint || null,
        bedrooms: parsed?.bedrooms ?? null,
        council_tax_band: parsed?.councilTaxBand || null,
        epc_rating: parsed?.epcRating || null,
        epc_energy_cost_estimate_annual: assumptions.energyAnnual,
        expected_heating_cost_monthly: assumptions.heatingMonthly,
        stamp_duty_estimate: assumptions.stampDutyEstimate,
        moving_cost_estimate: assumptions.movingCostEstimate,
        expected_mortgage_balance: assumptions.expectedMortgageBalance,
        expected_rate: 4.75,
        expected_term_years: 30,
        expected_payment: assumptions.expectedPayment,
        source_status: parsed?.sourceStatus || (ingestionError ? "inbound_url_needs_review" : "inbound_url_partial"),
        notes: "Created from Email-to-LOOP inbound import.",
        payload: { created_from: "inbound_email", inbound_import_id: id, ingestion_error: ingestionError, parsed_summary: parsed?.sourceSummary || null, needs_enrichment: Boolean(ingestionError) },
      }).select("id").single();
      if (insertError) throw new Error(insertError.message);
      await supabase.from("loop_inbound_imports").update({ status: "imported", imported_at: new Date().toISOString(), reviewed_at: new Date().toISOString(), parsed_json: { property_move_query_id: created?.id, ingestion_error: ingestionError } }).eq("id", id).eq("user_id", user.id);
    }
  } else if (item.import_kind === "investment_ticker") {
    // Tickers are intentionally staged into a ready state rather than creating a holding with fake units/value.
    // The investment screen can consume this and run quote analysis before the user decides what to do.
    await supabase.from("loop_inbound_imports").update({ status: "ready", reviewed_at: new Date().toISOString(), parsed_json: { ticker: item.source_value, next_step: "open_investment_quote_check" } }).eq("id", id).eq("user_id", user.id);
  } else {
    throw new Error("Unsupported import type");
  }

  revalidatePath("/account/inbound-email");
  revalidatePath("/mortgage");
  revalidatePath("/investments");
}

export async function rejectInboundImport(formData: FormData) {
  const { supabase, user } = await requireUser();
  const id = String(formData.get("id") || "");
  const { error } = await supabase
    .from("loop_inbound_imports")
    .update({ status: "rejected", rejected_at: new Date().toISOString(), reviewed_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .in("status", ["needs_review", "ready", "error"]);
  if (error) throw new Error(error.message);
  revalidatePath("/account/inbound-email");
}
