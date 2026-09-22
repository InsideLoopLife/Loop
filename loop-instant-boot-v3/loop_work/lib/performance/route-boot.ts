export const ROUTE_BOOT_KEYS = [
  "briefing",
  "dashboard",
  "financial-flow",
  "income",
  "spending",
  "accounts",
  "investments",
  "mortgage",
  "net-worth",
  "retirement",
  "nutrition",
  "lifestyle",
] as const;

export type RouteBootKey = (typeof ROUTE_BOOT_KEYS)[number];
export type RouteBootTone =
  | "slate"
  | "green"
  | "orange"
  | "blue"
  | "violet";

export type RouteBootMetric = {
  label: string;
  value: string;
  helper?: string;
};

export type RouteBootPayload = {
  version: 1;
  eyebrow: string;
  title: string;
  headline?: string;
  description?: string;
  tone?: RouteBootTone;
  metrics?: RouteBootMetric[];
};

const routeKeySet = new Set<string>(ROUTE_BOOT_KEYS);

export function isRouteBootKey(value: unknown): value is RouteBootKey {
  return typeof value === "string" && routeKeySet.has(value);
}

function safeText(value: unknown, max = 120) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

export function sanitizeRouteBootPayload(
  value: unknown,
): RouteBootPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;

  const eyebrow = safeText(source.eyebrow, 48);
  const title = safeText(source.title, 100);
  if (!eyebrow || !title) return null;

  const toneValues: RouteBootTone[] = [
    "slate",
    "green",
    "orange",
    "blue",
    "violet",
  ];
  const tone = toneValues.includes(source.tone as RouteBootTone)
    ? (source.tone as RouteBootTone)
    : "slate";

  const metrics = Array.isArray(source.metrics)
    ? source.metrics
        .slice(0, 5)
        .map((row) => {
          if (!row || typeof row !== "object" || Array.isArray(row)) return null;
          const metric = row as Record<string, unknown>;
          const label = safeText(metric.label, 48);
          const metricValue = safeText(metric.value, 64);
          if (!label || !metricValue) return null;
          const helper = safeText(metric.helper, 96);
          return {
            label,
            value: metricValue,
            ...(helper ? { helper } : {}),
          };
        })
        .filter(Boolean) as RouteBootMetric[]
    : [];

  return {
    version: 1,
    eyebrow,
    title,
    ...(safeText(source.headline, 80)
      ? { headline: safeText(source.headline, 80) }
      : {}),
    ...(safeText(source.description, 220)
      ? { description: safeText(source.description, 220) }
      : {}),
    tone,
    ...(metrics.length ? { metrics } : {}),
  };
}
