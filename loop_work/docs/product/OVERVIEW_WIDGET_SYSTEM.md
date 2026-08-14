# LOOP Overview widget system

## Product principle

The Overview page is the canvas. It must not place the editable grid inside a second decorative container. Every widget is a view onto LOOP's canonical financial data, not a miniature standalone feature with duplicate calculations.

The system has two independent inputs:

1. **Available space** is measured in pixels. It selects summary, standard, detailed or immersive presentation automatically.
2. **User preference** selects content and appearance: what to emphasise, whether to show a breakdown or projection, and visual treatment.

Responsive state is never stored. A phone, tablet and desktop can therefore render the same widget preference appropriately without fighting one another.

## Adaptive contract

| Mode | Typical result | Required behaviour |
|---|---|---|
| Summary | Narrow or short | Primary value only; status remains available to assistive technology |
| Standard | Normal card | Value, movement and one useful comparison |
| Detailed | Wide or tall | Breakdown, assumptions and supporting measures |
| Immersive | Wide and tall | Interactive history, current position and an appropriate forecast |

Automatic time horizons should use the physical display as well as widget size. For an immersive wealth widget, desktop defaults to six prior and six projected months; mobile defaults to previous/current/next month. An explicit 3/6/12-month preference can override the default horizon without overriding layout.

## Widget depth

| Widget | Summary | Detailed / immersive | Important settings |
|---|---|---|---|
| Net worth | Current value | Assets, liabilities, actual history and planned-surplus projection | Breakdown, projection, horizon, chart style |
| Pension | Pot value | Contributions, growth assumption, provider/fund mix, retirement-income view | Pot vs income, growth, fees, retirement age |
| Investments | Portfolio value | History, contributions, accounts/providers, allocation, movers and data freshness | Return basis, chart period, account filter; forecast off by default |
| Calendar | Selected month | 3/6/12-month outlook, income, commitments and money left | Seasonal/flat/bars, emphasised metric |
| Cashflow | Money left | Income-to-spend/saving/investing flow and upcoming pressure | Period, Sankey/bars, transfers treatment |
| Spending | Period total | Category/person/merchant breakdown, recurring vs discretionary | Period, scope, grouping, excluded transfers |
| Income | Period total | Sources, gross/net, certainty and forthcoming changes | Gross/net, source scope, irregular income |
| Savings | Current saved | Pot progress, deposits/withdrawals/interest and goal forecast | Goal, target date, included accounts |

## Missing high-value widgets

### Foundation

- **Available money**: safe-to-spend after committed bills and targets, distinct from bank balance.
- **Savings and pots**: goal progress with withdrawn, interest and saved as separate series.
- **Home and mortgage**: equity, rate, payment, remaining term and renewal countdown.
- **Debt payoff**: balances, interest cost, minimums and snowball/avalanche scenarios.
- **Accounts and data health**: provider sync status, stale data and coverage gaps.

### Planning

- **Retirement readiness**: projected income, gap to desired lifestyle and contribution levers. This should complement—not duplicate—the Pension widget.
- **Emergency runway**: essential-spend months covered and accessible cash.
- **Goals**: deposit, holiday, education or major purchase progress with confidence and next action.
- **Upcoming pressure**: unusually expensive months, renewals, tax payments, school/childcare changes and one-offs.
- **Allowances**: ISA and pension allowance usage, with tax-year countdown and clear eligibility caveats.

### Intelligence and household

- **What changed?**: the few material movements since the previous visit, with traceable explanations.
- **Household contribution**: who is funding or carrying which commitments without turning finances into a leaderboard.
- **Opportunities**: actionable fee, interest-rate or contract savings with confidence and expiry.
- **Watchlist**: user-defined thresholds such as cash below a floor, spending above plan or an account becoming stale.

## Preferences across LOOP

Use three layers, resolved in this order:

1. Platform defaults owned by product design.
2. A user-level default per widget type (for example, every calendar uses the flat style).
3. An instance override stored with the widget (for example, this calendar uses seasonal styling).

The current implementation stores validated instance preferences in `user_dashboard_widgets.config`, so they already follow the signed-in user across devices. The next platform step is a small `user_widget_preferences` table keyed by `user_id` and `widget_type`, containing a versioned JSONB preference object. That enables “Use for all Calendar widgets” and lets the same widget render consistently in Overview, Wealth, House and future surfaces.

Do not put presentation measurements, breakpoints or derived density into either table. Keep those local to the client. Persist semantic preferences only, validate them at the API boundary, and merge new default fields during schema-version upgrades.

## Data and trust rules

- Historical lines use recorded snapshots only; never fabricate a smooth past when history is missing.
- Projections are visually distinct, labelled as projected and show the assumption that drives them.
- Market forecasts are opt-in. Planned cashflow and pension scenarios may be on by default because their assumptions are visible and adjustable.
- Hover/focus reveals exact values; charts do not show permanent dots.
- Cached data renders immediately, freshness is visible where relevant, and refresh happens in the background.
- Member/household scope must be explicit and enforced by row-level security, not only hidden in the interface.

## Recommended delivery order

1. Finish adaptive Net Worth, Pension, Investments and Calendar with real data and accessible charts.
2. Add Savings/Pots, Available Money and Home/Mortgage.
3. Add user-level widget defaults and reuse the renderer on other LOOP surfaces.
4. Add Goals, Retirement Readiness, Upcoming Pressure and Data Health.
5. Instrument resize, settings and removal behaviour so defaults are informed by observed use without collecting sensitive values.
