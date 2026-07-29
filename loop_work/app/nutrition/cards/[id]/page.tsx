import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { createClient } from "@/lib/supabase/server";
import { RecipeDetailClient } from "@/components/nutrition/RecipeDetailClient";
import { getActiveHouseholdContext } from "@/lib/auth/household-context";

type MealDetail = {
  id: string;
  user_id: string;
  person_id: string | null;
  label: string;
  source_url: string | null;
  image_url: string | null;
  product_image_url: string | null;
  image_prompt: string | null;
  servings: number | null;
  brand_name: string | null;
  product_data_source: string | null;
  product_source_url: string | null;
  card_kind: string | null;
  nutrition_score: number | null;
  nutrition_confidence: number | null;
  calories: number | null;
  protein_g: number | null;
  fibre_g: number | null;
  salt_g: number | null;
  caffeine_mg: number | null;
  vitamin_b12_ug: number | null;
  vitamin_d_ug: number | null;
  vitamin_c_mg: number | null;
  thiamin_mg: number | null;
  niacin_mg: number | null;
  folate_ug: number | null;
  zinc_mg: number | null;
  magnesium_mg: number | null;
  iron_mg: number | null;
  calcium_mg: number | null;
  potassium_mg: number | null;
  sodium_mg: number | null;
  saturated_fat_g: number | null;
  added_sugar_g: number | null;
  sugar_g: number | null;
  fat_g: number | null;
  carbs_g: number | null;
  ingredients: string | null;
  ingredients_json: any;
  allergen_flags: string[] | null;
  dietary_flags: string[] | null;
  notes: string | null;
  nutrition_json: any;
  created_at: string;
};

type Person = { id: string; name: string; relationship: string | null; avatar_url: string | null };
type GroupedIngredient = { section: string; items: string[] };

function parseIngredientLine(value: string) {
  const line = String(value || "").trim();
  if (!line) return null;
  return line.replace(/^[-•]\s*/, "");
}

function inferSection(name: string, notes?: string) {
  const source = `${name} ${notes || ""}`.toLowerCase();
  const explicit = source.match(/(?:section|part|for)\s*[:=-]?\s*([a-z ]{3,40})/i);
  if (explicit?.[1]) return explicit[1].trim().replace(/\b\w/g, (ch) => ch.toUpperCase());
  const matches = source.match(/for\s+the\s+([a-z ]+)|for\s+([a-z ]+)/i);
  if (matches?.[1]) return matches[1].trim().replace(/\b\w/g, (ch) => ch.toUpperCase());
  if (matches?.[2]) return matches[2].trim().replace(/\b\w/g, (ch) => ch.toUpperCase());
  if (/sauce|ragu|ragù/.test(source)) return "Sauce";
  if (/dressing/.test(source)) return "Dressing";
  if (/topping/.test(source)) return "Topping";
  if (/filling/.test(source)) return "Filling";
  return "Main recipe";
}

function groupIngredients(meal: MealDetail): GroupedIngredient[] {
  const groups = new Map<string, string[]>();
  const push = (section: string, item: string) => {
    if (!groups.has(section)) groups.set(section, []);
    groups.get(section)!.push(item);
  };
  if (Array.isArray(meal.ingredients_json) && meal.ingredients_json.length) {
    meal.ingredients_json.forEach((item: any) => {
      const rawName = String(item?.name || item || "").trim();
      if (!rawName) return;
      if (/[:：]$/.test(rawName) && !item?.quantity) {
        const heading = rawName.replace(/[:：]+$/, "").trim();
        if (heading) groups.set(heading, groups.get(heading) || []);
        return;
      }
      const line = [String(item?.quantity || "").trim(), rawName].filter(Boolean).join(" ").trim();
      const section = String(item?.section || "").trim() || inferSection(rawName, String(item?.notes || ""));
      push(section, line);
    });
  }
  if (!groups.size) {
    let currentSection = "Main recipe";
    String(meal.ingredients || "").split(/\r?\n/).map(parseIngredientLine).filter(Boolean).forEach((line) => {
      if (/[:：]$/.test(line!)) {
        currentSection = line!.replace(/[:：]+$/, "").trim() || currentSection;
        if (!groups.has(currentSection)) groups.set(currentSection, []);
        return;
      }
      push(currentSection, line!);
    });
  }
  return Array.from(groups.entries()).map(([section, items]) => ({ section, items })).filter((group) => group.items.length);
}

function instructions(meal: MealDetail) {
  if (Array.isArray(meal.nutrition_json?.instructions)) {
    return (meal.nutrition_json.instructions as unknown[]).map((item) => String(item).trim()).filter(Boolean);
  }
  const notes = String(meal.notes || "");
  const match = notes.match(/Instructions:\n([\s\S]+)/i);
  if (match?.[1]) return match[1].split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  return [];
}

function videoUrls(meal: MealDetail) {
  const raw = [
    meal.nutrition_json?.video_url,
    meal.nutrition_json?.source_video_url,
    ...(Array.isArray(meal.nutrition_json?.videos) ? meal.nutrition_json.videos : []),
  ];
  return Array.from(new Set(raw.map((item) => String(item || "").trim()).filter((item) => /^https?:\/\//i.test(item)))).slice(0, 3);
}

export default async function NutritionRecipeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const householdContext = await getActiveHouseholdContext(supabase, user);
  const visibleUserIds = householdContext.householdId
    ? householdContext.memberUserIds
    : [user.id];
  const [{ data: meal }, { data: people }] = await Promise.all([
    supabase
      .from("meals")
      .select("id, user_id, person_id, label, source_url, image_url, product_image_url, image_prompt, servings, brand_name, product_data_source, product_source_url, card_kind, nutrition_score, nutrition_confidence, calories, protein_g, carbs_g, fat_g, fibre_g, sugar_g, added_sugar_g, salt_g, saturated_fat_g, sodium_mg, potassium_mg, calcium_mg, iron_mg, magnesium_mg, zinc_mg, folate_ug, niacin_mg, thiamin_mg, vitamin_c_mg, vitamin_d_ug, vitamin_b12_ug, caffeine_mg, ingredients, ingredients_json, allergen_flags, dietary_flags, notes, nutrition_json, created_at")
      .eq("id", id)
      .in("user_id", visibleUserIds)
      .maybeSingle<MealDetail>(),
    supabase.from("people").select("id, name, relationship, avatar_url").in("user_id", visibleUserIds).order("name").returns<Person[]>(),
  ]);
  if (!meal) notFound();

  const today = new Date().toISOString().slice(0, 10);

  return <>
    <Nav />
    <main className="mx-auto w-[95vw] max-w-none space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[2.5rem] bg-slate-950 p-7 text-white shadow-2xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-200">LoopHealth card view</p>
            <h1 className="mt-2 text-4xl font-black tracking-tight">{meal.label}</h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold text-slate-300">See ingredients alongside the image, scale the portions, follow the method, and log to multiple people from this page.</p>
          </div>
          <div className="grid gap-2 sm:w-48"><Link href="/nutrition/cards" className="rounded-full bg-white px-5 py-3 text-center text-sm font-black text-slate-950">Back to cards</Link><Link href={`/nutrition?open=edit-recipe&meal=${meal.id}`} className="rounded-full bg-slate-100 px-5 py-3 text-center text-sm font-black text-slate-800">Edit card</Link>{meal.source_url ? <a href={meal.source_url} target="_blank" rel="noreferrer" className="rounded-full bg-emerald-400 px-5 py-3 text-center text-sm font-black text-slate-950">Open source</a> : null}<a href="#product-correction" className="rounded-full bg-amber-100 px-5 py-3 text-center text-sm font-black text-amber-900">Correct product</a></div>
        </div>
      </section>
      <RecipeDetailClient meal={meal} people={people || []} ingredientGroups={groupIngredients(meal)} steps={instructions(meal)} videos={videoUrls(meal)} today={today} />
    </main>
  </>;
}
