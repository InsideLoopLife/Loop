import crypto from "crypto";
import { createAdminClient, hasSupabaseAdminKey } from "@/lib/supabase/admin";

export const ACCESS_COOKIE_NAME = "loop_beta_access";
export const ACCESS_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * Number(process.env.LOOP_BETA_COOKIE_DAYS || 30);

export type BetaCodeValidationResult = {
  ok: boolean;
  source: "database" | "env_hash" | "env_plain" | "dev" | "none" | "error";
  reason: string;
  codeId?: string;
  label?: string | null;
};

export function accessGateRequired() {
  return (
    process.env.LOOP_BETA_GATE_ENABLED === "true" ||
    process.env.LOOP_ACCESS_REQUIRED === "true" ||
    Boolean(
      process.env.LOOP_ACCESS_CODE ||
      process.env.LOOP_ACCESS_CODE_HASH ||
      process.env.LOOP_ACCESS_COOKIE_VALUE ||
      process.env.LOOP_BETA_CODE_PEPPER ||
      process.env.LOOP_BETA_COOKIE_SECRET,
    )
  );
}

export function normaliseAccessCode(code: string) {
  return String(code || "").trim().replace(/[\s\-]+/g, "").toUpperCase();
}

export function betaCodePepper() {
  return process.env.LOOP_BETA_CODE_PEPPER || process.env.LOOP_ACCESS_CODE_SALT || process.env.LOOP_ACCESS_COOKIE_SECRET || "loop-dev-pepper";
}

export function hashAccessCode(code: string) {
  return crypto.createHmac("sha256", betaCodePepper()).update(normaliseAccessCode(code)).digest("hex");
}

export function hashLegacyAccessCode(code: string) {
  return crypto.createHash("sha256").update(`${normaliseAccessCode(code)}:${process.env.LOOP_ACCESS_CODE_SALT || "loop"}`).digest("hex");
}

export function timingSafeEqualText(a: string, b: string) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

export function accessCookieValue() {
  const secret = process.env.LOOP_BETA_COOKIE_SECRET || process.env.LOOP_ACCESS_COOKIE_VALUE || process.env.LOOP_ACCESS_CODE_HASH || "loop-dev-access";
  return crypto.createHmac("sha256", secret).update("insideloop-private-beta:v1").digest("hex");
}

export function generateBetaCode() {
  const left = crypto.randomBytes(3).toString("hex").toUpperCase();
  const mid = crypto.randomBytes(2).toString("hex").toUpperCase();
  const right = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `LOOP-${left}-${mid}-${right}`;
}

export function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ACCESS_COOKIE_MAX_AGE_SECONDS,
  };
}

function validateAgainstEnvironment(code: string): BetaCodeValidationResult {
  const normalised = normaliseAccessCode(code);
  const expectedHash = process.env.LOOP_ACCESS_CODE_HASH;
  if (expectedHash) {
    const modern = hashAccessCode(normalised);
    const legacy = hashLegacyAccessCode(normalised);
    if (timingSafeEqualText(modern, expectedHash) || timingSafeEqualText(legacy, expectedHash)) {
      return { ok: true, source: "env_hash", reason: "Matched LOOP_ACCESS_CODE_HASH." };
    }
  }

  const direct = process.env.LOOP_ACCESS_CODE;
  if (direct && timingSafeEqualText(normalised, normaliseAccessCode(direct))) {
    return { ok: true, source: "env_plain", reason: "Matched LOOP_ACCESS_CODE." };
  }

  if (process.env.NODE_ENV !== "production" && normalised === "LOOP") {
    return { ok: true, source: "dev", reason: "Local development fallback code." };
  }

  return { ok: false, source: "none", reason: "No matching environment access code." };
}

async function validateAgainstDatabase(code: string): Promise<BetaCodeValidationResult> {
  if (!hasSupabaseAdminKey() || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return { ok: false, source: "none", reason: "Supabase admin key not configured for database beta codes." };
  }

  const codeHash = hashAccessCode(code);
  const nowIso = new Date().toISOString();
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("private_beta_codes")
      .select("id,label,code_hash,max_uses,used_count,expires_at,disabled_at")
      .eq("code_hash", codeHash)
      .maybeSingle();

    if (error) return { ok: false, source: "error", reason: error.message };
    if (!data) return { ok: false, source: "database", reason: "No database code matched." };
    if (data.disabled_at) return { ok: false, source: "database", reason: "Code is disabled.", codeId: data.id, label: data.label };
    if (data.expires_at && data.expires_at < nowIso) return { ok: false, source: "database", reason: "Code has expired.", codeId: data.id, label: data.label };
    if (Number(data.max_uses || 0) > 0 && Number(data.used_count || 0) >= Number(data.max_uses || 0)) {
      return { ok: false, source: "database", reason: "Code usage limit reached.", codeId: data.id, label: data.label };
    }

    await supabase
      .from("private_beta_codes")
      .update({ used_count: Number(data.used_count || 0) + 1, last_used_at: nowIso, updated_at: nowIso })
      .eq("id", data.id);

    return { ok: true, source: "database", reason: "Matched private_beta_codes.", codeId: data.id, label: data.label };
  } catch (error: any) {
    return { ok: false, source: "error", reason: error?.message || "Database beta code validation failed." };
  }
}

export async function validateAccessCode(code: string): Promise<BetaCodeValidationResult> {
  if (!normaliseAccessCode(code)) return { ok: false, source: "none", reason: "No code supplied." };

  const databaseResult = await validateAgainstDatabase(code);
  if (databaseResult.ok) return databaseResult;

  const envResult = validateAgainstEnvironment(code);
  if (envResult.ok) return envResult;

  return databaseResult.source === "error" ? databaseResult : envResult;
}

export function isValidAccessCode(code: string) {
  return validateAgainstEnvironment(code).ok;
}

export async function recordBetaRedemption(input: {
  codeId?: string;
  userId?: string | null;
  email?: string | null;
  source: string;
  host?: string | null;
  userAgent?: string | null;
}) {
  if (!hasSupabaseAdminKey() || !process.env.NEXT_PUBLIC_SUPABASE_URL) return;
  try {
    const supabase = createAdminClient();
    await supabase.from("private_beta_redemptions").insert({
      beta_code_id: input.codeId || null,
      user_id: input.userId || null,
      email: input.email ? input.email.toLowerCase() : null,
      redemption_source: input.source,
      host: input.host || null,
      user_agent: input.userAgent ? input.userAgent.slice(0, 500) : null,
    });
  } catch {
    // Beta gate must not fail because audit logging is unavailable.
  }
}

export async function markUserBetaApproved(input: { userId: string; email?: string | null; source?: string; codeId?: string | null }) {
  if (!hasSupabaseAdminKey() || !process.env.NEXT_PUBLIC_SUPABASE_URL) return;
  try {
    const supabase = createAdminClient();
    await supabase.from("private_beta_user_access").upsert({
      user_id: input.userId,
      email: input.email ? input.email.toLowerCase() : null,
      beta_code_id: input.codeId || null,
      approved_source: input.source || "beta_cookie",
      approved_at: new Date().toISOString(),
      revoked_at: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
  } catch {
    // Do not block auth callback if this optional table/migration is unavailable.
  }
}
