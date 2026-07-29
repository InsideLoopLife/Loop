import Link from "next/link";
import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { SectionCard } from "@/components/SectionCard";
import { StatCard } from "@/components/StatCard";
import { FormInput } from "@/components/FormInput";
import { SubmitButton } from "@/components/SubmitButton";
import { createClient } from "@/lib/supabase/server";
import { formatPersonDate, DateDisplayFormat } from "@/lib/format/date";
import { addPerson, deletePerson } from "./actions";
import { createHouseholdShareInvite } from "../account/actions";
import { applyVisibleDataFilter, getActiveHouseholdContext } from "@/lib/auth/household-context";

type Person = {
  id: string;
  name: string;
  relationship: "self" | "partner" | "child" | "other";
  birth_date: string | null;
  active_until: string | null;
  avatar_url: string | null;
};

function personCardClasses(relationship: Person["relationship"]) {
  if (relationship === "child") {
    return "border-sky-200 bg-sky-100/50 hover:bg-sky-100";
  }

  if (relationship === "self" || relationship === "partner") {
    return "border-orange-200 bg-orange-50 hover:bg-orange-100";
  }

  return "border-slate-200 bg-white hover:bg-slate-50";
}

function personNameClasses(relationship: Person["relationship"]) {
  if (relationship === "self" || relationship === "partner") return "font-bold text-orange-950";
  return "font-semibold text-slate-950";
}

export default async function HouseholdPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const householdContext = await getActiveHouseholdContext(supabase, user);
  const peopleQuery = supabase
    .from("people")
    .select("id, name, relationship, birth_date, active_until, avatar_url")
    .or("account_status.is.null,account_status.neq.duplicate_merged")
    .order("created_at", { ascending: false });
  const { data: people } = await applyVisibleDataFilter(peopleQuery, householdContext).returns<Person[]>();

  const [{ data: household }, { data: members }, { data: shareInvites }] = await Promise.all([
    householdContext.householdId ? supabase.from("app_households").select("id, name, currency, timezone, image_url").eq("id", householdContext.householdId).maybeSingle() : Promise.resolve({ data: null }),
    householdContext.householdId ? supabase.from("app_household_members").select("id, email, role, permission_tier, status, created_at").eq("household_id", householdContext.householdId).eq("status", "active").order("created_at", { ascending: true }) : Promise.resolve({ data: [] }),
    householdContext.householdId ? supabase.from("household_join_invites").select("id, invited_email, role, permission_tier, status, short_code, expires_at, created_at").eq("household_id", householdContext.householdId).order("created_at", { ascending: false }).limit(5) : Promise.resolve({ data: [] }),
  ]);

  const { data: profile } = await supabase
    .from("app_user_profiles")
    .select("date_display_format, default_person_image_mode")
    .eq("user_id", user.id)
    .maybeSingle();

  const dateDisplayFormat = (profile?.date_display_format || "age_and_date") as DateDisplayFormat;
  const useImages = (profile?.default_person_image_mode || "avatar_url") !== "initials";
  const peopleRows = people ?? [];
  const memberRows = (members ?? []) as any[];
  const inviteRows = (shareInvites ?? []) as any[];
  const canInvite = householdContext.isOwnerOrAdmin || Boolean(householdContext.canManagePeople);
  const children = peopleRows.filter((person) => person.relationship === "child").length;
  const inactive = peopleRows.filter((person) => person.active_until).length;

  return (
    <>
      <Nav />
      <main className="mx-auto max-w-7xl space-y-7 px-4 py-6 sm:px-6 lg:px-8">
        <div>
          <h1 className="text-4xl font-black tracking-tight text-slate-950 md:text-5xl">Household</h1>
          <p className="mt-1 text-slate-600">
            Add adults, children and dependants once, then share them across active household members. Pay, maternity, child costs and bills live on the person profile or Spending pages.
          </p>
          {household ? <p className="mt-2 text-sm font-semibold text-slate-500">Active household: {(household as any).name || "Household"}</p> : null}
        </div>

        <section className="grid gap-4 md:grid-cols-3">
          <StatCard title="People" value={String(peopleRows.length)} helper="Visible household profiles" />
          <StatCard title="Members" value={String(memberRows.length)} helper="Active joined accounts" />
          <StatCard title="Children" value={String(children)} helper="Shared child profiles with costs" />
        </section>

        <SectionCard title="Add person" description="Add yourself, your wife/partner and children. Click a person card to manage the detail.">
          <form action={addPerson} className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
            <FormInput label="Name" name="name" required />
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Relationship</span>
              <select name="relationship" className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-orange-500 focus:ring-2">
                <option value="self">Self</option>
                <option value="partner">Partner</option>
                <option value="child">Child</option>
                <option value="other">Other</option>
              </select>
            </label>
            <FormInput label="Birth date" name="birth_date" type="date" />
            <FormInput label="Image URL" name="avatar_url" placeholder="Optional profile image" />
            <FormInput label="Active from" name="active_from" type="date" />
            <div className="flex items-end"><SubmitButton>Add person</SubmitButton></div>
          </form>
        </SectionCard>



        <SectionCard id="invite" title="Invite or join household" description="Invite a partner by email. When they accept, they choose whether to share all history, from today, from a date, or nothing yet.">
          {canInvite ? (
            <form action={createHouseholdShareInvite} className="grid gap-4 md:grid-cols-5">
              <FormInput label="Email" name="invite_email" type="email" placeholder="partner@email.com" />
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Role</span>
                <select name="role" className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-orange-500 focus:ring-2">
                  <option value="member">Member</option>
                  <option value="parent">Parent</option>
                  <option value="admin">Admin</option>
                  <option value="viewer">Viewer</option>
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Permission</span>
                <select name="permission_tier" className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none ring-orange-500 focus:ring-2">
                  <option value="member">Member</option>
                  <option value="parent">Parent</option>
                  <option value="admin">Admin</option>
                  <option value="viewer">Viewer</option>
                </select>
              </label>
              <FormInput label="Expires after days" name="expires_days" type="number" defaultValue="14" />
              <div className="flex items-end"><SubmitButton>Create invite</SubmitButton></div>
            </form>
          ) : (
            <p className="text-sm text-slate-500">Only a household owner/admin can invite members.</p>
          )}
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {memberRows.map((member) => (
              <div key={member.id} className="rounded-2xl border border-slate-200 bg-white p-4 text-sm">
                <p className="font-black text-slate-900">{member.email || "Linked account"}</p>
                <p className="text-slate-500">{member.role || "member"} · {member.permission_tier || "member"}</p>
              </div>
            ))}
            {inviteRows.map((invite) => (
              <div key={invite.id} className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm">
                <p className="font-black text-amber-950">Pending invite {invite.short_code ? `#${invite.short_code}` : ""}</p>
                <p className="text-amber-800">{invite.invited_email || "Open invite"} · {invite.permission_tier || "member"}</p>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="People" description="Parent/self/partner cards use a warm highlight. Child cards use a soft blue background with 50% opacity.">
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {peopleRows.map((person) => (
              <div key={person.id} className={`rounded-2xl border p-4 transition ${personCardClasses(person.relationship)}`}>
                <div className="flex items-start justify-between gap-4">
                  <Link href={`/household/${person.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                    {useImages && person.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={person.avatar_url} alt="" className="h-12 w-12 shrink-0 rounded-2xl object-cover shadow-sm" />
                    ) : (
                      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/80 text-sm font-black text-slate-700 shadow-sm">{person.name.slice(0, 1).toUpperCase()}</span>
                    )}
                    <span className="min-w-0">
                      <p className={personNameClasses(person.relationship)}>{person.name}</p>
                      <p className="text-sm capitalize text-slate-600">{person.relationship}</p>
                      {person.birth_date ? <p className="mt-1 text-xs text-slate-500">{formatPersonDate(person.birth_date, dateDisplayFormat)}</p> : null}
                      <p className="mt-2 text-xs font-medium text-slate-500">Open profile →</p>
                    </span>
                  </Link>
                  <form action={deletePerson}>
                    <input type="hidden" name="id" value={person.id} />
                    <button className="text-sm font-medium text-red-600">Delete</button>
                  </form>
                </div>
              </div>
            ))}
            {peopleRows.length === 0 ? <p className="text-sm text-slate-500">No people added yet.</p> : null}
          </div>
          {inactive > 0 ? <p className="mt-4 text-xs text-slate-500">{inactive} profile(s) have an active-until date set.</p> : null}
        </SectionCard>
      </main>
    </>
  );
}
