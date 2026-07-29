# v28.23 - spending, savings and investment accuracy polish

## Onboarding
- Moved the open-section CTA to the right of each onboarding card so expanded sub-checklists no longer push the primary button into the middle of the card.

## Spending
- Added a Quick categorise flow.
- Clicking a category pill or selected lines opens a modal category picker and applies the category via the existing server-side batch update action.

## Savings
- New savings accounts with a monthly top-up amount/day now create a linked planned outgoing item in Financial Flow.
- Updating/deleting the savings account refreshes/removes the linked planned item using a hidden linked-savings marker.

## Investments
- Fixed a GBX/LSE double-normalisation issue where an already-converted GBP price could be divided by 100 again.
- Holding cards now show original cost source: purchase lots, broker/imported cost, average buy price or missing.
- Quote search no longer pretends that a manual fallback is a market match. No-match results show Add to database / Continue manually.
- Add to database queues an investment coverage request for AI/admin enrichment.
- Admin > Investments now makes sync cadence and the Trading 212 direct correction layer clearer.

## Trading 212 note
SnapTrade can be enough for account/position import, but exact cash buckets, open P/L, original cost and dividend cash may need a direct Trading 212 API correction layer. The official Trading 212 API exposes account summary, positions, orders, dividends and transactions; this version queues that as the correct future route rather than inventing missing cost basis.

## SQL
Run after v28.22.2:

```sql
db/v28_23_spending_savings_investment_accuracy.sql
```
