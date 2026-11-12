import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Opening a notification's link marks it read, then goes where it points.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));
  const { data } = await supabase.from("app_notifications").select("id, status, cta_href").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (data?.status === "unread") {
    await supabase.from("app_notifications").update({ status: "read", read_at: new Date().toISOString() }).eq("id", id).eq("user_id", user.id);
  }
  const href = typeof data?.cta_href === "string" && data.cta_href.startsWith("/") && !data.cta_href.startsWith("//") ? data.cta_href : "/notifications";
  return NextResponse.redirect(new URL(href, request.url));
}
