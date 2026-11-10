import crypto from "crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, hasSupabaseAdminKey } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// Older uploads were saved as inline data URLs when Storage wasn't ready, so
// the image travelled inside every page that showed it (16 copies on
// Spending). This moves the signed-in person's own images into Storage.
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const writeClient = hasSupabaseAdminKey() ? createAdminClient() : supabase;

  const { data: profile } = await supabase.from("app_user_profiles").select("avatar_url").eq("user_id", user.id).maybeSingle();
  const { data: people } = await writeClient
    .from("people")
    .select("id, avatar_url")
    .or(`linked_user_id.eq.${user.id},user_id.eq.${user.id}`)
    .like("avatar_url", "data:%");

  const moved = new Map<string, string>();
  async function toStorage(dataUrl: string) {
    if (moved.has(dataUrl)) return moved.get(dataUrl)!;
    const match = dataUrl.match(/^data:(image\/[a-z+.-]+);base64,(.+)$/i);
    if (!match) return null;
    const type = match[1].toLowerCase();
    const bytes = Buffer.from(match[2], "base64");
    const path = `${user!.id}/${crypto.randomUUID()}.${type.split("/")[1].replace("jpeg", "jpg").replace("+xml", "")}`;
    const { error } = await supabase.storage.from("user-avatars").upload(path, bytes, { cacheControl: "31536000", upsert: false, contentType: type });
    if (error) throw new Error(error.message);
    const url = supabase.storage.from("user-avatars").getPublicUrl(path).data.publicUrl;
    moved.set(dataUrl, url);
    return url;
  }

  try {
    let count = 0;
    if (profile?.avatar_url?.startsWith("data:")) {
      const url = await toStorage(profile.avatar_url);
      if (url) { await supabase.from("app_user_profiles").update({ avatar_url: url }).eq("user_id", user.id); count += 1; }
    }
    for (const person of people ?? []) {
      const url = await toStorage(person.avatar_url as string);
      if (url) { await writeClient.from("people").update({ avatar_url: url }).eq("id", person.id); count += 1; }
    }
    return NextResponse.json({ ok: true, moved: count });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not move image" }, { status: 400 });
  }
}
