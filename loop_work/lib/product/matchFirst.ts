import { createClient } from "@/lib/supabase/server";
import { explainGs1Barcode, lookupGs1ConfiguredAdapter } from "./gs1";
import { lookupOpenFoodFactsByBarcode, mapOpenFoodFactsToCard } from "./openFoodFacts";
import { ProductCandidate, shouldAllowAiEstimate } from "./providers";

export async function resolveProductBeforeAi(input: { query?: string | null; barcode?: string | null; retailer?: string | null; householdId?: string | null; createExternalDraft?: boolean }) {
  const supabase = await createClient();
  const sourceTrace: Array<Record<string, unknown>> = [];
  const { data: localCandidates, error: localError } = await supabase.rpc("loop_product_candidate_search", {
    p_query: input.query || null,
    p_barcode: input.barcode || null,
    p_retailer: input.retailer || null,
    p_limit: 8,
  });
  if (!localError && localCandidates?.length) {
    sourceTrace.push({ source: "local_import_library", status: "checked", count: localCandidates.length });
    const candidates = localCandidates as ProductCandidate[];
    const best = candidates[0];
    await supabase.from("loop_product_resolution_attempts").insert({
      query_text: input.query || null,
      barcode: input.barcode || null,
      gtin14: best.gtin14 || null,
      retailer_hint: input.retailer || null,
      status: Number(best.match_score) >= 82 ? "local_match" : "needs_user_choice",
      resolved_card_id: Number(best.match_score) >= 82 ? best.card_id : null,
      candidates,
      source_trace: sourceTrace,
      ai_allowed: shouldAllowAiEstimate(candidates),
    });
    return { status: Number(best.match_score) >= 82 ? "local_match" : "needs_user_choice", aiAllowed: shouldAllowAiEstimate(candidates), candidates, sourceTrace };
  }
  sourceTrace.push({ source: "local_import_library", status: localError ? "failed" : "no_match", error: localError?.message });

  if (input.barcode) {
    const gs1 = explainGs1Barcode(input.barcode);
    sourceTrace.push({ source: "gs1_validation", ...gs1 });
    if (!gs1.isValidGtin) return { status: "invalid_barcode", aiAllowed: false, candidates: [], sourceTrace };
    const off = await lookupOpenFoodFactsByBarcode(input.barcode);
    sourceTrace.push({ source: "open_food_facts", status: off.status, gtin14: off.gtin14 });
    if (off.status === "found" && off.product) {
      const mapped = mapOpenFoodFactsToCard(off.product, off.barcode);
      if (input.createExternalDraft) {
        const { data: created, error } = await supabase.from("loop_nutrition_cards").insert(mapped).select("*").single();
        if (!error && created) {
          await supabase.from("loop_product_identifier_observations").insert({ card_id: created.id, identifier_kind: "gtin", identifier_value: off.barcode, identifier_digits: off.barcode, gtin14: off.gtin14, source_key: "open_food_facts", source_url: mapped.source_url, confidence: 80 });
          return { status: "provider_match", aiAllowed: false, candidates: [{ ...created, card_id: created.id, match_score: 88, match_reason: "Open Food Facts barcode match" }], sourceTrace, createdCard: created };
        }
      }
      return { status: "provider_match", aiAllowed: false, candidates: [{ ...mapped, match_score: 86, match_reason: "Open Food Facts barcode match" }], sourceTrace };
    }
    const gs1Configured = await lookupGs1ConfiguredAdapter(input.barcode);
    sourceTrace.push({ source: "gs1_configured_adapter", ...gs1Configured });
  }

  return { status: "ai_allowed", aiAllowed: true, candidates: [], sourceTrace };
}
