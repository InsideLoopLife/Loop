export function SectionCard({
  title,
  description,
  children,
  id,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="group relative overflow-hidden rounded-[2rem] border border-white/70 bg-white/84 p-6 shadow-[0_28px_90px_-58px_rgba(15,23,42,.75)] backdrop-blur-xl">
      <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent" />
      <div className="pointer-events-none absolute -right-24 -top-28 h-52 w-52 rounded-full bg-orange-100/55 blur-3xl transition group-hover:bg-orange-200/70" />
      <div className="relative mb-5 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 h-1.5 w-10 rounded-full bg-gradient-to-r from-orange-500 via-amber-400 to-emerald-400" />
          <h2 className="text-xl font-black tracking-tight text-slate-950">{title}</h2>
          {description ? <p className="mt-1 max-w-4xl text-sm font-medium text-slate-500">{description}</p> : null}
        </div>
      </div>
      <div className="relative">{children}</div>
    </section>
  );
}
