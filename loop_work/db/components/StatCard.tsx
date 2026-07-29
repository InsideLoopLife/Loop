type StatCardProps = {
  title: string;
  value: string;
  helper?: string;
};

export function StatCard({ title, value, helper }: StatCardProps) {
  return (
    <div className="table-shine relative overflow-hidden rounded-[2rem] border border-white/70 bg-white/86 p-5 shadow-[0_24px_74px_-52px_rgba(15,23,42,.72)] backdrop-blur-xl">
      <div className="absolute right-4 top-4 h-11 w-11 rounded-2xl bg-gradient-to-br from-orange-100 to-emerald-100" />
      <p className="relative text-sm font-bold text-slate-500">{title}</p>
      <p className="relative mt-2 text-3xl font-black tracking-tight text-slate-950">
        {value}
      </p>
      {helper ? <p className="relative mt-1 text-sm font-medium text-slate-500">{helper}</p> : null}
    </div>
  );
}
