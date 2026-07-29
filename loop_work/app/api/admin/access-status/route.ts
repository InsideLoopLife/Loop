import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { allowedAdminEmails } from "@/lib/admin/access";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ isAdmin: false });

  const email = String(user.email).toLowerCase();
  const allowed = allowedAdminEmails();
  if (!allowed.includes(email)) return NextResponse.json({ isAdmin: false, reason: "email_not_allowlisted" });

  try {
    const { data } = await supabase
      .from("app_admin_users")
      .select("id, role, status")
      .or(`user_id.eq.${user.id},email.eq.${email}`)
      .eq("status", "active")
      .maybeSingle();
    if (data) return NextResponse.json({ isAdmin: true, reason: `app_admin_users:${data.role || "admin"}` });
  } catch {
    // Admin table may not exist yet; allow-list is still intentionally narrow.
  }

  return NextResponse.json({ isAdmin: true, reason: "email_allow_list" });
}
