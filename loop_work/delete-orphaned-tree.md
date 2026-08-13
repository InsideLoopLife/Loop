# Delete the orphaned tree — don't patch it further

The build failure is `components/house/HouseOverviewPage.tsx` importing `./MortgageBubble` and `./FollowOnCard`, which were in the zip I sent two messages ago but apparently never made it into a commit — only `StatStrip.tsx`, `GlimpseNavGrid.tsx`, and `HouseOverviewPage.tsx` are actually in your repo.

I checked: **nothing outside this tree imports from it.** The real House page (`domains/wealth/house/HousePage.tsx` → `components/mortgage/MortgagePlannerClient.tsx`) never used any of it. So the fix isn't to add the missing files back — it's to delete the whole thing. It was dead code from the start.

## Run this in your Codespace
```bash
cd /workspaces/Loop/loop_work
rm -rf components/house lib/house app/api/house
git add -A
git commit -m "Remove orphaned house-overview scaffold — never wired to the real page"
git push
```

## Verified before suggesting this
Cloned your repo fresh, deleted exactly those three directories, ran `npm install && npm run build` for real:
```
✓ Compiled successfully in 56s
  Finished TypeScript in 100s
```
Same single unrelated failure as last time (`/account/money-strategy` — missing Supabase env vars in my sandbox only, not your repo). Nothing else broke. Nothing else referenced these files.

The two real fixes from the last two messages — the `mortgage_liability_allocation_effective` view and the two small changes in `HousePage.tsx` / `MortgagePlannerClient.tsx` — are untouched by this and stay in.
