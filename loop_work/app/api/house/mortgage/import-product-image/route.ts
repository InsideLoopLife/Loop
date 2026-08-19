import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveIntegrationSecret } from "@/lib/integrations/secrets";
import { checkAiRouteAllowed, recordAiRouteUsage } from "@/lib/ai/route-budget";
import { enforceUserRateLimit } from "@/lib/security/rate-limit";
import { cleanText } from "@/lib/security/external-data";

function outputText(payload: any) {
  if (typeof payload?.output_text === "string") return payload.output_text;
  const chunks: string[] = [];
  for (const item of payload?.output || []) for (const content of item?.content || []) if (typeof content?.text === "string") chunks.push(content.text);
  return chunks.join("\n");
}
function jsonLoose(text: string) {
  try { return JSON.parse(text.trim()); } catch {}
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) try { return JSON.parse(fenced[1]); } catch {}
  return null;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const limit = await enforceUserRateLimit({ userId: user.id, bucket: "mortgage_product_image_import", limit: 20, windowSeconds: 3600 });
  if (!limit.allowed) return NextResponse.json({ error: "Too many image imports. Try again shortly." }, { status: 429 });

  const form = await request.formData().catch(() => null);
  const image = form?.get("image");
  if (!(image instanceof File)) return NextResponse.json({ error: "An image is required." }, { status: 400 });
  if (image.size > 8 * 1024 * 1024) return NextResponse.json({ error: "Image must be 8MB or smaller." }, { status: 413 });
  if (!["image/png", "image/jpeg", "image/webp"].includes(image.type)) return NextResponse.json({ error: "Use PNG, JPG or WEBP." }, { status: 400 });

  const secret = await getActiveIntegrationSecret(supabase, user.id, "openai");
  if (!secret?.value) return NextResponse.json({ error: "Image reading is unavailable. Use URL or Manual." }, { status: 503 });
  const budget = await checkAiRouteAllowed(supabase, user.id, "mortgage_product_import");
  if (!budget.allowed) return NextResponse.json({ error: "Image reading is temporarily unavailable for your plan. Use Manual." }, { status: 429 });

  const dataUrl = `data:${image.type};base64,${Buffer.from(await image.arrayBuffer()).toString("base64")}`;
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${secret.value}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_RESEARCH_MODEL || "gpt-4.1-mini",
      input: [{ role: "user", content: [
        { type: "input_text", text: `Read this mortgage quote image. Return ONLY valid JSON. Never guess missing values. Shape: {"lender_name":"string or null","product_name":"string or null","rate_percent":number_or_null,"rate_type":"fixed|variable|tracker|null","ltv_max_percent":number_or_null,"initial_term_months":number_or_null,"fee_amount":number_or_null}` },
        { type: "input_image", image_url: dataUrl, detail: "high" },
      ] }],
    }),
  });
  if (!response.ok) return NextResponse.json({ error: "The image could not be read. Use Manual." }, { status: 502 });
  const parsed = jsonLoose(outputText(await response.json()));
  if (!parsed || typeof parsed !== "object") return NextResponse.json({ error: "No reliable mortgage details were found." }, { status: 422 });

  await recordAiRouteUsage({ supabase, userId: user.id, tierKey: budget.tierKey, routeKey: "mortgage_product_import", provider: "openai", model: process.env.OPENAI_RESEARCH_MODEL || "gpt-4.1-mini" });
  return NextResponse.json({ product: {
    lender_name: parsed.lender_name ? cleanText(parsed.lender_name, 120) : null,
    product_name: parsed.product_name ? cleanText(parsed.product_name, 200) : null,
    rate_percent: parsed.rate_percent == null ? null : Number(parsed.rate_percent),
    rate_type: parsed.rate_type || null,
    ltv_max_percent: parsed.ltv_max_percent == null ? null : Number(parsed.ltv_max_percent),
    initial_term_months: parsed.initial_term_months == null ? null : Number(parsed.initial_term_months),
    fee_amount: parsed.fee_amount == null ? null : Number(parsed.fee_amount),
  } });
}
