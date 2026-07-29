# v28.54 — Open-change investment logic, SnapTrade worker loading, LoopWatch mini-AI

## Why
- Previous-close data was unreliable for some provider/import paths, so portfolio cards could show no daily movement.
- The direct worker loaded `lib/snaptrade/sync` but the alias imports inside that module could fail in the standalone Render worker.
- LoopWatch could misclassify weak PDF text / school term-date documents as a generic contract.

## Changes
- Investment holdings now calculate user-facing daily movement from the market-open / first stored point today.
- Previous-close fields are retained as provider metadata but no longer block the visible daily move.
- Added `day_open_price_gbp`, `day_open_native_price`, `day_open_at`, `day_change_basis` to holdings and snapshots.
- Worker now uses `createRequire` for SnapTrade sync so tsx/tsconfig path aliases resolve more reliably.
- LoopWatch extraction now includes filename, user note and selected document hint in the mini-AI classification context.
- LoopWatch text extraction defaults to `gpt-4o-mini` for structured extraction and keeps `gpt-4.1-mini` for image OCR unless overridden.
- No web search is used for LoopWatch extraction.

## Deploy
1. Run `db/v28_54_open_change_snaptrade_loopwatch_ai.sql`.
2. Deploy full code.
3. Restart the web app and market worker.
4. For LoopWatch AI extraction, set `LOOP_DOCUMENT_AI_KEY` or `OPENAI_API_KEY`. Optional: `LOOP_DOCUMENT_AI_MODEL=gpt-4o-mini`.
