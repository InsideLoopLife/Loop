# LOOP Daily Rates & Deals Data — Research and Implementation Brief

## Purpose

Build a reliable daily data-refresh system for LOOP that runs at **08:00 Europe/London**, updates a shared catalogue of UK financial products, and makes the newest rates and opportunities available to users in the appropriate paid permission groups.

The research and implementation should cover all areas below.

---

## 1. Savings products

Research reliable UK sources for:

- Easy-access savings accounts
- Notice accounts
- Regular savers
- Fixed-term savings bonds
- Existing-customer-only savings products
- Local or postcode-restricted accounts
- Closed and off-sale savings accounts
- Business savings, if commercially sensible
- Offshore savings, if commercially sensible

Required product data should include:

- Provider
- Product name and code
- AER/gross rate
- Bonus rate and expiry
- Minimum and maximum deposit
- Access and withdrawal rules
- Notice period
- Term
- Interest payment frequency
- Existing-customer requirements
- Geographic restrictions
- Eligibility criteria
- FSCS status
- Launch, update and withdrawal dates
- Application URL
- Source and last-verified timestamp

---

## 2. Cash ISAs

Research sources and logic for:

- Easy-access Cash ISAs
- Fixed-rate Cash ISAs
- Notice Cash ISAs
- Regular saver ISAs
- Lifetime ISAs
- Junior ISAs
- Flexible versus non-flexible ISAs
- ISA transfer rules
- Current and future annual ISA allowances

Rules must be sourced from official GOV.UK/HMRC material and versioned by tax year.

---

## 3. Mortgages

Research reliable UK mortgage product sources for:

- Residential purchase
- Residential remortgage
- First-time buyer
- Product transfers
- Buy-to-let, if included
- Direct-only products
- Intermediary-only products
- Existing-customer products
- Fixed, tracker, discount and variable products

Required product data should include:

- Lender
- Product code
- Initial rate
- APRC
- SVR/reversion rate
- Deal period
- Maximum LTV
- Minimum and maximum loan
- Fees
- Cashback
- Free valuation/legal incentives
- Early repayment charges
- Overpayment allowance
- Portability
- Repayment and interest-only eligibility
- New-build criteria
- Shared ownership/shared equity criteria
- Green mortgage criteria
- Launch and withdrawal dates
- Direct/intermediary/exclusive status

---

## 4. Mortgage affordability and criteria

Separate:

### Illustrative LOOP affordability

An internal estimate based on:

- Household income
- Salary sacrifice
- Bonus, overtime and commission
- Self-employed income
- Benefits
- Maternity income
- Existing commitments
- Childcare
- Dependants
- Mortgage balance
- Property value
- LTV
- Remaining term
- Age at term end

This must be clearly labelled as illustrative.

### Lender-verified affordability

Research commercial providers such as:

- Mortgage Brain
- Twenty7tec
- Iress
- Direct lender APIs or broker partnerships

Do not describe a user as approved, eligible or guaranteed unless supported by a lender-level process.

---

## 5. Official economic reference data

Use official Bank of England sources for:

- Bank Rate
- SONIA
- Sterling OIS/yield curves
- Quoted mortgage rates
- Quoted savings rates
- Effective rates on new lending
- Effective rates on outstanding lending
- Household deposit rates

These should support market context and trend analysis, not replace live product feeds.

---

## 6. Provider verification and consumer protection

Research and map:

- FCA Financial Services Register
- PRA-regulated deposit takers
- FSCS protection
- Shared banking licences
- Legal entity versus consumer brand
- FCA reference number
- PRA status
- FSCS group and protection limit

LOOP should be able to warn users when balances across multiple brands share one FSCS protection limit.

---

## 7. Property and housing reference data

Research official sources for:

- HM Land Registry Price Paid Data
- UK House Price Index
- ONS house prices
- ONS rent data
- Regional earnings and inflation data
- EPC data
- Council tax data
- UPRN/address mapping where appropriate

Clarify where official market data ends and a commercial AVM would be required.

---

## 8. Source hierarchy

Proposed priority order:

1. Licensed canonical product feed
2. Direct provider product page or product guide
3. FCA/PRA/FSCS validation
4. GOV.UK/HMRC/Bank of England rules and reference data
5. Secondary comparison-site cross-check
6. Manual admin review

Investigate at minimum:

- Moneyfacts
- Defaqto
- Savings Data Ltd
- Mortgage Brain
- Twenty7tec
- Iress

For each vendor, establish:

- Product coverage
- Update frequency
- API/datafeed format
- Historical data availability
- Closed-product coverage
- Display rights
- Storage rights
- Personalisation rights
- Notification rights
- Attribution requirements
- Development/staging access
- Correction SLA
- Pricing model
- Contract exit and retained-history rights

---

## 9. Daily cron design

Run once daily at **08:00 Europe/London**.

Recommended sequence:

1. Fetch savings products
2. Fetch closed/off-sale savings products
3. Fetch Cash ISA products
4. Fetch residential mortgage products
5. Fetch buy-to-let products, if enabled
6. Fetch Bank of England reference data
7. Validate provider/legal-entity records
8. Normalise product fields
9. Compare with the previous snapshot
10. Record rate changes
11. Mark missing products as pending withdrawal
12. Recalculate user opportunities
13. Create notifications for eligible paid users
14. Log failures and exceptions
15. Produce an admin run report

Use one shared catalogue update, not one external data pull per user.

---

## 10. Product lifecycle and history

Use lifecycle states such as:

- ACTIVE
- PENDING_WITHDRAWAL
- WITHDRAWN
- SUPERSEDED
- MATURED
- DATA_REVIEW

Do not immediately delete a product after one missing observation.

Keep versioned history for:

- Rate changes
- Product terms
- Eligibility
- Fees
- Provider details
- First seen
- Last seen
- Effective from/to
- Source timestamps
- Verification status

---

## 11. User matching

### Savings matching

Consider:

- Current balance
- Current rate
- Tax band
- Remaining ISA allowance
- Required access
- Acceptable notice period
- Maximum lock-in
- Existing-customer eligibility
- Geographic eligibility
- Minimum deposit
- FSCS exposure
- Expected benefit after tax and fees

### Mortgage matching

Consider:

- Property value
- Mortgage balance
- LTV
- Fixed-rate expiry
- Remaining term
- Repayment type
- Household income
- Known commitments
- Purchase/remortgage status
- Required product features
- Fees versus interest savings

Until lender-level criteria are licensed, use wording such as:

> Potentially relevant products based on the information supplied.

---

## 12. Paid-tier permissions

Define tier logic for:

- Access to latest daily rates
- Full versus limited product lists
- Personalised comparisons
- Rate-watch alerts
- Mortgage renewal alerts
- Savings maturity alerts
- Historical charts
- Provider-change notifications
- Manual refresh permissions
- Admin overrides

The product data should be refreshed globally once, then filtered and presented according to the user’s entitlement.

---

## 13. Admin controls

Admin should be able to:

- Run each data job manually
- Run the complete daily refresh
- View provider success/failure
- View last successful update
- View products added, changed and withdrawn
- Review source conflicts
- Approve or reject uncertain mappings
- Inspect raw source payloads
- Reprocess failed products
- View database usage and history storage
- Configure data retention
- Configure notification thresholds
- Configure paid-tier entitlements
- Pause individual providers or data categories

---

## 14. Data provenance

Every product should store:

- Canonical source
- Source product ID
- Provider product code
- Source URL
- Source published timestamp
- First seen
- Last seen
- Last verified
- Effective from/to
- Confidence score
- Verification status
- Licence/version reference
- Raw payload hash

The system should preserve what was shown to a user on a given date.

---

## 15. Compliance and wording

Research the FCA perimeter around:

- Generic financial information
- Comparisons
- Personalised ranking
- Mortgage advice
- Financial promotions
- Lead generation
- Application links
- Broker referrals

The app should avoid statements such as:

- “You qualify”
- “You are approved”
- “This is the best mortgage for you”

unless supported by an authorised and lender-verified process.

---

## 16. Expected deliverables from the research

The final output should provide:

1. Recommended primary and backup source for each category
2. Source reliability assessment
3. Commercial/licensing considerations
4. Exact fields available from each source
5. Data update frequency
6. Historical-data availability
7. Closed-product coverage
8. Regulatory limitations
9. Proposed Supabase schema
10. Proposed cron architecture
11. Product normalisation and deduplication logic
12. Paid-tier permission model
13. Admin review workflow
14. Error handling and retry design
15. Estimated monthly infrastructure cost
16. Recommended MVP versus later-phase scope
17. Implementation plan with priorities
18. Test cases and acceptance criteria

---

## Key implementation principle

**Refresh the market data once each day, store it centrally, preserve history, and then calculate user-specific opportunities from that shared catalogue according to paid-tier permissions.**
