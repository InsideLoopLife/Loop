import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, hasSupabaseAdminKey } from "@/lib/supabase/admin";

export type AdminAccess = {
  isAdmin: boolean;
  reason: string;
  user: { id: string; email?: string | null };
  allowedEmails: string[];
};

export const DEFAULT_ADMIN_EMAIL = "dan@insideloop.life";

function splitEmails(value: string) {
  return value
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export function allowedAdminEmails() {
  // Keep the admin surface closed by default. APP_ADMIN_EMAILS / LOOP_ADMIN_EMAILS can override later,
  // but if neither is set, only dan@insideloop.life can pass the first gate.
  const configured = [
    ...splitEmails(process.env.APP_ADMIN_EMAILS || ""),
    ...splitEmails(process.env.LOOP_ADMIN_EMAILS || ""),
  ];
  return Array.from(new Set(configured.length ? configured : [DEFAULT_ADMIN_EMAIL]));
}

export function isAllowedAdminEmail(email?: string | null) {
  const normalised = String(email || "").trim().toLowerCase();
  return Boolean(normalised && allowedAdminEmails().includes(normalised));
}

export async function getAdminAccess(): Promise<AdminAccess> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent("/admin")}`);

  const email = String(user.email || "").toLowerCase();
  const allowedEmails = allowedAdminEmails();

  // Hard allow-list first: DB roles cannot widen admin access beyond the declared email list.
  if (!allowedEmails.includes(email)) {
    return { isAdmin: false, reason: "email_not_allowlisted", user, allowedEmails };
  }

  // If the admin table/migration is unavailable, still allow the single configured owner email.
  // This avoids locking the creator out before the migration is run, while still keeping the email allow-list tight.
  try {
    const { data } = await supabase
      .from("app_admin_users")
      .select("id, role, status")
      .or(`user_id.eq.${user.id},email.eq.${email}`)
      .eq("status", "active")
      .maybeSingle();

    if (data) return { isAdmin: true, reason: `app_admin_users:${data.role || "admin"}`, user, allowedEmails };
  } catch {
    // The admin migration may not be installed yet. Fall through to allow-list mode.
  }

  return { isAdmin: true, reason: "email_allow_list", user, allowedEmails };
}

export async function requireAdminAccess() {
  const access = await getAdminAccess();
  if (!access.isAdmin) redirect("/dashboard");
  return access;
}

export function createBestAdminClient() {
  if (!hasSupabaseAdminKey()) return null;
  try {
    return createAdminClient();
  } catch {
    return null;
  }
}
