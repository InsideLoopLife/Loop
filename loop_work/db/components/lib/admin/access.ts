import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type AdminAccess = {
  isAdmin: boolean;
  reason: string;
  user: { id: string; email?: string | null };
};

function creatorEmails() {
  return String(process.env.APP_CREATOR_EMAILS || "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export async function getAdminAccess(): Promise<AdminAccess> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const email = String(user.email || "").toLowerCase();
  if (creatorEmails().includes(email)) {
    return { isAdmin: true, reason: "APP_CREATOR_EMAILS", user };
  }

  try {
    const { data } = await supabase
      .from("app_admin_users")
      .select("id, role, status")
      .or(`user_id.eq.${user.id},email.eq.${email}`)
      .eq("status", "active")
      .maybeSingle();

    if (data) return { isAdmin: true, reason: "app_admin_users", user };
  } catch {
    // The V22 migration may not be installed yet. Fall through to no access.
  }

  return { isAdmin: false, reason: "not_configured", user };
}

export async function requireAdminAccess() {
  const access = await getAdminAccess();
  if (!access.isAdmin) redirect("/dashboard");
  return access;
}

export function createBestAdminClient() {
  try {
    return createAdminClient();
  } catch {
    return null;
  }
}
