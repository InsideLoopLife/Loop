# LOOP v28.67 — LoopWatch attach, review, bill allocation and Discover workflows

## Summary
This update rebuilds LoopWatch around the intended user workflow:

1. Search or attach an item.
2. LoopWatch asks for context before sending.
3. LoopWatch creates a review card/modal with extracted or inferred details.
4. The user can pick a household/person image, overwrite fields, then accept.
5. Bills can update an existing Financial Flow bill or create one when no match exists.
6. Watch cards now store price-check cadence and next check date.
7. Discover adds a vehicle workflow for car lease/PCP research with affordability scoring.

## UI updates

### LoopWatch attach flow
Changed `components/loopwatch/LoopWatchUploadClient.tsx` and `app/loopwatch/page.tsx`.

- Added a search-first attach bar.
- Added required “Give me context” behaviour for search-only items.
- Added document upload beside context entry.
- Added household/person avatar selection.
- Added a review modal showing:
  - item type
  - provider/product
  - cost
  - renewal/end date
  - confidence
  - suggested routing
  - source deletion indicator
- Review cards now expose fields for:
  - linked Financial Flow bill
  - next price check
  - price-check cadence

### LoopWatch Discover
Added `components/loopwatch/LoopWatchDiscoverClient.tsx` and a Discover section on `/loopwatch`.

Vehicle workflow includes:

- search prompt, e.g. “Looking for a new car”
- lease / PCP / cash route
- monthly budget
- deposit / initial payment
- term months
- annual mileage
- fuel preference
- household/person owner
- notes/context

Results show:

- shortlist ranking
- affordability band
- monthly cost
- upfront cost
- term/mileage
- score
- monthly impact
- savings impact
- leftover cash after deal
- house affordability note
- pension/savings note

## API updates

### New API routes

- `app/api/loopwatch/intake/route.ts`
  - Creates LoopWatch items from search/context without requiring a document.
  - Runs the same extraction/routing logic as uploaded files.
  - Marks items as `needs_user_review`.

- `app/api/loopwatch/discover/route.ts`
  - Creates vehicle/big-purchase workflows.
  - Reads Financial Flow planned items to estimate affordability base.
  - Scores catalogue/fallback vehicle deals.
  - Creates a LoopWatch review card for the workflow.

### Existing API route changes

- `app/api/loopwatch/process/route.ts`
  - Stores source kind, attach mode, context and review state.
  - Sends Financial Flow actions to `/financial-flow` rather than the old spending page.

## Financial Flow / bill logic

Changed `lib/loopwatch/watch-logic.ts` and `app/loopwatch/actions.ts`.

- Confirmed LoopWatch bills can now:
  - update a manually selected planned bill
  - auto-match an existing planned bill by provider/product/category/amount
  - create a new planned bill when no match is found
- LoopWatch items now store:
  - `linked_planned_item_id`
  - `bill_allocation_mode`
  - `next_price_check_at`
  - `price_check_cadence_days`
  - `review_state`
- Daily watch logic now creates `price_check_due` opportunities when a bill/contract needs a new market price check.
- Revalidation now points at `/financial-flow` after bill sync.

## Extraction/routing updates

Changed `lib/loopwatch/extract.ts`.

- Context prompts such as “looking for a new car”, “car lease”, “PCP deal”, and “vehicle search” now map to `vehicle_contract`.

## Database migration

Added:

- `supabase/migrations/202607071845_loopwatch_attach_discover.sql`
- `db/v28_67_loopwatch_attach_discover.sql`

Migration adds/creates:

- LoopWatch item review/context fields
- bill allocation fields
- price check cadence fields
- `loopwatch_discover_workflows`
- `loopwatch_discover_deals`
- `loopwatch_discover_results`
- RLS policies for Discover workflows/results/deal catalogue reads
- settings flags for LoopWatch context intake, bill allocation and vehicle discover mode
- future integration tasks for aggregator deal feeds

## Validation

Syntax parse checks passed via TypeScript `transpileModule` for:

- `app/loopwatch/page.tsx`
- `components/loopwatch/LoopWatchUploadClient.tsx`
- `components/loopwatch/LoopWatchDiscoverClient.tsx`
- `app/api/loopwatch/intake/route.ts`
- `app/api/loopwatch/discover/route.ts`
- `app/api/loopwatch/process/route.ts`
- `lib/loopwatch/watch-logic.ts`
- `lib/loopwatch/extract.ts`
- `app/loopwatch/actions.ts`

A full Next build was not possible in the sandbox because `node_modules` is not included in the uploaded zip, so `next` is not installed.

## Follow-ups

- Connect/import real vehicle lease/PCP aggregator feeds into `loopwatch_discover_deals`.
- Add admin controls for Discover feed source and refresh cadence.
- Extend Discover beyond cars to other considered purchases such as white goods, holidays, childcare, insurance, broadband and house-move costs.
