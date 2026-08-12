import { normaliseLoopPath } from "@/lib/cache/route-policy";

const CHECKED_PREFIX = "loop:route-checked:v1:";
const VISITED_PREFIX = "loop:route-visited:v1:";

function storage() {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function key(prefix: string, pathname: string) {
  return `${prefix}${normaliseLoopPath(pathname)}`;
}

export function lastRouteCheck(pathname: string) {
  const value = Number(storage()?.getItem(key(CHECKED_PREFIX, pathname)) || 0);
  return Number.isFinite(value) ? value : 0;
}

export function markRouteChecked(pathname: string, checkedAt = Date.now()) {
  storage()?.setItem(key(CHECKED_PREFIX, pathname), String(checkedAt));
  storage()?.setItem(key(VISITED_PREFIX, pathname), String(checkedAt));
}

export function markRouteVisited(pathname: string) {
  storage()?.setItem(key(VISITED_PREFIX, pathname), String(Date.now()));
}

export function routeWasVisited(pathname: string) {
  return Boolean(storage()?.getItem(key(VISITED_PREFIX, pathname)));
}

export function routeNeedsRefresh(pathname: string, maxAgeMs: number, now = Date.now()) {
  const checkedAt = lastRouteCheck(pathname);
  return checkedAt === 0 || now - checkedAt >= maxAgeMs;
}

export function markRoutesStale(pathnames: string[]) {
  const target = storage();
  pathnames.forEach((pathname) => target?.removeItem(key(CHECKED_PREFIX, pathname)));
}

export function emitRoutesStale(pathnames: string[]) {
  if (typeof window === "undefined") return;
  const routes = pathnames.map(normaliseLoopPath);
  markRoutesStale(routes);
  window.dispatchEvent(new CustomEvent("loop:routes-stale", { detail: { routes } }));
}

