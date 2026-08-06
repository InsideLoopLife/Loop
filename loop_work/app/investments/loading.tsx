import { Nav } from "@/components/Nav";

function Line({ className = "" }: { className?: string }) {
  return <div className={`rounded-full bg-slate-200/80 ${className}`} />;
}

function HoldingSkeleton({ accent }: { accent: "blue" | "teal" | "orange" }) {
  const border = accent === "teal" ? "border-teal-200" : accent === "orange" ? "border-orange-200" : "border-blue-200";
  const disc = accent === "teal" ? "bg-teal-100" : accent === "orange" ? "bg-orange-100" : "bg-blue-100";
  return (
    <div className={`loop-page-skeleton overflow-hidden rounded-[2rem] border ${border} bg-white/85 p-5 shadow-sm`}>
      <div className="grid gap-5 xl:grid-cols-[minmax(300px,1fr)_minmax(300px,420px)_220px] xl:items-center">
        <div className="flex gap-3">
          <div className={`h-12 w-12 shrink-0 rounded-2xl ${disc}`} />
          <div className="w-full space-y-3 pt-1">
            <Line className="h-5 w-2/3" />
            <Line className="h-3 w-1/2" />
            <Line className="h-3 w-4/5" />
          </div>
        </div>
        <div className="h-28 rounded-[1.5rem] border border-slate-100 bg-gradient-to-br from-blue-50 via-white to-teal-50 p-4">
          <div className="mt-8 h-10 rounded-full border-b-4 border-blue-200/80" />
        </div>
        <div className="space-y-3 xl:text-right">
          <Line className="ml-auto h-8 w-36" />
          <Line className="ml-auto h-4 w-24" />
        </div>
      </div>
    </div>
  );
}

export default function InvestmentsLoading() {
  return (
    <>
      <Nav />
      <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="loop-page-skeleton overflow-hidden rounded-[2.25rem] border border-blue-200 bg-gradient-to-br from-slate-950 via-blue-950 to-teal-950 p-6 text-white shadow-xl">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-4">
              <div className="h-3 w-36 rounded-full bg-blue-200/30" />
              <div className="h-10 w-72 max-w-full rounded-full bg-white/20" />
              <div className="h-4 w-96 max-w-full rounded-full bg-white/15" />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {[0, 1, 2].map((item) => <div key={item} className="h-20 w-32 rounded-3xl bg-white/10 ring-1 ring-white/15" />)}
            </div>
          </div>
        </div>
        <div className="mt-6 space-y-3" aria-label="Loading investments" role="status">
          <HoldingSkeleton accent="blue" />
          <HoldingSkeleton accent="teal" />
          <HoldingSkeleton accent="orange" />
          <span className="sr-only">Loading investments…</span>
        </div>
      </main>
    </>
  );
}
