-- A holding that stops trading (delisted, wound up) is archived once the
-- person confirms it, and the money they put in is kept as a one-off loss.
alter table public.investment_holdings
  add column if not exists written_off_at timestamptz,
  add column if not exists written_off_loss_gbp numeric;
