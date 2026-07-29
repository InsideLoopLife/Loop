import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { claimPersonInvite } from "./actions";

export default async function AcceptInvitePage({ searchParams }: { searchParams?: Promise<{ token?: string; invite?: string }> }) {
  const params = searchParams ? await searchParams : {};
  const token = params.token || "";
  const inviteId = params.invite || "";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const next = inviteId ? `/accept-invite?invite=${encodeURIComponent(inviteId)}` : `/accept-invite?token=${encodeURIComponent(token)}`;

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <section className="w-full max-w-lg rounded-[2rem] border border-slate-200 bg-white p-8 shadow-sm">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-orange-500">Loop household invite</p>
        <h1 className="mt-2 text-3xl font-black text-slate-950">Claim your profile</h1>
        <p className="mt-2 text-sm font-bold text-slate-600">This links your login to an existing household person profile. Your password and MFA remain yours and are never visible to the household owner.</p>
        {!token && !inviteId ? <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">Invite token missing. Ask for a fresh invite.</div> : null}
        {(token || inviteId) && !user ? (
          <div className="mt-6 space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">
            <p>Sign in or create your account first, then return to this invite link to claim the profile.</p>
            <Link href={`/login?next=${encodeURIComponent(next)}`} className="inline-flex rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white">Sign in / create account</Link>
          </div>
        ) : null}
        {(token || inviteId) && user ? (
          <form action={claimPersonInvite} className="mt-6">
            <input type="hidden" name="token" value={token} />
            <input type="hidden" name="invite_id" value={inviteId} />
            <button className="w-full rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white">Link this profile to {user.email}</button>
          </form>
        ) : null}
        <Link href="/dashboard" className="mt-4 block text-center text-sm font-bold text-slate-500">Back to app</Link>
      </section>
    </main>
  );
}
