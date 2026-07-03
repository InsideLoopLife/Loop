# v28.42 chart/daily movement, setup suppression and savings ownership polish

- Investment history API removes obvious first/last generated-history spikes before rendering.
- Interactive chart styling is calmer, with fewer duplicate x-axis labels and clearer hover cards.
- Holding cards/modal show daily value movement from previous close using price move × units.
- Worker previous-close lookup falls back to prior point_at when older global rows do not have point_date.
- Completed/skipped onboarding checklist now redirects away automatically so it stops reappearing after 7/7 completion.
- Savings page gets a House-style landing hero and one-tap person/household allocation buttons on each savings card.
- SQL ensures onboarding, savings ownership, and investment daily movement columns exist.
