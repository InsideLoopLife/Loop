# v28.48 — LoopWatch Document Intelligence

Adds a user-facing **LoopWatch** upload point inside LoopWealth for contract, policy and household document processing.

## What changed

- Added `/loopwatch` page and Wealth navigation item.
- Added upload client for PDFs, images and text documents.
- Added `/api/loopwatch/process` route.
- Added metadata-only extraction tables:
  - `loopwatch_document_jobs`
  - `loopwatch_items`
  - `loopwatch_events`
- Added migration:
  - `db/v28_48_loopwatch_document_intelligence.sql`
- Added heuristic document extraction library:
  - `lib/loopwatch/extract.ts`
- Added editable review cards with confirm/archive flow.
- Added owner/person assignment using household people and avatars.
- Added reminder event creation for:
  - 90 days before renewal/end
  - 45 days before renewal/end
  - 21 days before renewal/end
  - 7 days before renewal/end
  - notice-period buffer if notice days are found

## Privacy / retention behaviour

LoopWatch does **not** store the uploaded source document. The processing route reads the file in memory, extracts structured fields, saves the structured record, then marks the source file deleted.

Saved fields include provider, product/policy type, start/end/renewal dates, notice period, payments, renewal terms, excess/mileage/cover flags, confidence and review flags.

## Optional AI

The heuristic extractor works without an AI key for readable text/PDF text. Better extraction and image OCR can use:

- `LOOP_DOCUMENT_AI_KEY`, or
- `OPENAI_API_KEY`, or
- `OPENAI_PREMIUM_API_KEY`

Optional model envs:

- `LOOP_DOCUMENT_AI_MODEL`
- `LOOP_DOCUMENT_VISION_MODEL`

Set `LOOP_DOCUMENT_AI_DISABLED=true` to force heuristic-only mode.

## Deploy order

1. Run `db/v28_48_loopwatch_document_intelligence.sql` in Supabase.
2. Deploy the app code.
3. Open `/loopwatch` from the Wealth nav.
4. Upload a simple readable PDF or text contract first and confirm the review card.
