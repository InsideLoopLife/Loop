import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { scanProductSourceUrl } from "@/lib/admin/productSourceScanner";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const body = await request.json();
  const sourceUrl = body.source_url;

  if (!sourceUrl) {
    return NextResponse.json({ error: "source_url is required." }, { status: 400 });
  }

  const result = await scanProductSourceUrl(sourceUrl);

  if (body.job_id) {
    await supabase.from("loop_product_import_scan_items").insert({
      job_id: body.job_id,
      source_url: sourceUrl,
      canonical_url: sourceUrl,
      retailer_key: body.retailer_key || null,
      product_name: result.productName || result.title || null,
      brand_name: result.brandName || null,
      image_url: result.imageUrl || null,
      price_currency: "GBP",
      ingredients_text: result.ingredientsText || null,
      nutrition_json: result.nutritionText ? { raw_text: result.nutritionText } : {},
      source_snapshot: result.sourceSnapshot,
      confidence: result.confidence,
      missing_fields: result.missingFields,
      status: result.status === "ok" ? "ready_for_review" : "needs_review",
      review_notes: result.error || null,
    });
  }

  return NextResponse.json(result);
}
