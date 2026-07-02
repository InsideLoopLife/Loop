# v28.35 AI usage guardrails

This update prevents the market-data worker from using OpenAI/web-search unless explicitly enabled.

Safe defaults:
- `MARKET_DATA_WORKER_AI_COVERAGE_ENABLED=false`
- `LOOP_ENABLE_AI_MARKET_SEARCH=false`
- `LOOP_ENABLE_WEB_SEARCH_MARKET_LOOKUP=false`
- `LOOP_ENABLE_AI_HOLDING_IMAGE_IMPORT=false`

The market worker should not need OpenAI keys. It should price known catalogue/listing rows using quote sources and SnapTrade only.

Admin > Investment storage now shows:
- AI tokens in the last 24h and 7d
- web-search tool calls
- estimated cost if env rates are configured
- guardrail env status

Run:
`db/v28_35_ai_usage_guardrails.sql`
