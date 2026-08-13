export function WealthRouteSkeleton({ label = "your money" }: { label?: string }) {
  return (
    <main className="mx-auto min-h-screen w-full max-w-[1600px] px-4 pb-16 pt-8 sm:px-6 lg:px-10" aria-busy="true" aria-label={`Loading ${label}`}>
      <div className="loop-page-skeleton overflow-hidden rounded-[2rem] border border-slate-200 bg-white/90 p-6 shadow-sm">
        <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-indigo-700">
          <span className="h-2.5 w-2.5 rounded-full bg-indigo-500 motion-safe:animate-pulse" />
          Opening {label}
        </div>
        <div className="mt-4 h-9 w-64 max-w-[75%] rounded-xl bg-slate-200" />
        <div className="mt-3 h-4 w-[30rem] max-w-full rounded-full bg-slate-100" />
      </div>

      <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="loop-page-skeleton h-32 overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="h-3 w-24 rounded-full bg-slate-100" />
            <div className="mt-5 h-8 w-36 rounded-xl bg-slate-200" />
            <div className="mt-3 h-3 w-28 rounded-full bg-slate-100" />
          </div>
        ))}
      </section>

      <section className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(20rem,.55fr)]">
        <div className="loop-page-skeleton h-[26rem] overflow-hidden rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="h-4 w-40 rounded-full bg-slate-200" />
          <div className="mt-8 h-[18rem] rounded-[1.5rem] bg-gradient-to-b from-indigo-50 via-slate-50 to-emerald-50" />
        </div>
        <div className="space-y-4">
          {[0, 1, 2].map((item) => (
            <div key={item} className="loop-page-skeleton h-28 overflow-hidden rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="h-3 w-24 rounded-full bg-slate-100" />
              <div className="mt-4 h-6 w-44 rounded-lg bg-slate-200" />
            </div>
          ))}
        </div>
      </section>
      <p className="sr-only">The page is ready to navigate while current {label} information loads.</p>
    </main>
  );
}
