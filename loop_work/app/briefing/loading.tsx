import { Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/server";

// A deliberately cheap, standalone loading screen for /briefing — this is
// NOT the sitewide InstantBootSnapshot system (which shows a cached
// snapshot of the page from a previous visit while the real one streams
// in). That's the wrong fit here: a chat conversation is live and
// personal, so showing stale numbers under the same "Welcome back" framing
// as the real page is actively misleading, not reassuring. This only does
// one cheap query (first name) rather than the full financial briefing
// computation, so it renders almost instantly.
async function getFirstName() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return "there";
    const { data: profile } = await supabase.from("app_user_profiles").select("display_name,full_name").eq("user_id", user.id).maybeSingle();
    const name = String(profile?.display_name || profile?.full_name || user.email?.split("@")[0] || "there").trim().split(/\s+/)[0];
    return name;
  } catch {
    return "there";
  }
}

export default async function BriefingLoading() {
  const firstName = await getFirstName();

  return (
    <main className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <span className="relative grid h-16 w-16 place-items-center rounded-3xl bg-indigo-50 text-indigo-600">
          <Sparkles className="h-7 w-7 animate-pulse" />
          <span className="absolute inset-0 animate-ping rounded-3xl bg-indigo-200/60 [animation-duration:2s]" />
        </span>
        <p className="text-xl font-black text-slate-950">Hey 👋 {firstName}, we&apos;re grabbing your briefing.</p>
        <p className="text-sm font-semibold text-slate-500">Pulling together your accounts, pensions, and investments — just a moment.</p>
      </div>
    </main>
  );
}