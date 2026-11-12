import { getVerifiedUser } from "@/lib/supabase/verified-user";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { GuidedSetup } from "@/components/onboarding/GuidedSetup";
import { skipOnboarding } from "./actions";

export const metadata = { title: "Set up LOOP" };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ again?: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await getVerifiedUser(supabase);
  if (!user) redirect("/login");

  const { again } = await searchParams;
  const { data: profile } = await supabase
    .from("app_user_profiles")
    .select("display_name, full_name, onboarding_completed_at, onboarding_skipped_at")
    .eq("user_id", user.id)
    .maybeSingle();

  // Finished or skipped users go straight in, unless they chose to run setup again.
  if (!again && (profile?.onboarding_completed_at || profile?.onboarding_skipped_at)) redirect("/dashboard");

  const today = new Date().toISOString().slice(0, 10);
  // Your own card: the one linked to your login (a partner may have made it).
  const { data: self } = await supabase
    .from("people")
    .select("id")
    .or(`linked_user_id.eq.${user.id},and(user_id.eq.${user.id},relationship.eq.self)`)
    .order("relationship", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Joined someone else's household? Then setup skips the household and home
  // steps and just asks for your own money.
  const { data: membership } = await supabase
    .from("app_household_members")
    .select("household_id, permission_tier, role, app_households(name, owner_user_id)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  const joinedHousehold: any = membership && (membership as any).app_households?.owner_user_id && (membership as any).app_households.owner_user_id !== user.id ? membership : null;
  let joining: { householdName: string; people: string[]; sharedBills: string[] } | null = null;
  if (joinedHousehold) {
    const [{ data: people }, { data: shared }] = await Promise.all([
      supabase.from("people").select("name, linked_user_id").eq("household_id", joinedHousehold.household_id).is("active_until", null),
      supabase.from("planned_items").select("label").eq("household_id", joinedHousehold.household_id).eq("direction", "outgoing").limit(500),
    ]);
    joining = {
      householdName: joinedHousehold.app_households?.name || "your household",
      people: ((people || []) as any[]).filter((p) => p.linked_user_id !== user.id).map((p) => String(p.name)),
      sharedBills: ((shared || []) as any[]).map((row) => String(row.label || "")),
    };
  }

  const [{ data: payRows }, { data: billRows }, { data: homeRows }] = await Promise.all([
    self?.id
      ? supabase.from("pay_events").select("id").eq("person_id", self.id).or(`effective_until.is.null,effective_until.gte.${today}`).limit(1)
      : Promise.resolve({ data: [] as any[] }),
    supabase.from("planned_items").select("label").eq("user_id", user.id).limit(500),
    supabase.from("homes").select("id").eq("user_id", user.id).eq("ownership_status", "current_home").limit(1),
  ]);

  const name = String(profile?.display_name || profile?.full_name || user.user_metadata?.full_name || user.user_metadata?.name || "").split(" ")[0];

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-white px-4 py-8 md:py-14">
      <div className="mx-auto mb-8 flex max-w-xl items-center justify-between">
        <span className="text-lg font-black tracking-tight text-slate-950">LOOP</span>
        <form action={skipOnboarding}>
          <button className="text-sm font-black text-slate-500 hover:text-slate-950">Skip for now</button>
        </form>
      </div>

      <GuidedSetup
        defaults={{
          name,
          hasSelfPay: Boolean(payRows?.length),
          existingBills: (billRows || []).map((row: any) => String(row.label || "")),
          hasHome: Boolean(homeRows?.length) || Boolean(joining),
          joining,
        }}
      />

      <p className="mt-4 text-center text-xs font-semibold text-slate-400">
        Prefer the full checklist? <Link href="/onboarding/checklist" className="underline hover:text-slate-700">Open it here</Link>
      </p>
    </main>
  );
}
