# LOOP v28.86 — investment history integrity, personal income scope and House workflow

## Investment history integrity

The account chart no longer totals snapshots by exact timestamp. A market refresh writes one row per holding and other import paths may write those rows seconds apart. Treating each timestamp as a complete portfolio made the account appear to collapse to one share and then jump back.

v28.86 now:

- assigns one `snapshot_batch_id` to every holding written by the same market-worker refresh;
- assigns one batch ID and timestamp to all positions imported in the same SnapTrade account refresh;
- reconstructs older unbatched rows into safe time buckets;
- carries forward the latest known value per holding only after a valid baseline exists;
- requires at least 95% holding coverage before emitting an account point;
- removes isolated down/up or up/down spikes;
- compares the newest complete point with the current account value;
- refuses to draw the line when the series cannot safely represent the whole account;
- never automatically rebuilds an account-value line by applying today's units to old market prices;
- uses price history, rather than current-units value history, on individual share charts.

The existing raw snapshots are preserved for audit. Unsafe partial points are ignored rather than deleted.

## Income scope and household identity

- The Income page now resolves the signed-in person using `linked_user_id`, then account email, then the owner/self record.
- It no longer treats a generic `people.user_id` value as proof that a household person is the signed-in member.
- The signed-in person's income is the default view.
- Household income is available only through the explicit Household view control.
- If the signed-in account cannot be safely linked to a household person, LOOP shows no other person's income by default and asks for the identity link to be repaired.
- Duplicate person IDs are reattached to the active canonical person without deleting or combining pay rows. Two jobs for one person remain two jobs.
- Unassigned income lines remain visible as a data-quality warning and are not guessed onto a person.

## House and mortgage workflow

- Mortgage and Property are consolidated into one **House** navigation item.
- A user creates a home first and is then asked whether it has a mortgage.
- Home ownership and mortgage liability are separate allocations across household people.
- Main affordability uses normal salary assumptions.
- Maternity pay is shown as a separate temporary exposure score rather than reducing the core long-term affordability basis.
- Current mortgage cards open a key-facts modal.
- Mortgage deal rows can be starred; one starred deal per home becomes the comparison bubble.
- The moving-home tab label and description can be personalised by the user.

## Required migrations

Run in this order:

1. `supabase/migrations/202607131500_house_mortgage_liability_star_workspace.sql`
2. `supabase/migrations/202607131700_investment_snapshot_batch_integrity.sql`
3. `supabase/migrations/202607131800_income_person_scope_repair.sql`
