import { redirect } from "next/navigation";
import { Nav } from "@/components/Nav";
import { createClient } from "@/lib/supabase/server";
import { dedupeHouseholdPeople, getActiveHouseholdContext, householdMemberDataOrFilter, householdPeopleOrFilter } from "@/lib/auth/household-context";
import { CategoryGroupsBoard, type BoardCategory, type BoardChildCost, type BoardGroup, type BoardItem, type BoardPerson, type BoardPet } from "@/components/spending/CategoryGroupsBoard";

export default async function ManageCategoriesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const householdContext = await getActiveHouseholdContext(supabase, user);
  const householdVisibleFilter = householdMemberDataOrFilter(householdContext);
  const householdPeopleFilter = householdPeopleOrFilter(householdContext);

  const [{ data: people }, { data: groups }, { data: categories }, { data: plannedItems }, { data: childCosts }, { data: pets }] = await Promise.all([
    supabase
      .from("people")
      .select("id, user_id, name, relationship, linked_user_id, account_status")
      .or(householdPeopleFilter)
      .or("account_status.is.null,account_status.neq.duplicate_merged")
      .order("relationship")
      .order("name")
      .returns<BoardPerson[]>(),
    supabase
      .from("spending_category_groups")
      .select("id, name, icon")
      .or(householdVisibleFilter)
      .order("sort_order")
      .order("name")
      .returns<BoardGroup[]>(),
    supabase
      .from("spending_categories")
      .select("id, name, type, category_icon, group_id")
      .or(householdVisibleFilter)
      .order("name")
      .returns<BoardCategory[]>(),
    supabase
      .from("planned_items")
      .select("id, person_id, category_id, direction, label, amount, recurrence, item_type")
      .or(householdVisibleFilter)
      .eq("direction", "outgoing")
      .order("label")
      .returns<BoardItem[]>(),
    supabase
      .from("child_costs")
      .select("id, child_id, category_id, label, cost_kind, monthly_cost")
      .or(householdVisibleFilter)
      .order("label")
      .returns<BoardChildCost[]>(),
    supabase
      .from("household_pets")
      .select("id, name, species")
      .or(householdVisibleFilter)
      .order("name")
      .returns<BoardPet[]>(),
  ]);

  const dedupedPeople = dedupeHouseholdPeople((people ?? []) as any[], householdContext.dataOwnerUserId) as BoardPerson[];

  return (
    <>
      <Nav />
      <main className="mx-auto w-[95vw] max-w-[2000px] space-y-7 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-2">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-orange-600">Financial Flow · Spending</p>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950">Manage categories and groups</h1>
          <p className="max-w-3xl text-slate-600">
            Drag any bill onto a category to file it there. Drag a category onto a group to bundle it — a group like
            "Household bills" can span bills belonging to different people and joint accounts, so this works whether
            it's just you or the whole household. Every category can only belong to one group, so a bill's group is
            always unambiguous.
          </p>
        </div>
        <CategoryGroupsBoard
          people={dedupedPeople}
          groups={groups ?? []}
          categories={categories ?? []}
          items={plannedItems ?? []}
          childCosts={childCosts ?? []}
          pets={pets ?? []}
          hasHousehold={dedupedPeople.length > 1}
        />
      </main>
    </>
  );
}
