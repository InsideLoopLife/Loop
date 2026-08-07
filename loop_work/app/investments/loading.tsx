import { Nav } from "@/components/Nav";

function Line({ className = "" }: { className?: string }) {
  return <div className={`rounded-full bg-slate-200/80 ${className}`} />;
}

function SummaryCard({ accent = "blue" }: { accent?: "blue" | "teal" | "orange" | "slate" }) {
  const wash = accent === "teal" ? "bg-teal-50" : accent === "orange" ? "bg-orange-50" : accent === "slate" ? "bg-slate-50" : "bg-blue-50";
  return <div className="loop-page-skeleton min-h-64 rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm"><Line className="h-3 w-24" /><Line className="mt-5 h-8 w-36" /><Line className="mt-3 h-3 w-28" /><div className={`mt-7 h-24 rounded-3xl ${wash}`} /></div>;
}

function PersonRow({ accent = "blue" }: { accent?: "blue" | "teal" }) {
  return <div className="rounded-3xl border border-slate-100 bg-white p-4"><div className="flex items-center gap-3"><div className={`h-10 w-10 rounded-full ${accent === "teal" ? "bg-teal-100" : "bg-blue-100"}`} /><div className="flex-1"><Line className="h-4 w-28" /><Line className="mt-2 h-3 w-36" /></div></div><div className="mt-4 h-14 rounded-2xl bg-slate-50" /></div>;
}

export default function InvestmentsLoading() {
  return (
    <>
      <Nav />
      <main className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8" aria-label="Loading pensions and investments" role="status">
        <section className="loop-page-skeleton overflow-hidden rounded-[2.25rem] border border-blue-200 bg-gradient-to-r from-teal-950 via-slate-950 to-orange-950 p-7 text-white shadow-xl">
          <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr] lg:items-center">
            <div><div className="h-3 w-44 rounded-full bg-teal-200/35" /><div className="mt-5 h-12 w-72 max-w-full rounded-full bg-white/25" /><div className="mt-4 h-4 w-[34rem] max-w-full rounded-full bg-white/15" /><div className="mt-2 h-4 w-80 max-w-full rounded-full bg-white/10" /></div>
            <div className="grid grid-cols-3 gap-3">{[0, 1, 2].map((item) => <div key={item} className="h-28 rounded-3xl bg-white/10 ring-1 ring-white/10"><div className="m-4 h-3 w-16 rounded-full bg-white/15" /><div className="mx-4 mt-4 h-7 rounded-full bg-white/20" /></div>)}</div>
          </div>
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard accent="slate" /><SummaryCard accent="teal" /><SummaryCard accent="blue" /><SummaryCard accent="orange" />
        </section>

        <section className="mt-6 grid gap-5 xl:grid-cols-2">
          <div className="loop-page-skeleton min-h-80 rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm"><div className="flex items-center justify-between"><div><Line className="h-3 w-40" /><Line className="mt-3 h-6 w-72 max-w-full" /></div><Line className="h-9 w-28" /></div><div className="mt-5 grid gap-3 sm:grid-cols-2"><PersonRow accent="blue" /><PersonRow accent="blue" /></div></div>
          <div className="loop-page-skeleton min-h-80 rounded-[2rem] border border-slate-100 bg-white p-6 shadow-sm"><div className="flex items-center justify-between"><div><Line className="h-3 w-44" /><Line className="mt-3 h-6 w-80 max-w-full" /></div><Line className="h-9 w-28" /></div><div className="mt-5 grid gap-3 sm:grid-cols-2"><PersonRow accent="teal" /><PersonRow accent="teal" /><PersonRow accent="teal" /></div></div>
        </section>
        <span className="sr-only">Loading pensions and investments…</span>
      </main>
    </>
  );
}
