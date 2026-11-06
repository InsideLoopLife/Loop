alter table public.pay_events add column if not exists tax_region text not null default 'rUK' check (tax_region in ('rUK','scotland'));
comment on column public.pay_events.tax_region is 'Income tax rules for this pay: rUK (England, Wales, NI) or scotland (Scottish rate bands). NI and student loans are UK-wide.';
