import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { planPurchases, type ShoppingNeed, type ProductCandidate } from "@/lib/shopping/planner";

function q(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "Not authenticated." }, { status: 401 });

  const body = await request.json();
  const needs = Array.isArray(body.needs) ? body.needs as ShoppingNeed[] : [];
  if (!needs.length) return NextResponse.json({ error: "Add at least one shopping need." }, { status: 400 });

  const searchTerms = [...new Set(needs.map((need) => need.name.split(/\s+/)[0]).filter(Boolean))].slice(0, 12);

  let cards: any[] = [];
  for (const term of searchTerms) {
    const { data } = await supabase
      .from("loop_nutrition_cards")
      .select("id, display_name, brand_name, source_url, serving_g, serving_ml, product_size_text, category")
      .eq("visibility", "shared_database")
      .ilike("display_name", `%${term}%`)
      .limit(20);
    cards = [...cards, ...(data || [])];
  }

  const ids = [...new Set(cards.map((card) => card.id))];
  const { data: prices } = ids.length
    ? await supabase.from("loop_nutrition_price_observations").select("*").in("card_id", ids).order("observed_at", { ascending: false })
    : { data: [] as any[] };

  const latestPrice = new Map<string, any>();
  for (const price of prices || []) {
    if (!latestPrice.has(price.card_id)) latestPrice.set(price.card_id, price);
  }

  const candidates: ProductCandidate[] = cards.map((card) => {
    const price = latestPrice.get(card.id);
    const packageQty = q(card.serving_g) || q(card.serving_ml) || q(String(card.product_size_text || "").match(/(\d+(?:\.\d+)?)\s*(g|kg|ml|l)/i)?.[1]) || 1;
    const unitMatch = String(card.product_size_text || "").match(/\d+(?:\.\d+)?\s*(g|kg|ml|l)/i)?.[1]?.toLowerCase();
    const unit = card.serving_g ? "g" : card.serving_ml ? "ml" : (unitMatch || "each");

    return {
      card_id: card.id,
      display_name: card.display_name,
      retailer: price?.retailer_name || card.brand_name,
      source_url: card.source_url,
      package_quantity: packageQty,
      package_unit: unit,
      price_amount: price?.price_amount ?? null,
      price_currency: price?.price_currency || "GBP",
      confidence: price ? 75 : 45,
    };
  });

  return NextResponse.json({
    ok: true,
    needs,
    candidates_checked: candidates.length,
    plans: planPurchases(needs, candidates),
  });
}
