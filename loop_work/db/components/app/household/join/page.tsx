import { redirect } from "next/navigation";
import Link from "next/link";
import { Nav } from "@/components/Nav";
import { SectionCard } from "@/components/SectionCard";
import { SubmitButton } from "@/components/SubmitButton";
import { createClient } from "@/lib/supabase/server";
import { acceptHouseholdJoinInvite } from "./actions";

type Preview = {
  invite_id: string;
  household_name: string | null;
  invited_email: string | null;
  role: string | null;
  permission_tier: string | null;
  status: string | null;
  expires_at: string | null;
};

const shareCategories = [
  ["people", "People & children"],
  ["income", "Income and pay history"],
  ["spending", "Spending, bills and budgets"],
  ["accounts", "Accounts and balances"],
  ["property", "Homes, mortgages and valuations"],
  ["net_worth", "Assets, liabilities, pensions and investments"],
  ["lifestyle", "Lifestyle bills, meals and groceries"],
];

export default async function JoinHouseholdPage({ searchParams }: { searchParams?: Promise<{ token?: string }> }) {
  const params = searchParams ? await searchParams : {};
  const token = String(params.token || "").trim();
  if (!token) redirect("/account?tab=sharing");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect(`/login?next=${encodeURIComponent(`/household/join?token=${token}`)}`);

  const { data: previewData, error } = await supabase.rpc("app_household_invite_preview", {
    p_token: token,
    p_invite_id: null,
  });
  const preview = (Array.isArray(previewData) ? previewData[0] : previewData) as Preview | null;

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        <section className="rounded-[2rem] bg-slate-950 p-7 text-white shadow-[0_30px_120px_-70px_rgba(15,23,42,.9)]">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-white/50">Household invite</p>
          <h1 className="mt-3 text-4xl font-black tracking-tight">Join {preview?.household_name || "this household"}</h1>
          <p className="mt-2 text-sm font-medium text-white/70">
            Accept the invite, then choose what existing history becomes visible to the household. Anything you do not select stays private.
          </p>
        </section>

        {error || !preview ? (
          <SectionCard title="Invite not found" description="The invite may have expired or already been used.">
            <Link href="/account?tab=sharing" className="text-sm font-black text-orange-600">Back to account sharing</Link>
          </SectionCard>
        ) : (
          <SectionCard title="Sharing choice" description={`Role: ${preview.role || "member"}. Permission: ${preview.permission_tier || "member"}.`}>
            <form action={acceptHouseholdJoinInvite} className="space-y-5">
              <input type="hidden" name="token" value={token} />

              <div className="grid gap-3 rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-700">
                <label className="flex items-center gap-3"><input type="radio" name="share_mode" value="none" defaultChecked /> Join but share nothing yet</label>
                <label className="flex items-center gap-3"><input type="radio" name="share_mode" value="today" /> Share selected categories from today</label>
                <label className="flex items-center gap-3"><input type="radio" name="share_mode" value="all" /> Share all selected category history</label>
                <label className="grid gap-1 sm:grid-cols-[auto_1fr] sm:items-center">
                  <span className="flex items-center gap-3"><input type="radio" name="share_mode" value="from_date" /> Share selected categories from</span>
                  <input name="from_date" type="date" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-orange-500 focus:ring-2" />
                </label>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {shareCategories.map(([value, label]) => (
                  <label key={value} className="flex items-center gap-3 rounded-2xl border border-slate-200 p-3 text-sm font-bold text-slate-700">
                    <input type="checkbox" name="share_categories" value={value} className="h-4 w-4" />
                    {label}
                  </label>
                ))}
              </div>

              <SubmitButton>Accept household invite</SubmitButton>
            </form>
          </SectionCard>
        )}
      </main>
    </>
  );
}
