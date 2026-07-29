type NutrientValue = {
  key: string;
  label: string;
  value: number | string | null | undefined;
  unit?: string;
};

type NutrientSnapshotGridProps = {
  nutrients: NutrientValue[];
  title?: string;
};

export function NutrientSnapshotGrid({ nutrients, title = "Macro / micro nutrients" }: NutrientSnapshotGridProps) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-black uppercase tracking-[0.25em] text-emerald-600">Nutrition transparency</p>
      <h2 className="mt-1 text-2xl font-black">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">
        These values come from the product card or label. If a can/bottle size differs, open the product and correct the serving size.
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {nutrients.map((nutrient) => (
          <div key={nutrient.key} className="rounded-2xl bg-slate-50 p-4">
            <p className="text-xs font-black uppercase tracking-[0.15em] text-slate-400">{nutrient.label}</p>
            <p className="mt-1 text-xl font-black">
              {nutrient.value ?? 0}
              {nutrient.unit ? <span className="ml-1 text-sm text-slate-500">{nutrient.unit}</span> : null}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
