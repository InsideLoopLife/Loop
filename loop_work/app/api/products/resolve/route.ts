import { NextRequest, NextResponse } from "next/server";
import { resolveProductBeforeAi } from "@/lib/product/matchFirst";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const result = await resolveProductBeforeAi({
    query: body.query || body.text || null,
    barcode: body.barcode || null,
    retailer: body.retailer || null,
    householdId: body.household_id || null,
    createExternalDraft: Boolean(body.create_external_draft),
  });
  return NextResponse.json(result);
}
