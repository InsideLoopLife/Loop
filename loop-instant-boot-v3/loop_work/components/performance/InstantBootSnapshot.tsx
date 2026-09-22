import { createClient } from "@/lib/supabase/server";
import { WealthRouteSkeleton } from "@/components/loading/WealthRouteSkeleton";
import {
  isRouteBootKey,
  sanitizeRouteBootPayload,
  type RouteBootKey,
  type RouteBootTone,
} from "@/lib/performance/route-boot";

const TONES: Record<
  RouteBootTone,
  { wash: string; accent: string; dot: string }
> = {
  slate: {
    wash: "from-slate-50 to-white",
    accent: "text-slate-700",
    dot: "bg-slate-500",
  },
  green: {
    wash: "from-emerald-50 to-white",
    accent: "text-emerald-700",
    dot: "bg-emerald-500",
  },
  orange: {
    wash: "from-orange-50 to-white",
    accent: "text-orange-700",
    dot: "bg-orange-500",
  },
  blue: {
    wash: "from-sky-50 to-white",
    accent: "text-sky-700",
    dot: "bg-sky-500",
  },
  violet: {
    wash: "from-violet-50 to-white",
    accent: "text-violet-700",
    dot: "bg-violet-500",
  },
};

function ageLabel(value?: string | null) {
  if (!value) return "last complete view";
  const age = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(age) || age < 0) return "last complete view";
  const minutes = Math.floor(age / 60_000);
  if (minutes < 1) return "saved just now";
  if (minutes < 60) return `saved ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `saved ${hours}h ago`;
  return `saved ${Math.floor(hours / 24)}d ago`;
}

export async function InstantBootSnapshot({
  routeKey,
  fallbackLabel,
}: {
  routeKey: RouteBootKey;
  fallbackLabel: string;
}) {
  if (!isRouteBootKey(routeKey)) {
    return <WealthRouteSkeleton label={fallbackLabel} />;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return <WealthRouteSkeleton label={fallbackLabel} />;

  const { data, error } = await (supabase as any).rpc(
    "get_route_boot_snapshot",
    { p_route_key: routeKey },
  );

  const row = Array.isArray(data) ? data[0] : data;
  const payload = sanitizeRouteBootPayload(row?.payload);

  if (error || !payload) {
    return <WealthRouteSkeleton label={fallbackLabel} />;
  }

  const tone = TONES[payload.tone || "slate"];

  return (
    <main
      className="mx-auto w-[95vw] max-w-[2000px] px-4 py-6 sm:px-6 lg:px-8"
      aria-busy="true"
      aria-label={`Refreshing ${fallbackLabel}`}
    >
      <section
        className={`overflow-hidden rounded-[2rem] border border-white/80 bg-gradient-to-br ${tone.wash} p-5 shadow-[0_22px_70px_-54px_rgba(15,23,42,.7)] sm:p-6`}
      >
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p
              className={`flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] ${tone.accent}`}
            >
              <span className={`h-2 w-2 rounded-full ${tone.dot}`} />
              {payload.eyebrow}
            </p>
            <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
              {payload.title}
            </h1>
            {payload.headline ? (
              <p className="mt-3 text-4xl font-black tracking-tight text-slate-950">
                {payload.headline}
              </p>
            ) : null}
            {payload.description ? (
              <p className="mt-2 max-w-3xl text-sm font-bold leading-6 text-slate-500">
                {payload.description}
              </p>
            ) : null}
          </div>

          <div className="shrink-0 rounded-full bg-white px-4 py-2 text-xs font-black text-slate-500 shadow-sm ring-1 ring-slate-200">
            {ageLabel(row?.updated_at || row?.generated_at)} · refreshing now
          </div>
        </div>

        {payload.metrics?.length ? (
          <div className="-mx-1 mt-5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2 [scrollbar-width:thin] lg:grid lg:grid-cols-4 lg:overflow-visible lg:pb-0">
            {payload.metrics.map((metric) => (
              <article
                key={metric.label}
                className="min-w-[11rem] flex-1 snap-start rounded-2xl border border-slate-100 bg-white/90 p-4 shadow-sm"
              >
                <p className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                  {metric.label}
                </p>
                <p className="mt-1 text-xl font-black text-slate-950">
                  {metric.value}
                </p>
                {metric.helper ? (
                  <p className="mt-1 text-xs font-bold text-slate-500">
                    {metric.helper}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </main>
  );
}
