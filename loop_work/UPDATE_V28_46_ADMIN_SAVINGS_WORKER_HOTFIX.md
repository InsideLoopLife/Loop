# v28.46 admin/savings/worker hotfix

- Fixes the product URL import build error caused by an accidental newline inside a string literal.
- Keeps URL import processing wired to create staged product import batches from the next 10 links.
- Simplifies savings ownership UX: only the top-right owner avatar opens the owner/delete panel.
- Removes duplicate owner selector row and hidden household visibility chip from savings cards.
- Preserves ownership/visibility fields when editing savings balance/rate/top-up.
- Adds avatar_url support for savings owner profile pictures.
- Restores the worker missing '@/lib/ai/usage' module with a guardrail-only implementation.
