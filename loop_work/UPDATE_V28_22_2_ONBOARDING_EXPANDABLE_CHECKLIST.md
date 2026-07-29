# UPDATE V28.22.2 — Onboarding expandable checklist

## What changed

The first-run onboarding page now shows more than the top-level 7 setup cards.

Each card now has an expandable progress checklist showing exactly what LOOP has already detected and what is still missing.

Examples:

- Account
  - email verified
  - name added
  - profile photo added
  - phone/contact added
  - timezone/preferences set
- Salary
  - income record added
  - salary or take-home value stored
  - active income period set
- Spending
  - first bill/planned cost added
  - bill value captured
  - spending category created
- Household
  - household linked
  - people/family profiles added
  - permissions reviewed
- Investments
  - investment pot added
  - holdings/assets added
  - broker/cash details linked
- Pensions
  - pension pot added
  - funds/scheme rules added
  - contribution settings reviewed
- House
  - current home added
  - home value/purchase price captured
  - mortgage/rate attached
  - valuation source added
  - moving-home search saved

## Behaviour

- The main progress counter still shows top-level setup progress.
- A second small counter shows total sub-check progress.
- Each card has an “Open section” link and an expandable progress control.
- Completed sub-items show a green tick.
- Missing sub-items show a grey circle and, where relevant, a small “Go” button.
- Optional items are labelled optional so the setup flow does not feel blocked.

## SQL

No SQL migration is required for this update.
