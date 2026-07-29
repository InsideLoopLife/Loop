import { NextResponse } from "next/server";
import { getEffectiveEntitlements } from "@/lib/tiers/entitlements";

export async function GET() {
  const entitlements = await getEffectiveEntitlements();
  return NextResponse.json(entitlements);
}
