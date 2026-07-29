# LOOP v28.80 — savings context, visual pots and pension evidence

## Financial Flow savings

- The savings percentage card follows the active scope: household, one named person, or selected people.
- The year calendar is savings-only and uses ledger movements for money saved, withdrawals and interest.
- Daily interest is divided into provider-paid interest, deterministic accrual through yesterday, and an estimate for the current day.
- Account lines display `this month / current total`, provider branding, AER, rate-maximisation score and end date.
- “Leftover cash” is labelled “Unassigned equity” in the savings detail page.
- “More context” links to the exact places where an account, movement, pot or bank relationship can be added.

## Guided pots

The new journey is:

1. Pick a template.
2. Name the goal.
3. Enter the target.
4. Choose the target date.
5. Upload/paste a reference image and select owner/account.
6. Mark priority and score its importance.
7. Review the calculated monthly pace and create.

Templates cover holiday, 3/6-month emergency reserves, house deposit, car, repairs, gifts and education. Emergency targets can be prefilled from known essential monthly outgoings.

The visual uses a custom image when supplied. Otherwise it maps the category to a deterministic icon/shape. A true geographic country silhouette requires a destination/country field plus an SVG map dataset; it is deliberately not guessed from a pot name.

Each pot has a monthly activity thread for allocations, removals and corrections.

## Per-person savings tax

The Personal Savings Allowance is calculated per account owner using that person’s latest active income rows. Household accounts are shared across adults for the estimate rather than combining both adults’ salaries into one tax band.

## Pension projections

- Income settings are retried with core columns if a local database has not yet exposed all employer contribution fields.
- Employee salary sacrifice, employer contribution and employer NI top-up are combined.
- Fund performance assumptions store source-backed annualised 5-year and 10-year figures once per year.
- The annual worker calculates CAGR only from unit-price history, avoiding the distortion caused by contributions in total pot values.
- Projection users can select low, middle or high evidence-backed scenarios.
- AI is not used to invent returns. It can later help identify official fund factsheets, but the stored percentages remain deterministic and auditable.
