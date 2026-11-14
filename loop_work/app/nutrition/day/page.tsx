import { getVerifiedUser } from "@/lib/supabase/verified-user";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { createClient } from "@/lib/supabase/server";
import { addNutritionTotals, NUTRITION_TOTAL_KEYS, nutritionBalanceRecommendations, scoreNutritionDay, type NutritionTotals } from "@/lib/nutrition/scoring";
import { scoringTargets, targetsForPerson, type PersonTargets } from "@/lib/nutrition/targets";

type FoodLogRecord = Partial<NutritionTotals> & { id: string; label: string; eaten_on: string; eaten_at?: string | null; drink_volume_ml?: number | null; meal_slot: string; person_id: string | null };

function targetMap(t: PersonTargets): Partial<Record<keyof NutritionTotals, { label: string; target: number; unit: string; lowerIsBetter?: boolean; note: string }>> {
  const band = t.bandLabel.toLowerCase();
  return {
    ...(t.isChild ? {} : { calories: { label: "Calories", target: t.calories, unit: "kcal", note: "A guide only — needs vary with size and activity." } }),
    protein_g: { label: "Protein", target: t.protein_g, unit: "g", note: `UK reference amount for ${band}.` },
    fibre_g: { label: "Fibre", target: t.fibre_g, unit: "g", note: `UK guide for ${band}. Supports gut health, fullness and steadier blood sugar.` },
    salt_g: { label: "Salt", target: t.salt_g, unit: "g", lowerIsBetter: true, note: `UK limit for ${band}.` },
    added_sugar_g: { label: "Free sugars", target: t.added_sugar_g ?? 10, unit: "g", lowerIsBetter: true, note: t.added_sugar_g == null ? "Under 4s: avoid sugary foods and drinks." : `UK limit for ${band}. Includes added sugar, honey, syrups and fruit juice.` },
    saturated_fat_g: { label: "Saturated fat", target: t.saturated_fat_g, unit: "g", lowerIsBetter: true, note: "UK guidance; repeated high days trigger nudges." },
    caffeine_mg: { label: "Caffeine", target: t.caffeine_mg ?? 0, unit: "mg", lowerIsBetter: true, note: t.caffeine_mg == null ? "Children: add a weight for a caffeine guide (3mg per kg)." : t.isChild ? "About 3mg per kg for children (EFSA)." : `Up to ${t.caffeine_mg}mg a day.` },
    calcium_mg: { label: "Calcium", target: t.calcium_mg, unit: "mg", note: `UK reference nutrient intake, ${band}.` },
    iron_mg: { label: "Iron", target: t.iron_mg, unit: "mg", note: `UK reference nutrient intake, ${band}.` },
    potassium_mg: { label: "Potassium", target: t.potassium_mg, unit: "mg", note: "Helpful alongside sodium balance." },
    magnesium_mg: { label: "Magnesium", target: t.magnesium_mg, unit: "mg", note: `UK reference nutrient intake, ${band}.` },
    zinc_mg: { label: "Zinc", target: t.zinc_mg, unit: "mg", note: `UK reference nutrient intake, ${band}.` },
    folate_ug: { label: "Folate", target: t.folate_ug, unit: "µg", note: "Pregnancy advice is different (a 400µg supplement)." },
    vitamin_c_mg: { label: "Vitamin C", target: t.vitamin_c_mg, unit: "mg", note: `UK reference nutrient intake, ${band}.` },
    vitamin_d_ug: { label: "Vitamin D", target: t.vitamin_d_ug, unit: "µg", note: "Hard to get from food; UK advice is a 10µg supplement in autumn and winter." },
    vitamin_b12_ug: { label: "Vitamin B12", target: t.vitamin_b12_ug, unit: "µg", note: "Low risk is higher with vegan diets." },
    thiamin_mg: { label: "Thiamin (B1)", target: t.thiamin_mg, unit: "mg", note: `UK reference nutrient intake, ${band}.` },
    niacin_mg: { label: "Niacin (B3)", target: t.niacin_mg, unit: "mg", note: `UK reference nutrient intake, ${band}.` },
  };
}

function number(value: unknown) { return Number(value || 0); }
function dateLabel(date: string) { return new Date(`${date}T00:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }); }
function nutritionFromRecord(record: Record<string, unknown>) {
  return NUTRITION_TOTAL_KEYS.reduce<NutritionTotals>((acc, key) => { acc[key] = number(record[key]); return acc; }, {} as NutritionTotals);
}
function tone(value: number, target: number, lowerIsBetter?: boolean) {
  const ratio = target > 0 ? value / target : 0;
  if (lowerIsBetter) return ratio <= 0.75 ? "bg-emerald-500" : ratio <= 1 ? "bg-amber-400" : "bg-red-500";
  return ratio < 0.35 ? "bg-red-400" : ratio < 0.75 ? "bg-amber-400" : ratio <= 1.2 ? "bg-emerald-500" : "bg-orange-400";
}

export default async function NutritionDayPage({ searchParams }: { searchParams?: Promise<{ date?: string; person?: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await getVerifiedUser(supabase);
  if (!user) redirect("/login");
  const params = await searchParams;
  const selectedDate = params?.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : new Date().toISOString().slice(0, 10);
  const personView = String(params?.person || "__all__");

  let query = supabase
    .from("food_logs")
    .select("id, label, eaten_on, eaten_at, drink_volume_ml, meal_slot, person_id, calories, protein_g, carbs_g, fat_g, fibre_g, soluble_fibre_g, insoluble_fibre_g, sugar_g, added_sugar_g, natural_sugar_g, salt_g, saturated_fat_g, trans_fat_g, monounsaturated_fat_g, polyunsaturated_fat_g, sodium_mg, potassium_mg, calcium_mg, iron_mg, magnesium_mg, zinc_mg, folate_ug, niacin_mg, thiamin_mg, vitamin_c_mg, vitamin_d_ug, vitamin_b12_ug, omega_3_g, caffeine_mg, energy_density_kcal_per_g, glycemic_impact_score")
    .eq("user_id", user.id)
    .eq("eaten_on", selectedDate);
  if (personView === "__household__") query = query.is("person_id", null);
  else if (personView !== "__all__") query = query.eq("person_id", personView);

  const { data: logs } = await query
    .order("eaten_at", { ascending: true, nullsFirst: false }).order("meal_slot")
    .returns<FoodLogRecord[]>();

  const personRow = personView !== "__all__" && personView !== "__household__"
    ? (await supabase.from("people").select("birth_date, relationship, nutrition_reference_sex, weight_kg, caffeine_limit_mg, daily_calorie_target").eq("id", personView).eq("user_id", user.id).maybeSingle()).data
    : null;
  const personTargets = targetsForPerson(personRow as any, selectedDate);
  const TARGETS = targetMap(personTargets);
  const scoringProfile = { targets: scoringTargets(personTargets) };
  const totals = addNutritionTotals((logs || []).map((log) => nutritionFromRecord(log as Record<string, unknown>)));
  const hydrationMl = (logs || []).reduce((sum, log) => sum + number(log.drink_volume_ml), 0);
  const score = logs?.length ? scoreNutritionDay(totals, 0, scoringProfile) : { score: 0, label: "Not started", highlights: [], nudges: [] } as any;
  const balance = nutritionBalanceRecommendations(totals, scoringProfile, score.nudges || []);

  return <>
    <Nav />
    <main className="mx-auto w-[95vw] max-w-none space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[2.5rem] bg-slate-950 p-7 text-white shadow-2xl">
        <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-200">LoopHealth detail</p>
        <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div><h1 className="text-4xl font-black tracking-tight">{dateLabel(selectedDate)}</h1><p className="mt-2 text-sm font-semibold text-slate-300">Every nutrient for this day, against UK targets for {personTargets.bandLabel.toLowerCase()}{personTargets.ageYears != null && personTargets.band === "adult" ? ` (age ${personTargets.ageYears})` : ""}.</p></div>
          <Link href={`/nutrition?date=${selectedDate}`} className="rounded-full bg-white px-5 py-3 text-sm font-black text-slate-950">Back to daily view</Link>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-[2rem] bg-white p-5 shadow-lg"><p className="text-xs font-black uppercase text-slate-500">Daily score</p><p className="mt-2 text-3xl font-black text-slate-950">{score.score}/100</p><p className="text-sm font-semibold text-slate-500">{score.label}</p></div>
        <div className="rounded-[2rem] bg-white p-5 shadow-lg"><p className="text-xs font-black uppercase text-slate-500">Logged</p><p className="mt-2 text-3xl font-black text-slate-950">{logs?.length || 0}</p><p className="text-sm font-semibold text-slate-500">food/drink item(s)</p></div>
        <div className="rounded-[2rem] bg-white p-5 shadow-lg"><p className="text-xs font-black uppercase text-slate-500">Processed load</p><p className="mt-2 text-3xl font-black text-slate-950">{balance.processed.score}/100</p><p className="text-sm font-semibold text-slate-500">{balance.processed.label}</p></div>
        <div className="rounded-[2rem] bg-white p-5 shadow-lg"><p className="text-xs font-black uppercase text-slate-500">Gut health</p><p className="mt-2 text-3xl font-black text-slate-950">{balance.gut.score}/100</p><p className="text-sm font-semibold text-slate-500">{balance.gut.label}</p></div>
        <div className="rounded-[2rem] bg-white p-5 shadow-lg"><p className="text-xs font-black uppercase text-slate-500">Logged fluids</p><p className="mt-2 text-3xl font-black text-slate-950">{hydrationMl.toLocaleString()}ml</p><p className="text-sm font-semibold text-slate-500">from drink entries</p></div>
      </section>

      <section className="rounded-[2.5rem] bg-white p-6 shadow-xl">
        <h2 className="text-2xl font-black text-slate-950">All nutrients</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {NUTRITION_TOTAL_KEYS.map((key) => {
            const ref = TARGETS[key];
            const value = number(totals[key]);
            const target = ref?.target || 0;
            const percent = target ? Math.max(4, Math.min(100, value / target * 100)) : 0;
            return <div key={key} className="rounded-[1.5rem] border border-slate-100 bg-slate-50 p-4">
              <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-black uppercase tracking-wide text-slate-500">{ref?.label || key.replace(/_/g, " ")}</p><p className="mt-1 text-2xl font-black text-slate-950">{value.toFixed(key.endsWith("_mg") || key.endsWith("_ug") || key === "calories" ? 0 : 2)}{ref?.unit ? ` ${ref.unit}` : ""}</p></div>{ref ? <span className="rounded-full bg-white px-2 py-1 text-xs font-black text-slate-500">target {ref.target}{ref.unit}</span> : null}</div>
              {ref ? <div className="mt-3 h-2 overflow-hidden rounded-full bg-white"><div className={`h-full rounded-full ${tone(value, ref.target, ref.lowerIsBetter)}`} style={{ width: `${percent}%` }} /></div> : null}
              <p className="mt-2 text-xs font-semibold text-slate-500">{ref?.note || "Tracked for trend analysis and future personalised coaching."}</p>
            </div>;
          })}
        </div>
      </section>

      <section className="rounded-[2.5rem] border border-emerald-100 bg-emerald-50 p-6">
        <h2 className="text-xl font-black text-emerald-950">Pattern coaching</h2>
        <div className="mt-3 space-y-1 text-sm font-semibold text-emerald-900">{[...(score.highlights || []), ...balance.recommendations].length ? [...(score.highlights || []), ...balance.recommendations].map((item) => <p key={item}>• {item}</p>) : <p>• Keep logging meals and drinks to build a reliable pattern over time.</p>}</div>
      </section>
    </main>
  </>;
}
