import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldAlert, UsersRound } from "lucide-react";
import { SectionCard } from "@/components/SectionCard";
import { createClient } from "@/lib/supabase/server";
import { createBestAdminClient, getAdminAccess } from "@/lib/admin/access";
import { backfillUserFoundation } from "../live-actions";
import { AdminTabs } from "@/components/admin/AdminTabs";

type UserRow = {
  user_id: string;
  email: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
  admin_role: string | null;
  admin_status: string | null;
  profile_status: string | null;
  household_count: number | null;
  display_name?: string | null;
  payment_tier?: string | null;
  payment_tier_status?: string | null;
  market_data_tier?: string | null;
  market_data_realtime_enabled?: boolean | null;
  in_app_enabled?: boolean | null;
  wealth_digest_enabled?: boolean | null;
  lifestyle_digest_enabled?: boolean | null;
  profile_updated_at?: string | null;
};

function fmtDate(value?: string | null) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return "—";
  }
}

function Pill({ children, tone = "slate" }: { children: React.ReactNode; tone?: "slate" | "green" | "amber" | "red" | "blue" }) {
  const cls = {
    slate: "bg-slate-100 text-slate-700",
    green: "bg-emerald-100 text-emerald-800",
    amber: "bg-amber-100 text-amber-900",
    red: "bg-rose-100 text-rose-800",
    blue: "bg-sky-100 text-sky-800",
  }[tone];
  return <span className={`rounded-full px-3 py-1 text-xs font-black ${cls}`}>{children}</span>;
}

export default async function AdminUsersPage() {
  const access = await getAdminAccess();
  if (!access.user) redirect(`/login?next=${encodeURIComponent("/admin/users")}`);

  if (!access.isAdmin) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-10 md:px-6">
        <section className="rounded-[2rem] border border-red-100 bg-red-50 p-8">
          <div className="flex items-start gap-4">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-red-600 text-white"><ShieldAlert className="h-6 w-6" /></span>
            <div>
              <h1 className="text-2xl font-black text-red-950">Admin access is not enabled</h1>
              <p className="mt-2 text-sm font-bold text-red-700">You are signed in as {access.user.email || "unknown email"}.</p>
            </div>
          </div>
        </section>
      </main>
    );
  }

  const supabase = createBestAdminClient() || await createClient();
  const { data, error } = await supabase.rpc("loop_admin_users_list", { p_limit: 250 });
  const users = (data || []) as UserRow[];
  const missingProfiles = users.filter((user) => user.profile_status !== "profile linked").length;

  return (
    <main className="mx-auto w-[95vw] max-w-none space-y-8 px-4 py-8 md:px-6">
      <section className="relative overflow-hidden rounded-[2.5rem] bg-slate-950 p-7 text-white shadow-[0_30px_120px_-70px_rgba(15,23,42,.9)]">
        <div className="relative flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-wide text-white/80">
              <UsersRound className="h-4 w-4" /> Admin users
            </div>
            <h1 className="text-4xl font-black tracking-tight md:text-5xl">Users and permissions</h1>
            <p className="mt-3 max-w-4xl text-sm font-medium leading-6 text-white/72">Reads Supabase Auth users and joins app profiles, admin roles, household membership and notification preferences.</p>
          </div>
          <Link href="/admin" className="rounded-full bg-white px-5 py-3 text-sm font-black text-slate-950">Back to admin</Link>
        </div>
      </section>

      <AdminTabs />

      {error ? (
        <section className="rounded-[2rem] border border-rose-200 bg-rose-50 p-5 text-sm font-bold text-rose-900">
          {error.message}
        </section>
      ) : null}

      {missingProfiles ? (
        <section className="rounded-[2rem] border border-amber-200 bg-amber-50 p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-black text-amber-950">{missingProfiles} user(s) are missing app profiles</h2>
              <p className="mt-1 text-sm font-bold text-amber-900">This explains why older admin cards showed zero profiles even though Auth users exist.</p>
            </div>
            <form action={backfillUserFoundation}>
              <button className="rounded-full bg-slate-950 px-5 py-3 text-sm font-black text-white">Backfill profiles/preferences</button>
            </form>
          </div>
        </section>
      ) : null}

      <SectionCard title="All users" description="Auth users are shown first. Profile, household and notification status are attached where they exist.">
        <div className="overflow-hidden rounded-3xl border border-slate-200">
          <div className="grid grid-cols-[1.5fr_.9fr_.9fr_.9fr_.9fr_.9fr] bg-slate-50 px-4 py-3 text-xs font-black uppercase tracking-wide text-slate-400">
            <span>User</span><span>Admin</span><span>Profile</span><span>Tier</span><span>Notifications</span><span>Updated</span>
          </div>
          {users.map((user) => (
            <article key={user.user_id} className="grid grid-cols-[1.5fr_.9fr_.9fr_.9fr_.9fr_.9fr] items-center gap-3 border-t border-slate-100 px-4 py-3 text-sm">
              <div>
                <p className="font-black text-slate-950">{user.display_name || user.email || user.user_id}</p>
                <p className="text-xs font-bold text-slate-500">{user.email}</p>
              </div>
              <div>{user.admin_role ? <Pill tone="green">{user.admin_role}</Pill> : <Pill>user</Pill>}</div>
              <div className="flex flex-wrap gap-2"><Pill tone={user.profile_status === "profile linked" ? "green" : "amber"}>{user.profile_status || "unknown"}</Pill>{user.household_count ? <Pill tone="blue">{user.household_count} household</Pill> : null}</div>
              <div className="flex flex-wrap gap-2"><Pill>{user.payment_tier || "free"}</Pill>{user.market_data_realtime_enabled ? <Pill tone="green">realtime</Pill> : null}</div>
              <div className="flex flex-wrap gap-2">{user.in_app_enabled ? <Pill tone="green">in-app</Pill> : <Pill tone="amber">no in-app</Pill>}{user.wealth_digest_enabled ? <Pill tone="blue">wealth</Pill> : null}{user.lifestyle_digest_enabled ? <Pill tone="blue">life</Pill> : null}</div>
              <p className="text-xs font-bold text-slate-500">{fmtDate(user.profile_updated_at || user.created_at)}</p>
            </article>
          ))}
        </div>
      </SectionCard>
    </main>
  );
}
