alter table public.home_mortgage_deals add column if not exists payment_day_of_month smallint check (payment_day_of_month between 1 and 31);
comment on column public.home_mortgage_deals.payment_day_of_month is 'Day the monthly payment leaves the account. Used to put mortgage payments on the calendar; falls back to the start date day.';
