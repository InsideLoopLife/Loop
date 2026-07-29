import Link from "next/link";
import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { createClient } from "@/lib/supabase/server";
import { addNutritionTotals, NUTRITION_TOTAL_KEYS, nutritionBalanceRecommendations, scoreNutritionDay, type NutritionTotals } from "@/lib/nutrition/scoring";

type FoodLogRecord = Partial<NutritionTotals> & { id: string; label: string; eaten_on: string; eaten_at?: string | null; drink_volume_ml?: number | null; meal_slot: string; person_id: string | null };

const TARGETS: Partial<Record<keyof NutritionTotals, { label: string; target: number; unit: string; lowerIsBetter?: boolean; note: string }>> = {
  calories: { label: "Calories", target: 2200, unit: "kcal", note: "Default adult target; can later be adjusted by BMR, weight goal and active energy." },
  protein_g: { label: "Protein", target: 75, unit: "g", note: "Useful for satiety, muscle and recovery. Personal target can use body weight/training load." },
  fibre_g: { label: "Fibre", target: 30, unit: "g", note: "UK adult guide. Supports gut health, fullness and steadier blood sugar." },
  soluble_fibre_g: { label: "Soluble fibre", target: 7, unit: "g", note: "Useful for gut bacteria and blood-sugar/cholesterol support." },
  salt_g: { label: "Salt", target: 6, unit: "g", lowerIsBetter: true, note: "UK adult guide is around 6g/day. Lower is usually better unless medically advised otherwise." },
  added_sugar_g: { label: "Added sugar", target: 30, unit: "g", lowerIsBetter: true, note: "Free/added sugar target varies by guidance; this is a practical daily ceiling." },
  saturated_fat_g: { label: "Saturated fat", target: 20, unit: "g", lowerIsBetter: true, note: "High intake can affect blood lipids; context matters, but repeated high days trigger nudges." },
  caffeine_mg: { label: "Caffeine", target: 400, unit: "mg", lowerIsBetter: true, note: "Broad adult ceiling. Pregnancy, breastfeeding, anxiety and sleep issues can lower this." },
  calcium_mg: { label: "Calcium", target: 700, unit: "mg", note: "UK adult reference intake." },
  iron_mg: { label: "Iron", target: 8, unit: "mg", note: "Baseline adult target; needs can be higher for menstruation/pregnancy." },
  potassium_mg: { label: "Potassium", target: 3500, unit: "mg", note: "Helpful alongside sodium balance and blood-pressure context." },
  magnesium_mg: { label: "Magnesium", target: 300, unit: "mg", note: "Supports muscle and metabolic function; target varies by sex." },
  zinc_mg: { label: "Zinc", target: 9.5, unit: "mg", note: "Supports immune/metabolic function; target varies by sex." },
  folate_ug: { label: "Folate", target: 200, unit: "µg", note: "Baseline adult target; pregnancy advice is different." },
  vitamin_c_mg: { label: "Vitamin C", target: 80, unit: "mg", note: "Supports absorption of non-haem iron and general nutrition quality." },
  vitamin_d_ug: { label: "Vitamin D", target: 10, unit: "µg", note: "Often needs supplement context in the UK, especially in winter." },
  vitamin_b12_ug: { label: "Vitamin B12", target: 1.5, unit: "µg", note: "Important for blood/nerve function; low risk is higher with vegan diets." },
};

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
  const { data: { user } } = await supabase.auth.getUser();
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

  const totals = addNutritionTotals((logs || []).map((log) => nutritionFromRecord(log as Record<string, unknown>)));
  const hydrationMl = (logs || []).reduce((sum, log) => sum + number(log.drink_volume_ml), 0);
  const score = logs?.length ? scoreNutritionDay(totals) : { score: 0, label: "Not started", highlights: [], nudges: [] } as any;
  const balance = nutritionBalanceRecommendations(totals, undefined, score.nudges || []);

  return <>
    <Nav />
    <main className="mx-auto w-[95vw] max-w-none space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[2.5rem] bg-slate-950 p-7 text-white shadow-2xl">
        <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-200">LoopHealth detail</p>
        <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div><h1 className="text-4xl font-black tracking-tight">{dateLabel(selectedDate)}</h1><p className="mt-2 text-sm font-semibold text-slate-300">Full nutrient dashboard for the selected person/view. Personal targets can later use age, sex, height, weight, goals and Apple Health active energy.</p></div>
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
