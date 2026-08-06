-- The contribution-thread migration originally added an external transaction
-- index that duplicated the established pension_contribution_events_external_tx_uidx.
drop index if exists public.pension_contribution_events_external_tx_unique;
