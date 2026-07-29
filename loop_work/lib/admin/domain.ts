import type { NextRequest } from "next/server";

export type AdminHostDecision = {
  isLocalhost: boolean;
  isAdminHost: boolean;
  isPublicHost: boolean;
  enforceAdminHost: boolean;
  allowLocalAdmin: boolean;
  allowed: boolean;
  host: string;
  adminHosts: string[];
  publicHosts: string[];
  reason: string;
};

function listEnv(name: string, fallback: string[]) {
  const raw = process.env[name];
  if (!raw) return fallback;
  return raw
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

export function adminHosts() {
  return listEnv("LOOP_ADMIN_HOSTS", ["admin.insideloop.life", "localhost", "127.0.0.1"]);
}

export function publicHosts() {
  return listEnv("LOOP_PUBLIC_HOSTS", ["insideloop.life", "app.insideloop.life", "localhost", "127.0.0.1"]);
}

export function normaliseHost(hostHeader?: string | null) {
  return String(hostHeader || "")
    .split(":")[0]
    .toLowerCase()
    .trim();
}

export function evaluateAdminHost(hostHeader?: string | null): AdminHostDecision {
  const host = normaliseHost(hostHeader);
  const local = host === "localhost" || host === "127.0.0.1" || host.endsWith(".local");
  const allowLocalAdmin = process.env.LOOP_ALLOW_LOCAL_ADMIN !== "false";
  const enforceAdminHost = process.env.LOOP_ENFORCE_ADMIN_HOST === "true";
  const admins = adminHosts();
  const publics = publicHosts();

  const isAdminHost = admins.includes(host);
  const isPublicHost = publics.includes(host);

  if (!enforceAdminHost) {
    return {
      host,
      isLocalhost: local,
      isAdminHost,
      isPublicHost,
      enforceAdminHost,
      allowLocalAdmin,
      adminHosts: admins,
      publicHosts: publics,
      allowed: true,
      reason: "Admin host enforcement is not enabled yet. This is expected on localhost/dev.",
    };
  }

  if (local && allowLocalAdmin) {
    return {
      host,
      isLocalhost: local,
      isAdminHost,
      isPublicHost,
      enforceAdminHost,
      allowLocalAdmin,
      adminHosts: admins,
      publicHosts: publics,
      allowed: true,
      reason: "Localhost admin access is allowed.",
    };
  }

  if (isAdminHost) {
    return {
      host,
      isLocalhost: local,
      isAdminHost,
      isPublicHost,
      enforceAdminHost,
      allowLocalAdmin,
      adminHosts: admins,
      publicHosts: publics,
      allowed: true,
      reason: "Request host is an allowed admin host.",
    };
  }

  return {
    host,
    isLocalhost: local,
    isAdminHost,
    isPublicHost,
    enforceAdminHost,
    allowLocalAdmin,
    adminHosts: admins,
    publicHosts: publics,
    allowed: false,
    reason: "Admin pages are blocked on this host. Use the admin subdomain.",
  };
}

export function isAdminPath(pathname: string) {
  return pathname === "/admin" || pathname.startsWith("/admin/") || pathname.startsWith("/api/admin/");
}

export function isCronPath(pathname: string) {
  return pathname.startsWith("/api/cron/");
}

export function cronSecretFromRequest(request: NextRequest) {
  const header = request.headers.get("authorization") || "";
  return header.replace(/^Bearer\s+/i, "").trim();
}
