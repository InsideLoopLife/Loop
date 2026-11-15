import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { createClient } from "@/lib/supabase/server";
import { getVerifiedUser } from "@/lib/supabase/verified-user";
import { getActiveHouseholdContext, householdPeopleOrFilter, visibleDataOrFilter } from "@/lib/auth/household-context";
import { loadCalendarMonth } from "@/lib/calendar/month-view";
import { LoopCalendar } from "@/components/calendar/LoopCalendar";

export const dynamic = "force-dynamic";

function currentLondonMonth() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);
}

export default async function CalendarRoute({ searchParams }: { searchParams?: Promise<{ month?: string; person?: string; day?: string }> }) {
  const params = (await searchParams) || {};
  const supabase = await createClient();
  const { data: { user } } = await getVerifiedUser(supabase);
  if (!user) redirect("/login");

  const household = await getActiveHouseholdContext(supabase, user);
  const month = /^\d{4}-\d{2}$/.test(params.month || "") ? params.month! : currentLondonMonth();
  const data = await loadCalendarMonth(supabase, {
    userId: user.id,
    dataOwnerUserId: household.dataOwnerUserId || user.id,
    householdId: household.householdId,
    filter: visibleDataOrFilter(household),
    peopleFilter: householdPeopleOrFilter(household),
    month,
  });

  return (
    <>
      <Nav />
      <main className="mx-auto w-full max-w-[1600px] px-3 py-5 sm:px-6 lg:px-8">
        <LoopCalendar data={data} initialPerson={params.person || "__all__"} initialDay={/^\d{4}-\d{2}-\d{2}$/.test(params.day || "") ? params.day! : null} />
      </main>
    </>
  );
}
