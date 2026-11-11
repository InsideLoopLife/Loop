-- When repayments actually began. The term runs from here, and it can be
-- months after the mortgage was agreed (a remortgage that took six months).
alter table public.home_mortgage_deals add column if not exists first_payment_date date;
