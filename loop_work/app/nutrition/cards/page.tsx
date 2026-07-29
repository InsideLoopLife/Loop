import Link from "next/link";
import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { createClient } from "@/lib/supabase/server";
import { deleteNutritionMeal, generateMealMethod, queueNutritionProductCorrection, refreshMealImage, setNutritionMealCardKind } from "@/app/nutrition/actions";
import { mealImageEmoji } from "@/lib/nutrition/scoring";
import { isProductLikeKind, nutritionUpdateStatus, productUpdateStatusLabel } from "@/lib/nutrition/intelligence";
import { getActiveHouseholdContext } from "@/lib/auth/household-context";

type MealCard = {
  id: string;
  label: string;
  image_url: string | null;
  product_image_url: string | null;
  image_prompt: string | null;
  source_url: string | null;
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
  saturated_fat_g: number | null;
  ingredients: string | null;
  ingredients_json: any;
  allergen_flags: string[] | null;
  dietary_flags: string[] | null;
  nutrition_json: any;
  created_at: string;
};

function n(value: unknown) { return Number(value || 0); }
function hasDisplayableImage(url: string | null | undefined) { return Boolean(url && /^(https?:)?\/\//i.test(String(url || "").trim())); }
function imageSrc(url: string | null | undefined, label = "Food") {
  const value = String(url || "").trim();
  if (!value) return `/api/food-image-placeholder?label=${encodeURIComponent(label)}`;
  if (value.startsWith("/api/food-image-placeholder") || value.startsWith("/api/image-proxy")) return value;
  const normalised = value.startsWith("//") ? `https:${value}` : value;
  if (!hasDisplayableImage(normalised)) return `/api/food-image-placeholder?label=${encodeURIComponent(label)}`;
  return `/api/image-proxy?url=${encodeURIComponent(normalised)}`;
}
function recipeType(meal: MealCard) {
  const kind = String(meal.card_kind || "").toLowerCase();
  const source = String(meal.product_data_source || "").toLowerCase();
  if (kind === "drink_product") return "Drink product";
  if (kind === "product" || isProductLikeKind(`${kind} ${source}`)) return "Product";
  if (kind === "ingredient" || /ingredient_url|ingredient/.test(source)) return "Ingredient";
  if (kind === "menu" || /restaurant|menu|takeaway/.test(source)) return "Takeaway menu";
  return "Recipe";
}
function isHoldingImage(url: string | null | undefined) {
  const value = String(url || "");
  return !value || value.includes("/api/food-image-placeholder") || value.includes("placeholder") || value.includes("emoji");
}
function ingredientCount(meal: MealCard) {
  if (Array.isArray(meal.ingredients_json) && meal.ingredients_json.length) return meal.ingredients_json.length;
  return String(meal.ingredients || "").split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean).length;
}
function MealImage({ meal }: { meal: MealCard }) {
  const src = imageSrc(meal.image_url || meal.product_image_url, meal.label); if (src) return <img src={src} alt="" className="aspect-square w-full rounded-[1.75rem] object-cover shadow-sm" />;
  return <div className="grid aspect-square w-full place-items-center rounded-[1.75rem] bg-[radial-gradient(circle_at_25%_20%,rgba(255,255,255,.9),transparent_25%),linear-gradient(135deg,#ecfdf5,#fef3c7_55%,#fed7aa)] text-5xl shadow-inner">{mealImageEmoji(meal.label)}</div>;
}

function ProductUpdateBadge({ meal }: { meal: MealCard }) {
  const status = nutritionUpdateStatus(meal);
  if (!status) return null;
  return <span className="absolute right-6 top-6 z-10 rounded-full bg-amber-100 px-3 py-2 text-xs font-black text-amber-800 shadow" title={productUpdateStatusLabel(status)}>⏱ {status}</span>;
}

function MethodPreview({ meal }: { meal: MealCard }) {
  const productLike = recipeType(meal) !== "Recipe" && recipeType(meal) !== "Takeaway menu";
  const steps = Array.isArray(meal.nutrition_json?.instructions) ? meal.nutrition_json.instructions.map(String).filter(Boolean) : [];
  if (productLike) return <div className="mt-3 rounded-2xl bg-slate-50 p-3 text-xs font-semibold text-slate-500">Product card — no cooking method needed. Submit a label/source if nutrition needs correcting.</div>;
  if (steps.length) return <div className="mt-3 rounded-2xl bg-slate-50 p-3 text-xs font-bold text-slate-600"><p className="mb-1 text-[0.65rem] font-black uppercase tracking-wide text-slate-400">How to make it</p><ol className="list-decimal space-y-1 pl-4">{steps.slice(0, 4).map((step: string, idx: number) => <li key={`${step}-${idx}`}>{step}</li>)}</ol></div>;
  return <form action={generateMealMethod} className="mt-3 rounded-2xl border border-dashed border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-900"><input type="hidden" name="id" value={meal.id} /><p>No saved method yet.</p><button className="mt-2 rounded-full bg-emerald-100 px-3 py-2 text-xs font-black text-emerald-800">Generate method</button></form>;
}

export default async function NutritionCardsPage({ searchParams }: { searchParams?: Promise<{ q?: string; type?: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const params = await searchParams;
  const q = String(params?.q || "").trim();
  const type = String(params?.type || "all");
  const householdContext = await getActiveHouseholdContext(supabase, user);
  const visibleUserIds = householdContext.householdId
    ? householdContext.memberUserIds
    : [user.id];

  let query = supabase
    .from("meals")
    .select("id, label, image_url, product_image_url, image_prompt, source_url, brand_name, product_data_source, product_source_url, card_kind, nutrition_score, nutrition_confidence, calories, protein_g, fibre_g, salt_g, saturated_fat_g, ingredients, ingredients_json, allergen_flags, dietary_flags, nutrition_json, created_at")
    .in("user_id", visibleUserIds);
  if (q) query = query.ilike("label", `%${q}%`);
  const { data: meals } = await query.order("created_at", { ascending: false }).returns<MealCard[]>();
  const allMeals = meals || [];
  const filtered = allMeals.filter((meal) => {
    if (type === "all") return true;
    const displayType = recipeType(meal).toLowerCase();
    if (type === "menu") return displayType.includes("takeaway");
    return displayType === type;
  });
  const counts = {
    all: allMeals.length,
    recipe: allMeals.filter((meal) => recipeType(meal) === "Recipe").length,
    ingredient: allMeals.filter((meal) => recipeType(meal) === "Ingredient").length,
    product: allMeals.filter((meal) => recipeType(meal) === "Product").length,
    menu: allMeals.filter((meal) => recipeType(meal) === "Takeaway menu").length,
  };

  return <>
    <Nav />
    <main className="mx-auto w-[95vw] max-w-none space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[2.5rem] bg-slate-950 p-7 text-white shadow-2xl">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-200">LoopHealth library</p>
            <h1 className="mt-2 text-4xl font-black tracking-tight">Saved recipes and food cards</h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold text-slate-300">Search recipes, imported menus and barcode/product cards. This is now the main place to browse them all, open a proper recipe view, or jump straight into editing/logging.</p>
          </div>
          <div className="flex flex-wrap gap-2"><Link href="/nutrition" className="rounded-full bg-white px-5 py-3 text-sm font-black text-slate-950">Back to daily log</Link><Link href="/nutrition/batch" className="rounded-full bg-white/10 px-5 py-3 text-sm font-black text-white ring-1 ring-white/20">Batch checker</Link><Link href="/nutrition/ingredients" className="rounded-full bg-white/10 px-5 py-3 text-sm font-black text-white ring-1 ring-white/20">Ingredients</Link><Link href="/nutrition?open=recipe" className="rounded-full bg-emerald-400 px-5 py-3 text-sm font-black text-slate-950">Add recipe</Link></div>
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-5">
        {[
          { key: "all", href: "/nutrition/cards", label: "All cards", icon: "◎", count: counts.all, hint: "Everything saved" },
          { key: "recipe", href: "/nutrition/cards?type=recipe", label: "Recipes", icon: "🍳", count: counts.recipe, hint: "Meals with ingredients + method" },
          { key: "ingredient", href: "/nutrition/cards?type=ingredient", label: "Ingredients", icon: "🥛", count: counts.ingredient, hint: "Single repeat ingredients" },
          { key: "product", href: "/nutrition/cards?type=product", label: "Products", icon: "🧃", count: counts.product, hint: "Packaged/barcode products" },
          { key: "menu", href: "/nutrition/cards?type=menu", label: "Takeaway menus", icon: "🍕", count: counts.menu, hint: "Restaurant/menu estimates" },
        ].map((item) => <Link key={item.key} href={item.href} className={`rounded-[2rem] border p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl ${type === item.key || (type === "all" && item.key === "all") ? "border-slate-950 bg-slate-950 text-white" : "border-white/70 bg-white text-slate-950"}`}><div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-full bg-emerald-50 text-2xl">{item.icon}</span><div><p className="font-black">{item.label}</p><p className={`text-xs font-semibold ${type === item.key ? "text-slate-300" : "text-slate-500"}`}>{item.count} saved · {item.hint}</p></div></div></Link>)}
      </section>

      <section className="rounded-[2rem] border border-white/70 bg-white/90 p-4 shadow-xl">
        <form className="grid gap-3 md:grid-cols-[1fr_auto_auto]" action="/nutrition/cards">
          <input name="q" defaultValue={q} placeholder="Search carbonara, Greggs, pizza, protein, barcode product..." className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold outline-none ring-emerald-500 focus:ring-2" />
          <select name="type" defaultValue={type} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold outline-none ring-emerald-500 focus:ring-2"><option value="all">All cards</option><option value="recipe">Recipes</option><option value="ingredient">Ingredients</option><option value="product">Products</option><option value="menu">Menus / takeaway</option></select>
          <button className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white">Search</button>
        </form>
      </section>

      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {filtered.map((meal) => <article key={meal.id} className="relative flex h-full flex-col overflow-hidden rounded-[2rem] border border-white/70 bg-white p-4 shadow-xl">
          <ProductUpdateBadge meal={meal} />
          <Link href={`/nutrition/cards/${meal.id}`} className="block"><MealImage meal={meal} /></Link>
          <div className="mt-4 flex flex-1 flex-col">
            <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-wide text-emerald-700">{recipeType(meal)} · {ingredientCount(meal)} ingredient line(s)</p><Link href={`/nutrition/cards/${meal.id}`} className="mt-1 block text-xl font-black text-slate-950 hover:text-emerald-700">{meal.label}</Link><p className="mt-1 text-xs font-semibold text-slate-500">Confidence {n(meal.nutrition_confidence).toFixed(0)}% · score {n(meal.nutrition_score).toFixed(0)}/100</p></div></div>
            <div className="mt-4 grid grid-cols-4 gap-2 text-xs font-black text-slate-700"><div className="rounded-2xl bg-slate-50 p-2"><span className="block text-slate-400">kcal</span>{n(meal.calories).toFixed(0)}</div><div className="rounded-2xl bg-slate-50 p-2"><span className="block text-slate-400">protein</span>{n(meal.protein_g).toFixed(0)}g</div><div className="rounded-2xl bg-slate-50 p-2"><span className="block text-slate-400">fibre</span>{n(meal.fibre_g).toFixed(1)}g</div><div className="rounded-2xl bg-slate-50 p-2"><span className="block text-slate-400">salt</span>{n(meal.salt_g).toFixed(1)}g</div></div>
            <MethodPreview meal={meal} />
            <div className="mt-auto pt-4">
              <div className="flex flex-wrap gap-2"><Link href={`/nutrition/cards/${meal.id}`} className="rounded-full bg-emerald-50 px-4 py-2 text-sm font-black text-emerald-800">View card</Link><Link href={`/nutrition?open=edit-recipe&meal=${meal.id}`} className="rounded-full bg-slate-100 px-4 py-2 text-sm font-black text-slate-700">Edit</Link><Link href={`/nutrition/cards/${meal.id}#log`} className="rounded-full bg-slate-950 px-4 py-2 text-sm font-black text-white">Log today</Link>{isHoldingImage(meal.image_url) ? <form action={refreshMealImage}><input type="hidden" name="id" value={meal.id} /><button className="rounded-full bg-orange-50 px-4 py-2 text-sm font-black text-orange-700">Render image</button></form> : null}{meal.source_url ? <a href={meal.source_url} target="_blank" rel="noreferrer" className="rounded-full bg-emerald-50 px-4 py-2 text-sm font-black text-emerald-800">Source</a> : null}<form action={setNutritionMealCardKind}><input type="hidden" name="id" value={meal.id} /><input type="hidden" name="card_kind" value={isProductLikeKind(`${meal.card_kind || ""} ${meal.product_data_source || ""}`) ? "recipe" : "product"} /><button className="rounded-full bg-slate-100 px-4 py-2 text-sm font-black text-slate-700">Mark as {isProductLikeKind(`${meal.card_kind || ""} ${meal.product_data_source || ""}`) ? "recipe" : "product"}</button></form><form action={deleteNutritionMeal}><input type="hidden" name="id" value={meal.id} /><button className="rounded-full bg-red-50 px-4 py-2 text-sm font-black text-red-600">Delete</button></form></div>
            </div>
          </div>
          {isProductLikeKind(`${meal.card_kind || ""} ${meal.product_data_source || ""}`) ? <form action={queueNutritionProductCorrection} className="mt-3 space-y-2"><input type="hidden" name="meal_id" value={meal.id} /><input type="hidden" name="label" value={meal.label} /><input name="source_url" placeholder="Submit label/source URL to correct this product" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold outline-none" /><button className="w-full rounded-full bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-800">Queue correction</button></form> : null}
        </article>)}
        {!filtered.length ? <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white/80 p-10 text-center text-sm font-semibold text-slate-500 md:col-span-2 xl:col-span-3">No saved cards match this search yet.</div> : null}
      </section>
    </main>
  </>;
}
