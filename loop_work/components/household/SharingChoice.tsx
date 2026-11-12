import { SubmitButton } from "@/components/SubmitButton";
import { setMyShareLevel } from "@/app/household/actions";

export const SHARE_LEVELS = [
  { value: "view", label: "Shared, view only", help: "Your bills and pay count in the household figures. Only you can change them." },
  { value: "edit", label: "Shared, others can edit", help: "Partners can also update or remove your bills and pay." },
  { value: "private", label: "Private", help: "Nobody else sees your money. It's left out of the household figures." },
] as const;

export const shareLabel = (level?: string | null) => SHARE_LEVELS.find((l) => l.value === (level || "view"))?.label ?? "Shared, view only";

/** How you share your own money with the household. */
export function SharingChoice({ current }: { current?: string | null }) {
  const value = current || "view";
  return (
    <form action={setMyShareLevel} className="space-y-3">
      <fieldset className="grid gap-2 md:grid-cols-3">
        <legend className="sr-only">How you share your money</legend>
        {SHARE_LEVELS.map((level) => (
          <label key={level.value} className="flex cursor-pointer items-start gap-3 rounded-2xl border border-[var(--line)] bg-white p-4 has-[:checked]:border-[var(--pine)] has-[:checked]:bg-[var(--pine-wash)]">
            <input type="radio" name="share_level" value={level.value} defaultChecked={value === level.value} className="mt-1 accent-[var(--pine)]" />
            <span>
              <span className="block text-sm font-semibold text-[var(--ink)]">{level.label}</span>
              <span className="mt-0.5 block text-xs text-[var(--muted)]">{level.help}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <p className="text-xs text-[var(--muted)]">Anything assigned to you is always yours to change. Children&apos;s costs can be updated by Partners and Parents.</p>
      <SubmitButton className="rounded-xl bg-[var(--ink)] px-4 py-2 text-sm font-semibold text-white">Save</SubmitButton>
    </form>
  );
}
