# LoopWatch logic run-through

LoopWatch should become the upload portal for new household things.

## Core flow

1. User uploads a document, image or text file.
2. LoopWatch reads it in memory.
3. LoopWatch classifies the item.
4. LoopWatch extracts useful metadata.
5. LoopWatch suggests who it belongs to.
6. LoopWatch asks smart setup questions.
7. User confirms or edits.
8. Loop applies only the confirmed action.
9. Source file is deleted / not stored.

## Useful categories and logic

### Insurance policies

Documents: car, home, life, pet, travel.

Extract:
- insurer
- product/policy type
- renewal/end date
- monthly/annual premium
- excess
- cover level
- mileage limit for car insurance
- auto-renewal
- cancellation/notice terms

Logic:
- renewal window prompts at 90/45/21/7 days
- cover review flags for missing cover level, high excess, missing mileage limit, auto-renewal
- cost sync into Financial Flow after confirmation
- future: comparison API / affiliate source when policy is close to renewal

### Mobile, broadband and household bills

Documents: mobile contract, broadband contract, utility/council tax, bill statement.

Extract:
- provider
- monthly payment
- annual cost
- contract start/end date
- minimum term
- price increase wording
- direct debit / payment frequency

Logic:
- carrier/provider annual increase rule can project April/March increases
- household cost forecast can be updated from confirmed figures
- renewal/end-of-minimum-term reminders
- admin can maintain provider increase rules without hardcoding stale values

### School / nursery documents

Documents: school calendar, agenda, nursery contract, school/nursery fee letter.

Extract:
- child/person name if found
- school/nursery name
- term dates
- inset days
- bank holidays
- fees/costs if present
- closure dates / key dates

Logic:
- suggest the child/person, e.g. “This looks like it is for Oakley. Is that right?”
- import term holidays and inset days into Family Planning after confirmation
- future: agenda/one-off event reminders once the app-wide task/calendar model is selected
- nursery fees can become childcare costs in Financial Flow after confirmation

### Savings and mortgage documents

Documents: savings terms, ISA terms, mortgage offer, fixed rate ending letter.

Extract:
- provider
- rate/AER/APR
- maturity/fixed-end date
- product name
- balance/loan hints where safe
- payment or monthly cost where relevant

Logic:
- savings maturity watch
- better-rate check against savings catalogue
- mortgage renewal watch candidate
- prompt to confirm balance/rate before deal comparison

### Vehicle and warranty documents

Documents: car finance, PCP, lease, service plan, MOT, warranty.

Extract:
- provider
- APR / interest
- monthly payment
- end date
- mileage cap
- optional final payment / settlement terms if present
- warranty expiry

Logic:
- mileage risk prompt
- finance end/renewal prompt
- warranty expiry prompt
- transport cost sync to Financial Flow after confirmation

### Employment / tenancy / general admin

Documents: employment contract, tenancy agreement, appointment letter, generic letter.

Extract:
- dates
- notice periods
- salary/rent where visible
- review/appointment date
- key terms summary

Logic:
- keep private metadata-only card
- renewal/notice reminders where dates exist
- future: create calendar/task entries from appointment letters

## What LoopWatch should not do

- Do not store the uploaded source document.
- Do not pretend to give regulated insurance, mortgage or investment advice.
- Do not auto-apply costs or dates without user confirmation.
- Do not overwrite household costs silently.
- Do not use provider price-rise logic unless the provider rule is active and maintained.

## Best product direction

LoopWatch becomes the user’s “new thing” portal:

- “I’ve got a new policy.”
- “I’ve got a new bill.”
- “I’ve got a school agenda.”
- “I’ve got a new phone contract.”
- “I’ve got a mortgage/savings document.”

The user should not need to know where in the app it belongs. They upload it, LoopWatch asks confirmation questions, then routes it into Financial Flow, Family Planning, Savings, Mortgage, Vehicle or general reminders.
