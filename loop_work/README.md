# AI ticker coverage — cost fix + one-shot resolution

## Files

```
lib/investments/market-data.ts          — dropped the web_search tool; OpenAI still used, just answers from its own knowledge
lib/investments/price-snapshot-runner.ts — one-shot AI resolution attempt + permanent inactive-and-notify on failure
lib/integrations/secrets.ts              — removed two redundant blocks that hard-disabled any OpenAI key in the worker
```

Drop straight into your repo at those paths.

## Before this does anything: one env var to set

Nothing in this changeset turns AI coverage on by itself — it was already `false`
in your Render env (`MARKET_DATA_WORKER_AI_COVERAGE_ENABLED`). Flip it to `true`
when you're ready.

**Also needed:** an OpenAI key the worker can actually use. Set one of these on
the `Loop` worker service in Render:

```
OPENAI_API_KEY=sk-...
```

(`OPENAI_TOKEN` or `LOOP_OPENAI_API_KEY` both work too — first one found wins.)
This is a genuinely new requirement — previously the worker was hard-blocked
from ever using an OpenAI key at all, by two separate, redundant checks, so
this env var did nothing even if it happened to be set. Now it's load-bearing.

If you'd rather each person use their own connected OpenAI integration
instead of one shared key, that already works too (`getActiveIntegrationSecret`
checks the per-user `integration_secrets` table first, env var second) — you
just don't strictly need it for this to function.

## What actually changed, mechanically

1. **The cost driver.** `openAiInvestmentSearch` sent
   `tools: [{ type: "web_search_preview" }]` on every call — OpenAI bills that
   tool separately from normal tokens. It's gone. The same function still
   calls OpenAI, just asks it to answer from training knowledge rather than
   live-browsing. Good for well-known tickers/companies; won't help with
   something genuinely obscure or very recently listed — that's an honest
   trade-off, not a bug.

2. **One attempt, then done.** When the worker can't get a deterministic
   quote for a ticker and AI coverage is on, it tries exactly once. A
   confident match (≥70%) resolves the holding immediately. Anything less
   sets `price_polling_enabled: false` and
   `instrument_resolution_status: "ai_failed"` on every holding tied to that
   ticker — the same flag that already excludes a holding from the worker's
   working set on every future run, so there's no separate "have we tried
   this before" check needed; it's structurally impossible to retry after a
   failure without someone fixing it by hand.

3. **A genuine API error is not the same as "no match."** If the OpenAI call
   itself fails (network blip, rate limit, etc.), nothing gets marked
   inactive — it just retries next cycle, same as before. Only an actual
   "searched, found nothing confident" result triggers permanent
   deactivation.

4. **Manually correcting a holding already un-deactivates it.** This was
   true before this change and needed no new code: fixing a ticker through
   the existing remap flow already resets `instrument_resolution_status`
   back to `"pending"` and re-enables polling.

5. **Notification.** Each affected holding gets a row in
   `loop_money_notifications` (`notification_kind: "investment_holding_deactivated"`,
   `action_url: "/investments"`) — same table and insert pattern your
   existing `money-deals-daily` cron already uses, so it should render
   through whatever UI already surfaces that table without new frontend
   work.

## Update 2: two more blockers found from your actual boot log, plus a bug of mine

Your boot log showed `aiCoverageEnabled: true` (correct — you set the env var
right) but `hasOpenAiKey: false` and `scrubbedAiKeys: [ 'OPENAI_API_KEY' ]`.
Nothing in the previous drop could have worked with that log — three
separate things needed fixing:

1. **`scripts/market-data-direct-worker.ts` was deleting `OPENAI_API_KEY`
   from the process environment at boot, unconditionally**, plus force-
   setting `LOOP_AI_DISABLED=true` — both leftover from a "v28.36 safety"
   comment, clearly a blunt fix applied after the original cost spike, that
   ignored `MARKET_DATA_WORKER_AI_COVERAGE_ENABLED` entirely. Both are now
   conditional on that flag: if you haven't turned coverage help on, a fresh
   worker still boots with AI fully off by default (same safe posture as
   before) — but turning it on is now actually respected instead of
   silently overridden two different ways.

2. **A bug in the previous fix, mine.** `openAiInvestmentSearch` had an
   internal check hardcoded to `worker: false`, which looks at
   `LOOP_ENABLE_AI_MARKET_SEARCH` — a different flag from
   `MARKET_DATA_WORKER_AI_COVERAGE_ENABLED`, which is what your worker
   actually has set. So even after fixing #1, the worker's own check would
   pass, call into this function, and immediately fail a second check with
   the wrong flag. Now auto-detects which process it's running in instead
   of hardcoding it, so both the worker path and the user-initiated
   coverage-request path check the flag that's actually relevant to them.

New file in this drop: `scripts/market-data-direct-worker.ts`.

### What your env vars should show after this deploys

Same three you already have (`MARKET_DATA_WORKER_AI_COVERAGE_ENABLED=true`,
`OPENAI_API_KEY=sk-...`), no new ones needed. The next boot log should show:

```
hasOpenAiKey: true,
scrubbedAiKeys: [],
```

instead of the `false` / `['OPENAI_API_KEY']` you saw before.

## Deliberately not included in this drop

- Nothing here touches the admin coverage-request flow
  (`app/api/cron/investment-coverage-requests/route.ts`) that runs when a
  person explicitly searches for a new instrument to add — that path was
  already fine and untouched.

## Update: delisting is now part of the same one-shot call, not a separate feature

The first version of this only had two outcomes: AI finds a confident match,
or it doesn't. "Doesn't" always produced the same generic
"couldn't confidently match" message, even for a ticker that's genuinely
gone (delisted, acquired, renamed) — and building real delisting detection
as its own thing would have meant tracking repeated failures over time,
which risks the exact "AI called a million times" problem this was meant to
avoid.

Turns out neither is needed: the same single AI call already has enough
context to say *why* it can't find something. `openAiInvestmentSearch` now
returns `{ matches, status, explanation }` instead of a bare array —
`status` is one of `found | delisted | renamed | acquired | not_found |
unknown`, and `explanation` is the model's own short reason when it's not
`found` (e.g. "Acquired by X in 2024 and delisted"). This is still exactly
one API call per ticker, same cost as before — just asking one more thing
of the same response instead of a second lookup.

The notification and `instrument_resolution_notes` text now reads
accordingly — a ticker the model believes is delisted gets "has been
removed from tracking — it appears to have been delisted: ..." instead of
the old generic wording. A ticker that simply doesn't exist gets a
different, honest message too, rather than everything collapsing into one
generic sentence.

Practically: `ITS` and `FAZE` (the two failures in your own log) go through
this exact path on their very next check once `MARKET_DATA_WORKER_AI_COVERAGE_ENABLED`
is on — they fail every single cycle already, so there's no waiting for
some separate detection window to elapse.

## Verification done

- All three files are bracket-balanced (no syntax breakage from the edits)
- Traced every call site of the two removed guard functions to confirm
  nothing else depended on them
- Confirmed the existing manual-remap action already resets the status this
  new "ai_failed" state relies on for recovery
- **Not done:** an actual `npm run build` or live run against your Supabase
  project — worth doing before this reaches production, same as every other
  drop this session.
