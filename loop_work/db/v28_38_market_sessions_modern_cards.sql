-- v28.38 market-session precision + modern investment cards
-- Keeps admin market venue open/close times aligned with the code-level timezone-aware session logic.
-- Safe to run multiple times.

do $$
begin
  if to_regclass('public.investment_market_venues') is not null then
    update public.investment_market_venues
      set open_time = '08:00'::time,
          close_time = '16:30'::time,
          updated_at = now()
      where upper(venue_code) in ('LSE','AIM','XLON');

    update public.investment_market_venues
      set open_time = '09:30'::time,
          close_time = '16:00'::time,
          updated_at = now()
      where upper(venue_code) in ('NASDAQ','NYSE','AMEX','ARCX','BATS','OTCM','PINX','XTSE','TSXV');

    update public.investment_market_venues
      set open_time = '09:00'::time,
          close_time = '17:30'::time,
          updated_at = now()
      where upper(venue_code) in ('XETR','XPAR','XAMS','XMIL','XSWX','XSTO','XCSE','XHEL','XOSL','XBRU','XLIS','XWBO','XWAR');

    update public.investment_market_venues
      set open_time = '08:00'::time,
          close_time = '22:00'::time,
          updated_at = now()
      where upper(venue_code) = 'XFRA';
  end if;
end $$;
