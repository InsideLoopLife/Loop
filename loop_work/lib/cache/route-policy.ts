export type LoopRoutePolicy = {
  maxAgeMs: number;
  label: string;
};

const SECOND = 1_000;
const MINUTE = 60 * SECOND;

const ROUTE_POLICIES: Array<[RegExp, LoopRoutePolicy]> = [
  [/^\/investments(?:\/|$)/, { maxAgeMs: 30 * SECOND, label: "Investments" }],
  [/^\/(?:dashboard|briefing)(?:\/|$)/, { maxAgeMs: 60 * SECOND, label: "Overview" }],
  [/^\/(?:financial-flow|spending|income|accounts|savings|pots|net-worth)(?:\/|$)/, { maxAgeMs: 60 * SECOND, label: "Money" }],
  [/^\/(?:mortgage|house|affordability)(?:\/|$)/, { maxAgeMs: 5 * MINUTE, label: "Property" }],
  [/^\/(?:nutrition|lifestyle)(?:\/|$)/, { maxAgeMs: 2 * MINUTE, label: "Health" }],
  [/^\/(?:account|household|integrations)(?:\/|$)/, { maxAgeMs: 5 * MINUTE, label: "Account" }],
  [/^\/(?:help|notifications)(?:\/|$)/, { maxAgeMs: 5 * MINUTE, label: "LOOP" }],
];

export const DEFAULT_ROUTE_POLICY: LoopRoutePolicy = {
  maxAgeMs: 5 * MINUTE,
  label: "LOOP",
};

export function normaliseLoopPath(pathname: string) {
  const clean = String(pathname || "/").split("?")[0].replace(/\/+$/, "");
  return clean || "/";
}

export function routePolicy(pathname: string): LoopRoutePolicy {
  const path = normaliseLoopPath(pathname);
  return ROUTE_POLICIES.find(([pattern]) => pattern.test(path))?.[1] || DEFAULT_ROUTE_POLICY;
}

export function isPublicOrAuthRoute(pathname: string) {
  return /^\/(?:|login|signup|reset-password|access|accept-invite|onboarding)(?:\/|$)/.test(normaliseLoopPath(pathname));
}

