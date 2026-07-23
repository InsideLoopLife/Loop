-- V28.99: provider_fund_glossary base table.
-- NOTE: this was run directly via the Supabase SQL editor before being
-- added to the migration history here. Kept for reference/consistency with
-- the rest of db/. See v28_99b for the follow-up patch that adds the
-- columns/constraint/RLS/audit table this version was missing.

CREATE TABLE IF NOT EXISTS provider_fund_glossary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id TEXT NOT NULL,                  -- e.g. 'legal-and-general', 'aviva', 'scottish-widows'
  provider_name TEXT NOT NULL,                -- e.g. 'Legal & General'
  internal_fund_name TEXT NOT NULL,          -- e.g. 'L&G PMC Lazard Emerging Markets 3'
  internal_fund_code TEXT,                   -- e.g. '3624', 'CS8'
  underlying_isin TEXT,                       -- e.g. 'GB00B3X7QG63' (Link to real market price)
  group_label TEXT,                          -- e.g. 'Emerging Markets Equity'
  annual_fund_fee_percent NUMERIC(6,4),      -- e.g. 0.9400
  source_url TEXT,                           -- Link to provider factsheet
  last_fee_check_at TIMESTAMPTZ DEFAULT NOW(),-- For 90-day stale fee checks
  confidence INTEGER DEFAULT 100,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_glossary_provider_id ON provider_fund_glossary (provider_id);
CREATE INDEX IF NOT EXISTS idx_glossary_isin ON provider_fund_glossary (underlying_isin);
CREATE INDEX IF NOT EXISTS idx_glossary_stale_fees ON provider_fund_glossary (last_fee_check_at);

ALTER TABLE pension_funds
  ADD COLUMN IF NOT EXISTS underlying_isin TEXT,
  ADD COLUMN IF NOT EXISTS glossary_id UUID REFERENCES provider_fund_glossary(id);
