import { redirect } from "next/navigation";

// "Can I afford it?" now lives with each planned purchase in Spending, and the
// "what if a job ended" check sits under the redundancy safety net on Income.
export default async function CanIAffordPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const params = (await searchParams) || {};
  const lost = typeof params.lost === "string" && /^[0-9a-f-]{36}$/i.test(params.lost) ? params.lost : null;
  redirect(lost ? `/income?whatif=${lost}#redundancy` : "/spending?plan=new#planned-purchases");
}
