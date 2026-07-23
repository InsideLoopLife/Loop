-- V28.99b: patches the provider_fund_glossary table you already created to
-- match what the app code actually reads/writes, without touching your
-- existing rows or the columns you already added to pension_funds.

-- 1. Missing columns the JIT search route and ISIN backfill depend on.
ALTER TABLE provider_fund_glossary
  ADD COLUMN IF NOT EXISTS unit_price NUMERIC(18,8),
  ADD COLUMN IF NOT EXISTS unit_price_quote_unit TEXT DEFAULT 'gbp',
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS last_isin_check_at TIMESTAMPTZ;

-- 2. Unique constraint required by the upsert in saveDiscoveredFundsToDb
--    (onConflict: "provider_id,internal_fund_name"). Postgres has no
--    "ADD CONSTRAINT IF NOT EXISTS", so guard it manually.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'provider_fund_glossary_provider_fund_unique'
  ) THEN
    ALTER TABLE provider_fund_glossary
      ADD CONSTRAINT provider_fund_glossary_provider_fund_unique
      UNIQUE (provider_id, internal_fund_name);
  END IF;
END $$;

-- 3. Row Level Security was not enabled on your CREATE TABLE. This opens
--    read access to authenticated users only; all writes still go through
--    the server-side admin client (route/cron), which bypasses RLS anyway.
ALTER TABLE provider_fund_glossary ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Authenticated users can read provider fund glossary jit" ON provider_fund_glossary;
CREATE POLICY "Authenticated users can read provider fund glossary jit"
ON provider_fund_glossary FOR SELECT
TO authenticated
USING (true);

-- 4. Audit trail for automated fee changes (doesn't exist yet since you ran
--    your own create-table script instead of the original migration).
CREATE TABLE IF NOT EXISTS provider_fund_fee_change_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  glossary_id UUID REFERENCES provider_fund_glossary(id) ON DELETE CASCADE,
  fund_name TEXT,
  previous_fee_percent NUMERIC(10,6),
  proposed_fee_percent NUMERIC(10,6),
  applied BOOLEAN NOT NULL DEFAULT false,
  reason TEXT,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE provider_fund_fee_change_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can read fee change log" ON provider_fund_fee_change_log;
CREATE POLICY "Admins can read fee change log"
ON provider_fund_fee_change_log FOR SELECT
TO authenticated
USING (false);
-- Locked down by default; the admin client bypasses RLS. Loosen this later
-- if you build an admin UI to review the log.
