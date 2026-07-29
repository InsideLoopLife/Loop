# LOOP v27.90 Household/Admin/Spending/Tier consolidation

Run `db/v27_90_household_admin_spending_tier_consolidation.sql` after deployment.

## Fixes
- Restores Admin tab visibility, including Products and Investment coverage.
- Makes admin tier RPC resilient and seeds SnapTrade/realtime plan feature.
- Repairs household linked-user name/avatar dedupe so a claimed account appears once by profile name.
- Spending and House now read from household owner data when the signed-in user is a claimed household member.
- Spending child-cost and student-loan sections now appear only when relevant data/profile context exists.
- All `max-w-7xl` pages are globally widened toward the 2000px shell.
- House affordability now uses tracked Savings balances for emergency-fund proxy where available and detects dual-income/maternity lines more accurately.
- Investments page adds a SnapTrade connect CTA where the user tier/provider state allows it.
