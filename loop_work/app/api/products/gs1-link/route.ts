import { NextRequest, NextResponse } from "next/server";
import { explainGs1Barcode } from "@/lib/product/gs1";

export async function GET(request: NextRequest) {
  const gtin = request.nextUrl.searchParams.get("gtin") || request.nextUrl.searchParams.get("barcode") || "";
  return NextResponse.json(explainGs1Barcode(gtin));
}
