import { NextResponse } from "next/server";
import { PROVIDER_GLOSSARY } from "@/lib/investments/provider-glossary";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization") || "";
  const expected = process.env.CRON_SECRET;
  if (expected && authHeader !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // This is intentionally non-destructive. It gives the scheduled job a stable endpoint
  // for future provider-doc checks without overwriting fee assumptions silently.
  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    providersTracked: PROVIDER_GLOSSARY.length,
    nextStep: "Wire this to an admin review queue before allowing AI/provider updates to alter stored fee assumptions.",
  });
}
