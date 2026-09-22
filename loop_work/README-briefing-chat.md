# /briefing rebuilt as a real chat — apply & push

## 1. SQL — already applied, nothing to run
I applied this directly to `vuqlgderfszguttdnxsr` via the Supabase MCP tools (2 migrations:
`register_financial_briefing_chat_route`, `register_financial_briefing_chat_ai_route`). It:
- Registers a new AI route `financial_briefing_chat` in `loop_ai_model_routes`, filling in the
  `household_assistant` task kind that existed in `lib/ai/model-routing.ts` but was never wired up.
- Gives each tier a daily request limit + monthly pence budget in `loop_tier_ai_model_config`
  (free 5/day, plus 40/day, premium 120/day, pro 250/day, staff 1000/day).
- Verified with `get_advisors` — no new security advisories, same pre-existing WARN baseline.

This is what makes it a metered, gated AI feature rather than an unlimited free-form chat — every
message call goes through `loop_check_ai_entitlement()` before hitting OpenAI.

## 2. Files — extract into your repo root
```powershell
cd C:\Users\danie\Documents\Loop
Expand-Archive -Path "$env:USERPROFILE\Downloads\loop-briefing-chat-v1.zip" -DestinationPath . -Force
```

**Delete these 3 files** — they're superseded by the chat shell and no longer used:
```powershell
Remove-Item loop_work\components\briefing\BriefingStory.tsx
Remove-Item loop_work\components\briefing\StoryBeat.tsx
Remove-Item loop_work\components\briefing\NetWorthHero.tsx
```

Then:
```powershell
cd loop_work
git status
```
Confirm you see: `app/briefing/page.tsx` modified, 3 files deleted, and 6 new files under
`app/api/briefing/chat/`, `components/briefing/`, `lib/briefing/chat-cards.ts`.

```powershell
git add app/briefing/page.tsx app/api/briefing/chat components/briefing lib/briefing/chat-cards.ts
git commit -m "Rebuild /briefing as a real chat: input bar, on-demand cards, metered AI replies"
git push origin main
```

## What this actually does
- Page loads instantly with one assistant message (the same deterministic narrative as before,
  no AI call, no cost) plus the net-worth card.
- Type a question in the bottom input bar → hits `/api/briefing/chat` → grounds the reply in the
  real `buildFinancialBriefing()` data (the model is given the full JSON and told never to invent
  a number) → picks at most one existing card to show alongside its reply, or none.
- Every AI call is metered per user/tier through the migration above. If the user has no OpenAI
  key configured or hits their daily/monthly limit, the endpoint falls back to a deterministic,
  keyword-matched answer built from the same real data — the chat never goes silent or breaks,
  it just stops using the model.
- `useLiveBriefing` keeps the underlying figures refreshing in the background (unchanged from
  before), so a card rendered mid-conversation reflects the latest numbers, not a stale snapshot.

## Verified before sending
- `npx tsc --noEmit` — clean, zero errors project-wide
- `npx eslint` on every touched/new file — zero new errors or warnings (same pre-existing
  `no-explicit-any` set in `build-financial-briefing.ts` as before, nothing new)
- `npx next build` — succeeds; `/briefing` and `/api/briefing/chat` both compile as dynamic routes

## Known follow-ups / judgment calls I made
- **Model + limits are a starting guess** (`gpt-4.1-mini` free/plus, `gpt-4.1` premium+, modeled on
  `profile_insight`'s shape). Easy to retune in `loop_tier_ai_model_config` directly, no redeploy needed.
- **The opening message is still deterministic**, not an AI call — I didn't want every page load to
  burn a token before the user's asked anything. Say the word if you'd rather the very first message
  be AI-generated too.
- **Card selection is single-card-per-reply** — the model can't stack two cards in one answer. Given
  chat bubble width, this seemed like the right constraint, but flagging it as a real design choice.
- Reused `CategoryGrid`, `ActionsBeat`, `FlowBeat`, `PortfolioBeat`, `SavingsBeat`, `HomeBeat`,
  `EvidenceBeat` as-is from the previous build — they're unchanged, just now rendered inline in chat
  via `ChatCardRenderer` instead of in a fixed reveal sequence.
