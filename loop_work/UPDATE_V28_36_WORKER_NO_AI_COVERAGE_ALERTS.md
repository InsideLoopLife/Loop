# v28.36 Worker No-AI Coverage Alerts

This update hard-disables OpenAI/web-search from the Render market-data worker.

## Behaviour

- The worker scrubs OpenAI env keys at boot if they are accidentally present.
- `LOOP_AI_DISABLED=true` is enforced inside the worker process.
- Unknown/unpriced instruments are **not** researched by AI.
- Unknown/unpriced instruments are marked `coverage_required`.
- Polling is paused for affected holdings by setting `price_polling_enabled=false`.
- An admin coverage request is created/reused in `loop_investment_ai_market_requests`.

## Required SQL

Run:

```txt
db/v28_36_worker_no_ai_coverage_alerts.sql
```

## Worker env

Keep these set:

```env
MARKET_DATA_WORKER_AI_COVERAGE_ENABLED=false
LOOP_ENABLE_AI_MARKET_SEARCH=false
LOOP_ENABLE_WEB_SEARCH_MARKET_LOOKUP=false
LOOP_ENABLE_AI_HOLDING_IMAGE_IMPORT=false
```

Do not add OpenAI keys to the worker service.
