export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-[1900px] px-3 py-4 sm:px-5 lg:px-6 xl:px-8">
      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <div className="hidden h-[620px] animate-pulse rounded-2xl bg-slate-100 lg:block" />
        <div className="space-y-4">
          <div className="h-9 w-72 animate-pulse rounded-xl bg-slate-100" />
          <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
            {[0,1,2,3].map((i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-white ring-1 ring-slate-100" />)}
          </div>
          <div className="h-[470px] animate-pulse rounded-3xl bg-white ring-1 ring-slate-100" />
        </div>
      </div>
    </main>
  );
}
