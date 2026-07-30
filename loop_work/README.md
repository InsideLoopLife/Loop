# Three files: SnapTrade cost-basis protection + Remove access fix

## Files to update
```
lib/snaptrade/sync.ts
app/account/actions.ts
domains/identity/account/AccountPage.tsx
```

## What each does

**`lib/snaptrade/sync.ts`** — protects cost basis from being silently
wiped on incomplete syncs. A manually-confirmed cost basis is never
touched by a sync again; provider data only gets applied when it's an
actual improvement over what's stored, never a regression back to
"unknown." (This is on top of the earlier `price_polling_enabled` fix —
both are in this one file, confirmed present.)

**`app/account/actions.ts`** — fixes "Remove access" actually working.
Root cause: the code was trying to set a connection's status to
`"removing"`/`"removed"`, but the database's own check constraint never
allowed either value — only `disabled` (among others) is valid. Every
disconnect attempt has been silently failing at that step since this
feature existed. Now uses the correct value, and the update's result is
checked instead of discarded, so a future failure would actually be
visible instead of invisible. Also: one account failing to archive can
no longer block the connection itself from being marked removed.

**`domains/identity/account/AccountPage.tsx`** — the connections list
now actually filters out disabled connections, instead of showing every
connection ever created regardless of status.

## Already done for you, directly in the database
Your two stuck Trading212 connections have already been manually marked
`disabled` — you don't need to re-click "Remove access" for those two,
they're already in the correct end state. This code fix is what makes
it work correctly for any future disconnect.

## Verification
All 3 files pass a fresh esbuild syntax check.
