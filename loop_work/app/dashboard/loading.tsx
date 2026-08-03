export default function DashboardLoading() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 sm:px-6 lg:px-8" aria-busy="true" aria-label="Loading dashboard">
      <div className="mx-auto max-w-7xl animate-pulse space-y-6">
        <div className="h-10 w-56 rounded-2xl bg-slate-200" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-32 rounded-3xl bg-white shadow-sm" />
          ))}
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="h-96 rounded-3xl bg-white shadow-sm lg:col-span-2" />
          <div className="h-96 rounded-3xl bg-white shadow-sm" />
        </div>
      </div>
    </main>
  );
}
