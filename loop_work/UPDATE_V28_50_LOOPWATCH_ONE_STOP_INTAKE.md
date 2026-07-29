# v28.50 - LoopWatch one-stop intake logic

This update turns LoopWatch from a contract extractor into a one-stop household intake portal.

## What changed

- Full app update based on v28.48 full app plus v28.49 deal/cost logic.
- Adds `lib/loopwatch/intake-router.ts`.
- Adds SQL migration `db/v28_50_loopwatch_one_stop_intake_logic.sql`.
- Expands LoopWatch upload types to include:
  - school calendar / term dates
  - school agenda / notice
  - bill / statement
  - council tax bill
  - appointment letter
  - vehicle service / MOT
- Upload owner defaults to **Auto-detect** instead of picking the first person by accident.
- LoopWatch now suggests the likely household person from the document text, filename and user note.
- LoopWatch stores routing suggestions in metadata only, not the source document.
- LoopWatch cards show smart setup questions such as:
  - “This looks like an insurance policy for X. Is that right?”
  - “Do you want this cost in Financial Flow?”
  - “This looks like school/nursery dates for Oakley. Add them to Family Planning?”
- Adds a server action to import school/nursery dates into Family Planning from extracted metadata.

## Important privacy point

The source document is still not stored. The system keeps extracted fields, confidence, review flags and routing suggestions only.

## Deploy order

1. Run previous LoopWatch SQL if not already run:
   - `db/v28_48_loopwatch_document_intelligence.sql`
   - `db/v28_49_loopwatch_deal_cost_logic.sql`
2. Run:
   - `db/v28_50_loopwatch_one_stop_intake_logic.sql`
3. Deploy the full code update.
4. Test `/loopwatch` with:
   - a mobile/broadband bill
   - an insurance policy
   - a school calendar/agenda
   - a savings or mortgage document

## Build note

I could not run a clean full TypeScript build inside the sandbox because the extracted codebase does not include node_modules / Next type packages. I did run a targeted TypeScript invocation and checked for errors in the changed LoopWatch files; the visible failures were missing dependency/type-package errors from the sandbox environment rather than syntax errors in the updated files.
