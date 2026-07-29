import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveProductBeforeAi } from "@/lib/product/matchFirst";
import { explainGs1Barcode } from "@/lib/product/gs1";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const body = await request.json();
  const barcode = String(body.barcode || body.scanned_value || "").trim();
  if (!barcode) return NextResponse.json({ error: "Barcode is required." }, { status: 400 });
  const gs1 = explainGs1Barcode(barcode);
  await supabase.rpc("loop_record_barcode_scan", {
    p_scanned_value: barcode,
    p_household_id: body.household_id || null,
    p_scan_context: body.scan_context || "food_log",
  });
  const result = await resolveProductBeforeAi({
    barcode,
    query: body.query || null,
    retailer: body.retailer || null,
    householdId: body.household_id || null,
    createExternalDraft: Boolean(body.create_external_draft),
  });
  return NextResponse.json({ ...result, gs1 });
}
