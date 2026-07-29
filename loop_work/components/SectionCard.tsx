export function SectionCard({
  id,
  title,
  description,
  children,
  collapsible,
  defaultOpen = true,
  headerAction,
}: {
  id?: string;
  title: string;
  description?: string;
  children: React.ReactNode;
  /** When true, the whole card becomes a native <details> disclosure instead of always-open. */
  collapsible?: boolean;
  /** Only used when collapsible is true. Defaults to open. */
  defaultOpen?: boolean;
  /** Optional button/node rendered to the right of the title, e.g. a "+" to open an add modal. */
  headerAction?: React.ReactNode;
}) {
  const header = (
    <div className="relative mb-5 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="mb-2 h-1.5 w-10 rounded-full bg-gradient-to-r from-orange-500 via-amber-400 to-emerald-400" />
        <h2 className="text-xl font-black tracking-tight text-slate-950">{title}</h2>
        {description ? <p className="mt-1 max-w-4xl text-sm font-medium text-slate-500">{description}</p> : null}
      </div>
      {headerAction ? <div className="shrink-0">{headerAction}</div> : null}
    </div>
  );

  if (collapsible) {
    return (
      <details id={id} open={defaultOpen} className="group/card relative overflow-hidden rounded-[2rem] border border-white/70 bg-white/84 shadow-[0_28px_90px_-58px_rgba(15,23,42,.75)] backdrop-blur-xl [&_summary::-webkit-details-marker]:hidden">
        <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent" />
        <div className="pointer-events-none absolute -right-24 -top-28 h-52 w-52 rounded-full bg-orange-100/55 blur-3xl" />
        <summary className="relative flex cursor-pointer list-none items-start justify-between gap-3 p-6 pb-0">
          {header}
          <span className="mt-1 shrink-0 rounded-full bg-slate-100 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-slate-500">
            <span className="hidden group-open/card:inline">Hide</span>
            <span className="inline group-open/card:hidden">Show</span>
          </span>
        </summary>
        <div className="relative px-6 pb-6">{children}</div>
      </details>
    );
  }

  return (
    <section id={id} className="group relative overflow-hidden rounded-[2rem] border border-white/70 bg-white/84 p-6 shadow-[0_28px_90px_-58px_rgba(15,23,42,.75)] backdrop-blur-xl">
      <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent" />
      <div className="pointer-events-none absolute -right-24 -top-28 h-52 w-52 rounded-full bg-orange-100/55 blur-3xl transition group-hover:bg-orange-200/70" />
      {header}
      <div className="relative">{children}</div>
    </section>
  );
}
