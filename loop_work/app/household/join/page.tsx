import { getVerifiedUser } from "@/lib/supabase/verified-user";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import { SectionCard } from "@/components/SectionCard";
import { SubmitButton } from "@/components/SubmitButton";
import { createClient } from "@/lib/supabase/server";
import { acceptHouseholdJoinInvite } from "./actions";

type Preview = {
  invite_id?: string;
  household_name?: string | null;
  invited_email?: string | null;
  role?: string | null;
  permission_tier?: string | null;
  status?: string | null;
  expires_at?: string | null;
};


async function lookupInvite(supabase: Awaited<ReturnType<typeof createClient>>, token?: string, inviteId?: string) {
  if (!token && !inviteId) return null;
  const { data, error } = await supabase.rpc("app_household_invite_preview", { p_token: token || null, p_invite_id: inviteId || null });
  if (error) return null;
  return (Array.isArray(data) ? data[0] : data) as Preview | null;
}

export default async function JoinHouseholdPage({ searchParams }: { searchParams?: Promise<{ token?: string; invite?: string }> }) {
  const params = searchParams ? await searchParams : {};
  const token = String(params.token || "").trim();
  const inviteId = String(params.invite || "").trim();
  if (!token && !inviteId) redirect("/account?tab=sharing");

  const supabase = await createClient();
  const {
    data: { user },
  } = await getVerifiedUser(supabase);

  const nextPath = inviteId ? `/household/join?invite=${encodeURIComponent(inviteId)}` : `/household/join?token=${encodeURIComponent(token)}`;
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);

  const preview = await lookupInvite(supabase, token, inviteId);

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        <section className="rounded-[2rem] bg-slate-950 p-7 text-white shadow-[0_30px_120px_-70px_rgba(15,23,42,.9)]">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-white/50">Household invite</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight">Join {preview?.household_name || "this household"}</h1>
          <p className="mt-2 text-sm font-medium text-white/70">
            Your bills, pay and accounts stay yours. Choose how much the household can see before you join – you can change it any time.
          </p>
        </section>

        {!preview ? (
          <SectionCard title="Invite not found" description="The invite may have expired or already been used.">
            <Link href="/household" className="text-sm font-black text-orange-600">Go to Household</Link>
          </SectionCard>
        ) : (
          <SectionCard title="How do you want to share your money?" description={`You're joining as ${({ admin: "a Partner", parent: "a Parent", member: "a Family member", viewer: "View only" } as Record<string, string>)[String(preview.permission_tier || "member")] || "a Family member"}.`}>
            <form action={acceptHouseholdJoinInvite} className="space-y-5">
              <input type="hidden" name="token" value={token} />
              <input type="hidden" name="invite_id" value={inviteId} />
              <fieldset className="grid gap-2">
                <legend className="sr-only">How you share your money</legend>
                {[
                  ["view", "Shared, view only", "Your bills and pay count in the household figures. Only you can change them."],
                  ["edit", "Shared, others can edit", "Partners can also update or remove your bills and pay."],
                  ["private", "Private for now", "Nobody else sees your money. You can share later in Account → Household."],
                ].map(([value, label, help]) => (
                  <label key={value} className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4 has-[:checked]:border-slate-950 has-[:checked]:bg-slate-50">
                    <input type="radio" name="share_level" value={value} defaultChecked={value === "view"} className="mt-1" />
                    <span><span className="block font-black text-slate-950">{label}</span><span className="block text-sm font-semibold text-slate-500">{help}</span></span>
                  </label>
                ))}
              </fieldset>
              <p className="text-xs font-semibold text-slate-500">Anything already in your LOOP comes with you and stays yours. If you leave the household, it leaves with you.</p>
              <SubmitButton>Join household</SubmitButton>
            </form>
          </SectionCard>
        )}
      </main>
    </>
  );
}
