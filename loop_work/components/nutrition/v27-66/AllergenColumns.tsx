type AllergenFact = {
  key: string;
  label: string;
  evidence?: string | null;
  confidence?: number | null;
};

type AllergenColumnsProps = {
  contains?: AllergenFact[];
  mayContain?: AllergenFact[];
};

export function AllergenColumns({ contains = [], mayContain = [] }: AllergenColumnsProps) {
  if (!contains.length && !mayContain.length) return null;

  return (
    <section className="grid gap-3 md:grid-cols-2">
      <div className="rounded-3xl border border-rose-100 bg-rose-50 p-4">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-rose-700">Contains</p>
        {contains.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {contains.map((item) => (
              <span key={`${item.key}-contains`} className="rounded-full bg-white px-3 py-2 text-sm font-black text-rose-700">
                {item.label}
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm font-bold text-slate-500">No direct allergens flagged from the source.</p>
        )}
      </div>

      <div className="rounded-3xl border border-amber-100 bg-amber-50 p-4">
        <p className="text-xs font-black uppercase tracking-[0.18em] text-amber-800">May contain / traces</p>
        {mayContain.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {mayContain.map((item) => (
              <span key={`${item.key}-may`} className="rounded-full bg-white px-3 py-2 text-sm font-black text-amber-800">
                May contain {item.label.toLowerCase()}
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm font-bold text-slate-500">No may-contain warnings found.</p>
        )}
      </div>
    </section>
  );
}
