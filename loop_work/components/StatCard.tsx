type StatCardProps = {
  title: string;
  value: string;
  helper?: string;
};

export function StatCard({ title, value, helper }: StatCardProps) {
  return (
    <div className="rounded-[18px] border border-[var(--line)] bg-white p-5">
      <p className="text-sm font-medium text-[var(--muted)]">{title}</p>
      <p className="mt-1.5 text-[28px] font-semibold leading-none tracking-tight text-[var(--ink)]">{value}</p>
      {helper ? <p className="mt-2 text-sm text-[var(--muted)]">{helper}</p> : null}
    </div>
  );
}
