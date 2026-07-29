# V27.3 — Financial Flow polish

Run `db/v27_3_financial_flow_polish.sql` in Supabase before deploying this version.

Included changes:

- Spending page is renamed to **Financial Flow** in the main heading and household filter.
- Budget category monthly budget is optional. Blank budgets are stored as `null` and displayed as “No monthly budget”.
- Nursery estimates in the Spending / Financial Flow page now pass through Tax-Free Childcare settings, so the 20% top-up offset carries over from household child-cost setup.
- Timeline edit/delete actions are locked behind an **Edit lines** toggle. Viewing mode only shows the flow, person marker and amount.
- Outgoing amounts are red; income amounts are green.
- Account settings now control Financial Flow display:
  - person marker: image + name, image only, or name only;
  - date format: `1st Sept`, `1st of Sept`, `Sept 1st`, numeric, or ISO;
  - bill images on/off.
- Financial Flow can enrich missing recurring bill images. The button uses known-brand shortcuts first, then the saved OpenAI token with web search to infer an official domain. Logos render through a public favicon endpoint from the resolved domain.
- Planned items now support `brand_name`, `brand_domain`, `brand_logo_url`, `brand_logo_source`, and `brand_logo_checked_at`.

Notes:

- The bill image lookup does not upload bank data. It sends the planned bill label only, for example “Spotify” or “Barclays - Beth iPhone”.
- If no OpenAI token is saved, common brands still resolve from the built-in known-brand list. Unknown brands remain as initials until the token is configured.
