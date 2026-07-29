# v28.44 — Jobs, school calendar imports, savings owner UI and product URL batches

## User account
- Adds Account → Jobs & leave.
- Saves employment/job facts used by income and family planning.
- Supports optional contract/offer-letter upload as digest-first metadata.
- Defaults to structured data + digest rather than storing original documents.

## Savings
- Moves delete into the owner/visibility menu.
- Top-right owner avatar/initial is now the ownership action.
- Adds a provider-logo catalogue seed for savings brands such as Nationwide, Chip, Revolut, Plum and Zopa.

## Lifestyle family planner
- Adds school/nursery URL + pasted text + file evidence import.
- Deterministically parses UK-style term-date text where possible.
- Generates reviewable school holiday, inset day and bank holiday periods.
- No background AI/web-search worker is used.

## Admin product imports
- Adds URL product import batches.
- Stages URLs and promotes only ten at a time.
- Skips products already in the product library by source URL.
- Keeps category/site crawling approval-based to avoid runaway cost.
