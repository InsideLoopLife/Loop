import { createClient } from "@supabase/supabase-js";

export type SupabaseAdminKeyStatus = {
  configured: boolean;
  usable: boolean;
  sourceName: string | null;
  reason: string;
  keyStyle: "none" | "jwt_service_role" | "jwt_other" | "supabase_secret" | "publishable" | "unknown";
};

const ADMIN_KEY_ENV_NAMES = [
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SERVICE_KEY",
  "SUPABASE_ADMIN_KEY",
  "SUPABASE_SERVICE_ROLE",
] as const;

export function getSupabaseAdminKeyWithSource(): { key: string; sourceName: string | null } {
  for (const name of ADMIN_KEY_ENV_NAMES) {
    const value = String(process.env[name] || "").trim();
    if (value) return { key: value, sourceName: name };
  }
  return { key: "", sourceName: null };
}

export function getSupabaseAdminKey(): string {
  return getSupabaseAdminKeyWithSource().key;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
    return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
  } catch {
    return null;
  }
}

export function describeSupabaseAdminKey(): SupabaseAdminKeyStatus {
  const { key, sourceName } = getSupabaseAdminKeyWithSource();
  if (!key) {
    return {
      configured: false,
      usable: false,
      sourceName: null,
      keyStyle: "none",
      reason: "No server-side Supabase admin key was found.",
    };
  }

  if (key.startsWith("sb_publishable_")) {
    return {
      configured: true,
      usable: false,
      sourceName,
      keyStyle: "publishable",
      reason: `${sourceName} is a Supabase publishable key, not a server-only secret/service-role key.`,
    };
  }

  // Supabase's newer secret keys are opaque and start with sb_secret_. They do not decode as JWTs,
  // but they are valid server-side API keys for privileged server work when configured in Supabase.
  if (key.startsWith("sb_secret_")) {
    return {
      configured: true,
      usable: true,
      sourceName,
      keyStyle: "supabase_secret",
      reason: `${sourceName} is present as a Supabase secret key.`,
    };
  }

  const payload = decodeJwtPayload(key);
  const role = String(payload?.role || "");
  if (role === "service_role" || role === "supabase_admin") {
    return {
      configured: true,
      usable: true,
      sourceName,
      keyStyle: "jwt_service_role",
      reason: `${sourceName} is present as a service-role JWT.`,
    };
  }

  if (payload) {
    return {
      configured: true,
      usable: false,
      sourceName,
      keyStyle: "jwt_other",
      reason: `${sourceName} is a JWT but its role is '${role || "missing"}', not service_role.`,
    };
  }

  return {
    configured: true,
    usable: false,
    sourceName,
    keyStyle: "unknown",
    reason: `${sourceName} is present but is not recognised as a Supabase secret key or service-role JWT.`,
  };
}

export function hasSupabaseAdminKey(): boolean {
  return describeSupabaseAdminKey().usable;
}

export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const status = describeSupabaseAdminKey();
  const secretKey = getSupabaseAdminKey();

  if (!supabaseUrl || !secretKey) {
    throw new Error(
      "Missing Supabase admin environment variables. Add SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY server-side."
    );
  }

  if (!status.usable) {
    throw new Error(
      `${status.reason} Add a real Supabase service_role JWT or sb_secret_ key server-side. Do not use NEXT_PUBLIC_SUPABASE_ANON_KEY here.`
    );
  }

  return createClient(supabaseUrl, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
