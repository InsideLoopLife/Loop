import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { GuidedSetup } from "@/components/onboarding/GuidedSetup";
import { skipOnboarding } from "./actions";

export const metadata = { title: "Set up LOOP" };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ again?: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
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
  const { data: self } = await supabase
    .from("people")
    .select("id")
    .eq("relationship", "self")
    .or(`linked_user_id.eq.${user.id},user_id.eq.${user.id}`)
    .limit(1)
    .maybeSingle();

  const [{ data: payRows }, { data: billRows }] = await Promise.all([
    self?.id
      ? supabase.from("pay_events").select("id").eq("person_id", self.id).or(`effective_until.is.null,effective_until.gte.${today}`).limit(1)
      : Promise.resolve({ data: [] as any[] }),
    supabase.from("planned_items").select("label").eq("user_id", user.id).limit(500),
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
        }}
      />

      <p className="mt-4 text-center text-xs font-semibold text-slate-400">
        Prefer the full checklist? <Link href="/onboarding/checklist" className="underline hover:text-slate-700">Open it here</Link>
      </p>
    </main>
  );
}
