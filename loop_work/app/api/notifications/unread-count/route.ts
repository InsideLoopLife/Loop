import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ count: 0 });

  const { count, error } = await supabase
    .from("app_notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("status", "unread");

  if (error) return NextResponse.json({ count: 0 });
  return NextResponse.json({ count: count ?? 0 });
}
