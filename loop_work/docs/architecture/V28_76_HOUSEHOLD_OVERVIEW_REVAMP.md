# V28.76 Household overview revamp

The household page now acts as a family cockpit rather than a permissions-first admin page.

## Structure

- `app/household/page.tsx` remains the server data loader and mutation host.
- `lib/household/household-overview-model.ts` builds the household overview model with no React or Supabase dependencies.
- `components/household/HouseholdOverviewDashboard.tsx` renders the dashboard from the model.

## Model fields

The overview model calculates:

- monthly household income
- monthly outgoings
- savings / investments / pension top-ups
- average cost per household profile
- cost-to-income ratio
- savings rate
- family optimisation score
- child and household savings pots
- spend-based annual carbon estimate
- next-best actions

## Carbon logic

The first version uses a spending-based carbon heuristic. This is deliberately labelled as low/medium confidence. Later integrations can write to `household_carbon_profiles` from a questionnaire, energy provider, travel data or WWF-style footprint source.

## Snapshot foundation

`household_overview_snapshots` can persist the computed monthly cockpit view once the worker/snapshot cadence is wired. For now the page computes live from current records.
