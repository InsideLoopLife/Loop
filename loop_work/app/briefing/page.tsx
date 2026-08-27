import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { buildFinancialBriefing } from "@/lib/briefing/build-financial-briefing";
import { getActiveHouseholdContext, visibleDataOrFilter } from "@/lib/auth/household-context";
import { featureEnabled, getEffectiveEntitlements } from "@/lib/tiers/entitlements";
import { ChatBriefingShell } from "@/components/briefing/ChatBriefingShell";

export default async function BriefingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const entitlements = await getEffectiveEntitlements(user.id);
  if (!featureEnabled(entitlements, "ai_financial_briefing")) redirect("/dashboard");

  const context = await getActiveHouseholdContext(supabase, user);
  const briefing = await buildFinancialBriefing(supabase, user, visibleDataOrFilter(context));

  return (
    <main className="mx-auto w-full max-w-[1500px] px-4 pb-16 pt-7">
      <ChatBriefingShell initial={briefing} />
    </main>
  );
}
