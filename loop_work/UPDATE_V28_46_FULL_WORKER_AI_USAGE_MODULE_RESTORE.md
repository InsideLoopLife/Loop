git add . && git commit -m "Code updates" && git push origin worker-render-code# v28.46 full worker restore

This is a full Render worker package, not a partial patch.

- Adds the missing lib/ai/usage.ts module required by lib/investments/market-data.ts.
- The module is guardrail-only in the worker and does not enable OpenAI/web-search.
- Market-data worker continues to block AI market search unless explicitly enabled.
