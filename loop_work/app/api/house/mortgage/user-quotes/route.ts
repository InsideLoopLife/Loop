import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { cleanText } from "@/lib/security/external-data";

const SOURCE_METHODS = new Set(["manual", "url", "image"]);

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const homeId = new URL(request.url).searchParams.get("homeId");
  if (!homeId) {
    return NextResponse.json({ error: "homeId is required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("user_mortgage_quotes")
    .select(
      "id, home_id, lender_name, product_name, rate_percent, rate_type, ltv_max_percent, initial_term_months, fee_amount, source_method, source_url, evidence_status, created_at",
    )
    .eq("user_id", user.id)
    .eq("home_id", homeId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ quote: data ?? null });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const homeId = String(body?.homeId || "").trim();
  const lenderName = cleanText(String(body?.lenderName || ""), 120);
  const productName = body?.productName
    ? cleanText(String(body.productName), 200)
    : null;
  const ratePercent = Number(body?.ratePercent || 0);
  const rateType = body?.rateType
    ? cleanText(String(body.rateType), 40)
    : null;
  const ltvMaxPercent = numberOrNull(body?.ltvMaxPercent);
  const initialTermMonths = numberOrNull(body?.initialTermMonths);
  const feeAmount = numberOrNull(body?.feeAmount);
  const sourceMethod = String(body?.sourceMethod || "manual");
  const sourceUrl = body?.sourceUrl ? String(body.sourceUrl).trim() : null;
  const evidenceStatus =
    String(body?.evidenceStatus || "") === "extracted_reviewed"
      ? "extracted_reviewed"
      : "user_supplied";

  if (!homeId) {
    return NextResponse.json({ error: "A property is required." }, { status: 400 });
  }
  if (!Number.isFinite(ratePercent) || ratePercent <= 0 || ratePercent >= 100) {
    return NextResponse.json({ error: "Enter a valid mortgage rate." }, { status: 400 });
  }
  if (!SOURCE_METHODS.has(sourceMethod)) {
    return NextResponse.json({ error: "Invalid quote source." }, { status: 400 });
  }
  if (ltvMaxPercent !== null && (ltvMaxPercent < 0 || ltvMaxPercent > 100)) {
    return NextResponse.json({ error: "Maximum LTV must be between 0 and 100." }, { status: 400 });
  }
  if (initialTermMonths !== null && initialTermMonths <= 0) {
    return NextResponse.json({ error: "Initial period must be greater than zero." }, { status: 400 });
  }
  if (feeAmount !== null && feeAmount < 0) {
    return NextResponse.json({ error: "Product fee cannot be negative." }, { status: 400 });
  }

  // RLS on homes means this only succeeds for a property visible to the signed-in user.
  const { data: home } = await supabase
    .from("homes")
    .select("id")
    .eq("id", homeId)
    .maybeSingle();

  if (!home) {
    return NextResponse.json({ error: "Property not found." }, { status: 404 });
  }

  // One active household-specific quote per property. This deliberately
  // does not touch the central mortgage_rate_deals catalogue.
  const { error: deleteError } = await supabase
    .from("user_mortgage_quotes")
    .delete()
    .eq("user_id", user.id)
    .eq("home_id", homeId);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("user_mortgage_quotes")
    .insert({
      user_id: user.id,
      home_id: homeId,
      lender_name: lenderName || "User supplied lender",
      product_name: productName,
      rate_percent: ratePercent,
      rate_type: rateType,
      ltv_max_percent: ltvMaxPercent,
      initial_term_months:
        initialTermMonths === null ? null : Math.round(initialTermMonths),
      fee_amount: feeAmount,
      source_method: sourceMethod,
      source_url: sourceUrl,
      evidence_status: evidenceStatus,
      updated_at: new Date().toISOString(),
    })
    .select(
      "id, home_id, lender_name, product_name, rate_percent, rate_type, ltv_max_percent, initial_term_months, fee_amount, source_method, source_url, evidence_status, created_at",
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ quote: data });
}

export async function DELETE(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Quote id is required." }, { status: 400 });
  }

  const { error } = await supabase
    .from("user_mortgage_quotes")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
