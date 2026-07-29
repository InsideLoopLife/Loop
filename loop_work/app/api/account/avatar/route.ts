import crypto from "crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, hasSupabaseAdminKey } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const MAX_BYTES = 5_000_000;

async function imageUrlFromFile(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, file: File) {
  if (!file.type.startsWith("image/")) throw new Error("Profile image must be an image file.");
  if (file.size > MAX_BYTES) throw new Error("Profile image must be under 5MB.");
  const extension = file.type.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
  const path = `${userId}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await supabase.storage
    .from("user-avatars")
    .upload(path, file, { cacheControl: "31536000", upsert: false, contentType: file.type });
  if (!uploadError) {
    const { data } = supabase.storage.from("user-avatars").getPublicUrl(path);
    return data.publicUrl;
  }

  // Local/dev safety net: if the bucket or RLS is not ready yet, still let the UI work.
  // Keep this limited so the database does not become an accidental image store.
  if (file.size > 1_500_000) {
    throw new Error("Avatar storage is not accepting uploads yet. Create/allow the user-avatars bucket or use an image under 1.5MB for local fallback.");
  }
  const buffer = Buffer.from(await file.arrayBuffer());
  return `data:${file.type};base64,${buffer.toString("base64")}`;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const formData = await request.formData();
  const file = formData.get("profile_image");
  if (!(file instanceof File) || file.size <= 0) return NextResponse.json({ error: "No image supplied" }, { status: 400 });

  try {
    const avatarUrl = await imageUrlFromFile(supabase, user.id, file);
    const { data: existingProfile } = await supabase
      .from("app_user_profiles")
      .select("full_name, display_name, household_id, timezone, currency")
      .eq("user_id", user.id)
      .maybeSingle();

    const displayName = existingProfile?.display_name || existingProfile?.full_name || (user.email ? user.email.split("@")[0] : "Me");
    const { error: profileError } = await supabase.from("app_user_profiles").upsert({
      user_id: user.id,
      email: user.email || null,
      full_name: existingProfile?.full_name || null,
      display_name: existingProfile?.display_name || displayName,
      household_id: existingProfile?.household_id || null,
      timezone: existingProfile?.timezone || "Europe/London",
      currency: existingProfile?.currency || "GBP",
      avatar_url: avatarUrl,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (profileError) throw new Error(profileError.message);

    const writeClient = hasSupabaseAdminKey() ? createAdminClient() : supabase;
    await writeClient
      .from("people")
      .update({
        avatar_url: avatarUrl,
        name: displayName,
        email: user.email || null,
        invite_email: user.email || null,
        account_status: "linked",
        updated_at: new Date().toISOString(),
      })
      .eq("linked_user_id", user.id);

    await supabase.from("app_security_events").insert({
      user_id: user.id,
      household_id: existingProfile?.household_id || null,
      event_type: "profile_avatar_updated",
      status: "success",
      metadata: { source: "ajax_upload" },
    }).then(() => null, () => null);

    return NextResponse.json({ avatar_url: avatarUrl });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save image" }, { status: 400 });
  }
}
