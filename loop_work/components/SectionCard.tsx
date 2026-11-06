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
    <div className="flex min-w-0 flex-1 items-start justify-between gap-4">
      <div className="min-w-0">
        <h2 className="text-[19px] font-semibold tracking-tight text-[var(--ink)]">{title}</h2>
        {description ? <p className="mt-0.5 max-w-2xl text-sm text-[var(--muted)]">{description}</p> : null}
      </div>
      {headerAction ? <div className="shrink-0">{headerAction}</div> : null}
    </div>
  );

  if (collapsible) {
    return (
      <details id={id} open={defaultOpen} className="group/card rounded-[18px] border border-[var(--line)] bg-white [&_summary::-webkit-details-marker]:hidden">
        <summary className="flex cursor-pointer list-none items-center gap-3 px-6 py-5">
          {header}
          <svg viewBox="0 0 20 20" className="h-5 w-5 shrink-0 text-[var(--muted)] transition group-open/card:rotate-180" aria-hidden><path d="M5 7.5 10 12.5 15 7.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </summary>
        <div className="px-6 pb-6">{children}</div>
      </details>
    );
  }

  return (
    <section id={id} className="rounded-[18px] border border-[var(--line)] bg-white p-6">
      <div className="mb-5">{header}</div>
      <div>{children}</div>
    </section>
  );
}
