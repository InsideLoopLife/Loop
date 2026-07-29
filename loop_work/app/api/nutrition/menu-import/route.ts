import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveIntegrationSecret } from "@/lib/integrations/secrets";
import { enforceUserRateLimit } from "@/lib/security/rate-limit";
import { cleanText, safeExternalUrl } from "@/lib/security/external-data";
import { fallbackRecipeEstimate, normaliseRecipeEstimate } from "@/lib/nutrition/scoring";
import { getPublicPageEvidence } from "@/lib/imports/public-page-evidence";

function extractTextFromResponse(payload: any) {
  if (typeof payload?.output_text === "string") return payload.output_text;
  const chunks: string[] = [];
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (typeof content?.text === "string") chunks.push(content.text);
    }
  }
  return chunks.join("\n");
}

function parseJsonLoose(text: string) {
  const trimmed = text.trim();
  try { return JSON.parse(trimmed); } catch {}
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    try { return JSON.parse(fenced[1]); } catch {}
  }
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) {
    try { return JSON.parse(trimmed.slice(first, last + 1)); } catch {}
  }
  return null;
}

function uniqueItems(items: any[]) {
  const seen = new Set<string>();
  const output: any[] = [];
  for (const item of items) {
    const key = String(item?.label || item?.name || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output;
}

async function notifyImportStatus(supabase: any, userId: string, title: string, body: string, status: "unread" | "read" = "unread", severity: "info" | "success" | "warning" = "info") {
  try {
    await supabase.from("app_notifications").insert({
      user_id: userId,
      notification_type: "nutrition_menu_import",
      category: "lifestyle",
      channel: "in_app",
      severity,
      title,
      body,
      cta_label: "Open nutrition",
      cta_href: "/nutrition",
      status,
    });
  } catch {
    // Do not block menu import if notification insert is unavailable.
  }
}


function candidateMenuItemsFromEvidence(evidence: Awaited<ReturnType<typeof getPublicPageEvidence>>, url: string) {
  const text = `${evidence.pageText || ""}\n${evidence.apiHints.map((hint) => hint.text).join("\n")}`;
  const found = new Map<string, any>();
  const cleanCandidate = (value: string) => cleanText(value, 120)
    .replace(/^menu\s+/i, "")
    .replace(/\s+£\s*\d+(?:\.\d{2})?.*$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  const ignore = /^(home|menu|our menu|contact|about|order now|basket|checkout|privacy|terms|allergen|opening|telephone|address|facebook|instagram|delivery|collection)$/i;
  const priceRegex = /([^\n£]{3,90}?)\s*(?:from\s*)?£\s?\d{1,3}(?:\.\d{2})?/gi;
  let match: RegExpExecArray | null;
  while ((match = priceRegex.exec(text))) {
    const label = cleanCandidate(match[1] || "");
    if (!label || ignore.test(label) || label.split(/\s+/).length > 10) continue;
    const key = label.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (!key || found.has(key)) continue;
    found.set(key, { label, price: match[0].match(/£\s?\d{1,3}(?:\.\d{2})?/)?.[0] || "", description: "Extracted from visible menu price text.", confidence: 58, source_url: url });
  }
  // Some restaurant pages list items under headings without a price per line. Keep a conservative list.
  const lineCandidates = text.split(/\n+/).map((line) => cleanCandidate(line)).filter(Boolean);
  for (const line of lineCandidates) {
    if (found.size >= 150) break;
    if (ignore.test(line) || line.length < 4 || line.length > 70) continue;
    if (!/(pizza|kebab|burger|wrap|chicken|fish|chips|doner|donner|shawarma|peri|grill|calzone|garlic|bread|salad|rice|nuggets|wings|strips|meal|box|dips?|sauce|drink|cola|pepsi|fanta|dessert|cake|cookie|kids|cheese|halloumi|vegetarian|vegan)/i.test(line)) continue;
    const key = line.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (!key || found.has(key)) continue;
    found.set(key, { label: line, description: "Extracted from visible menu/category text.", confidence: 46, source_url: url });
  }
  return Array.from(found.values());
}

function normaliseItem(item: any, url: string, sourceName: string, fallbackImages: string[] = [], importKind: "menu" | "ingredient" | "product" = "menu") {
  const label = cleanText(item?.label || item?.name || "Menu item", 180) || "Menu item";
  const description = cleanText(item?.description || item?.ingredients || "", 1200);
  const allergens = Array.isArray(item?.allergens) ? item.allergens.map((value: any) => cleanText(value, 80)).filter(Boolean).slice(0, 16) : [];
  const fallback = fallbackRecipeEstimate({
    label,
    ingredients: description || allergens.join(", "),
    notes: `${sourceName} ${importKind === "menu" ? "restaurant/menu item" : "product/ingredient item"}`,
    servings: 1,
  });
  const estimate = normaliseRecipeEstimate({
    ...(item?.estimate || {}),
    servings: 1,
    confidence: Number(item?.estimate?.confidence || item?.confidence || (importKind === "menu" ? 52 : 62)),
    confidence_reason: item?.estimate?.confidence_reason || (importKind === "menu" ? "Estimated from public menu text rather than a full nutrition label." : "Estimated from public product/source text where label data was not complete."),
    processing_level: item?.estimate?.processing_level || "medium",
    ingredients_json: item?.estimate?.ingredients_json || description.split(",").map((part: string) => ({ name: part.trim() })).filter((part: any) => part.name),
    allergen_flags: item?.estimate?.allergen_flags || allergens,
    dietary_flags: [...(Array.isArray(item?.estimate?.dietary_flags) ? item.estimate.dietary_flags : []), importKind === "menu" ? "restaurant / menu estimate" : "product / ingredient estimate"],
    manufacturing_notes: item?.estimate?.manufacturing_notes || [importKind === "menu" ? "Restaurant/menu nutrition is estimated and may vary by portion, cooking method and toppings." : "Product/ingredient nutrition is estimated from public source text until a label/barcode record is confirmed."],
  }, fallback);

  return {
    label,
    description,
    price: cleanText(item?.price || "", 40),
    allergens,
    source_url: url,
    source_name: sourceName,
    import_kind: importKind,
    image_url: cleanText(item?.image_url || item?.image || item?.estimate?.image_url || fallbackImages[0] || "", 1200),
    estimate,
  };
}

function buildMenuPrompt(args: {
  url: string;
  sourceName: string;
  importKind: "menu" | "ingredient" | "product";
  itemHints: string[];
  exhaustive: boolean;
  evidence: Awaited<ReturnType<typeof getPublicPageEvidence>>;
  secondPass?: boolean;
  previousLabels?: string[];
}) {
  const { url, sourceName, importKind, itemHints, exhaustive, evidence, secondPass, previousLabels } = args;
  const pageText = evidence.pageText;
  return `You are extracting food/drink data for a private household nutrition tracker.

URL: ${url}
Source name: ${sourceName}
Import kind requested by UI: ${importKind}
Mode: ${exhaustive ? "exhaustive batch import" : "single/normal import"}
${itemHints.length ? `User-supplied product/item hints, one per line:\n${itemHints.map((item) => `- ${item}`).join("\n")}` : "No specific item hints supplied."}
${secondPass ? `This is an exhaustive second pass. Previous labels already found:\n${(previousLabels || []).map((item) => `- ${item}`).join("\n")}` : ""}

Import evidence status: ${evidence.status}
Dynamic JavaScript app detected: ${evidence.dynamicAppDetected ? "yes" : "no"}
Headless browser attempted: ${evidence.headlessAttempted ? "yes" : "no"}
Headless browser succeeded: ${evidence.headlessSucceeded ? "yes" : "no"}
Evidence note: ${evidence.note}

Structured JSON-LD evidence, if available:
${evidence.jsonLdSummary || "(No JSON-LD evidence found.)"}

Captured API/network hints, if available:
${evidence.apiHints.length ? evidence.apiHints.map((hint) => "URL: " + hint.url + "\n" + hint.text).join("\n\n") : "(No menu API/network hints captured.)"}

Visible page text, if available:
${pageText || "(The server-rendered page text was sparse. Use web search for the public page and only return items that are plausibly evidenced by the source/brand/menu.)"}

Return ONLY valid JSON with this exact shape:
{
  "source_name": "string",
  "note": "short note about confidence and limitations",
  "items": [
    {
      "label": "menu/product/ingredient item name",
      "price": "string price if shown",
      "description": "ingredients / menu description / product description",
      "allergens": ["eggs","milk","gluten"],
      "confidence": 0-100,
      "estimate": {
        "servings": 1,
        "confidence": 0-100,
        "confidence_reason": "string",
        "processing_level": "low" | "medium" | "high" | "unknown",
        "health_score": 0-100,
        "image_url": "direct food/product image URL if clearly evidenced, otherwise empty string",
        "image_prompt": "short realistic food/product photo prompt",
        "ingredients_json": [{"name":"string","quantity":"string","notes":"string"}],
        "ingredient_ratio_json": [{"name":"string","estimated_weight_g": number,"percentage": number,"role":"string","confidence":0-100}],
        "per_serving": {
          "calories": number, "protein_g": number, "carbs_g": number, "fat_g": number, "fibre_g": number, "soluble_fibre_g": number, "insoluble_fibre_g": number, "sugar_g": number, "added_sugar_g": number, "natural_sugar_g": number, "salt_g": number, "saturated_fat_g": number, "trans_fat_g": number, "monounsaturated_fat_g": number, "polyunsaturated_fat_g": number, "sodium_mg": number, "potassium_mg": number, "calcium_mg": number, "iron_mg": number, "magnesium_mg": number, "zinc_mg": number, "folate_ug": number, "niacin_mg": number, "thiamin_mg": number, "vitamin_c_mg": number, "vitamin_d_ug": number, "vitamin_b12_ug": number, "omega_3_g": number, "caffeine_mg": number, "energy_density_kcal_per_g": number, "glycemic_impact_score": number
        },
        "allergen_flags": ["string"],
        "dietary_flags": ["string"],
        "manufacturing_notes": ["string"],
        "micronutrient_notes": ["string"],
        "assumptions": ["string"]
      }
    }
  ]
}

Rules:
- For menu/takeaway pages, extract as many actual menu items as possible, across ALL visible categories/sections. Aim for 40-150 items when the menu is clearly larger than a handful. Do not return only the first category.
- Do not stop after pizzas/first section if sides, drinks, dips, desserts, kebabs, burgers, wraps, chicken, fish, kids meals, vegan items, specials, or meal deals are visible or commonly part of that source menu.
- For TenKites/viewthe.menu or JavaScript menus, use web search and page/API hints to reconstruct the menu. Be transparent with lower confidence if the page cannot be fully rendered.
- For a single product/ingredient URL, return exactly 1 item unless the page clearly lists a product range.
- If product/item hints are supplied, include those exact likely products where possible, but do not ignore other menu items on a menu batch.
- Prefer UK retailer/manufacturer/restaurant evidence where possible.
- Use source images if clearly available. If not available, leave image_url empty and provide image_prompt.
- Include processed-food markers and gut-health relevant signals such as fibre, salt, saturated fat, caffeine, sweeteners, additives and energy density.`;
}

async function callOpenAi(secretValue: string, prompt: string) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${secretValue}` },
    body: JSON.stringify({
      model: process.env.OPENAI_RESEARCH_MODEL || "gpt-4.1-mini",
      max_output_tokens: 12000,
      tools: [{ type: "web_search_preview" }],
      input: prompt,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || "Menu import failed");
  const parsed = parseJsonLoose(extractTextFromResponse(payload));
  if (!parsed || !Array.isArray(parsed.items)) throw new Error("Menu import did not return item JSON");
  return parsed;
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 25_000) return NextResponse.json({ error: "Menu import request is too large." }, { status: 413 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const limit = await enforceUserRateLimit({ userId: user.id, bucket: "nutrition_menu_import", limit: 20, windowSeconds: 60 * 60 });
  if (!limit.allowed) return NextResponse.json({ error: "Too many menu imports. Try again shortly.", resetAt: limit.resetAt }, { status: 429 });

  const body = await request.json().catch(() => ({}));
  const url = safeExternalUrl(body.url);
  const sourceName = cleanText(body.sourceName || "Menu import", 120) || "Menu import";
  const importKind = body.importKind === "ingredient" || body.importKind === "product" ? body.importKind : "menu";
  const itemHints = Array.isArray(body.itemHints) ? body.itemHints.map((item: any) => cleanText(item, 180)).filter(Boolean).slice(0, 120) : [];
  const exhaustive = Boolean(body.exhaustive || importKind === "menu");
  if (!url) return NextResponse.json({ error: "Paste a valid public HTTPS menu URL." }, { status: 400 });

  await notifyImportStatus(supabase, user.id, "Menu import acknowledged", `${sourceName} has been queued and is now reading the public page. This usually takes 10–40 seconds, longer for JavaScript menus.`);

  const secret = await getActiveIntegrationSecret(supabase, user.id, "openai");
  if (!secret?.value) {
    return NextResponse.json({ items: [], usedOpenAi: false, note: "Menu import needs the saved OpenAI token so it can read and structure public menu data." });
  }

  const evidence = await getPublicPageEvidence(url);
  if (evidence.dynamicAppDetected && !evidence.headlessSucceeded) {
    await notifyImportStatus(
      supabase,
      user.id,
      "Dynamic menu detected",
      evidence.headlessAttempted
        ? "LoopHealth detected a JavaScript-rendered menu and tried browser rendering, but this deployment could not render it. It will continue with AI/web extraction."
        : "LoopHealth detected a JavaScript-rendered menu. It will continue with AI/web extraction; enable headless imports for fuller TenKites/viewthe.menu style pages.",
      "unread",
      "info",
    );
  } else if (evidence.headlessSucceeded) {
    await notifyImportStatus(supabase, user.id, "Dynamic menu rendered", "LoopHealth used browser rendering and captured the loaded menu/page evidence before AI structuring.", "unread", "info");
  }

  try {
    const firstParsed = await callOpenAi(secret.value, buildMenuPrompt({ url, sourceName, importKind, itemHints, exhaustive, evidence }));
    const evidenceCandidates = importKind === "menu" ? candidateMenuItemsFromEvidence(evidence, url) : [];
    let rawItems = uniqueItems([...(Array.isArray(firstParsed.items) ? firstParsed.items : []), ...evidenceCandidates]);
    let extraPasses = 0;
    const targetMinimum = importKind === "menu" ? 30 : 1;
    while (importKind === "menu" && exhaustive && rawItems.length > 0 && rawItems.length < targetMinimum && extraPasses < 3) {
      extraPasses += 1;
      try {
        const extraParsed = await callOpenAi(secret.value, buildMenuPrompt({
          url,
          sourceName,
          importKind,
          itemHints: [
            ...itemHints,
            "Find missing categories/items not already listed: kebabs, burgers, wraps, chicken, sides, dips, drinks, desserts, kids meals, pizza sizes, meal deals, extras, sauces.",
          ],
          exhaustive: true,
          evidence,
          secondPass: true,
          previousLabels: rawItems.map((item: any) => cleanText(item?.label || item?.name || "", 120)).filter(Boolean),
        }));
        rawItems = uniqueItems([...rawItems, ...(Array.isArray(extraParsed.items) ? extraParsed.items : []), ...evidenceCandidates]);
      } catch {
        break;
      }
    }

    const items = uniqueItems(rawItems).slice(0, 150).map((item: any) => normaliseItem(item, url, firstParsed.source_name || sourceName, evidence.images, importKind));
    await notifyImportStatus(supabase, user.id, "Menu import ready", `${items.length} item(s) from ${firstParsed.source_name || sourceName} are ready to review and save.`, "unread", "success");
    return NextResponse.json({
      items,
      usedOpenAi: true,
      sourceName: firstParsed.source_name || sourceName,
      pageTextChars: evidence.pageTextChars,
      sourceRead: evidence.pageTextChars > 250 || evidence.apiHints.length > 0 || evidence.jsonLd.length > 0,
      sourceMode: evidence.status,
      dynamicAppDetected: evidence.dynamicAppDetected,
      headlessAttempted: evidence.headlessAttempted,
      headlessSucceeded: evidence.headlessSucceeded,
      evidenceNote: evidence.note,
      apiHintCount: evidence.apiHints.length,
      imageCount: evidence.images.length,
      importKind,
      secondPassAttempted: extraPasses > 0,
      extraPassCount: extraPasses,
      note: firstParsed.note || (importKind === "menu" ? "Menu items imported as nutrition estimates. Review allergens and portion sizes before relying on them." : "Ingredient/product imported as a nutrition estimate. Review serving size and label details before relying on it."),
    });
  } catch (error) {
    await notifyImportStatus(supabase, user.id, "Menu import could not complete", error instanceof Error ? error.message : "Menu import failed", "unread", "warning");
    return NextResponse.json({ items: [], usedOpenAi: false, error: error instanceof Error ? error.message : "Menu import failed" }, { status: 500 });
  }
}
