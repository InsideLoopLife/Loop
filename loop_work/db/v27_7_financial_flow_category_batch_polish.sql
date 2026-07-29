-- v27.7 Financial Flow category polish
-- Adds optional category icons used in the dashboard and Financial Flow itemisation.

alter table public.spending_categories
  add column if not exists category_icon text;

update public.spending_categories
set category_icon = case
  when category_icon is not null and length(trim(category_icon)) > 0 then category_icon
  when lower(name) similar to '%(subscription|netflix|spotify|apple|phone|mobile)%' then '📱'
  when lower(name) similar to '%(mortgage|rent|home|house)%' then '🏠'
  when lower(name) similar to '%(utility|gas|electric|water|energy|council)%' then '⚡'
  when lower(name) similar to '%(car|fuel|transport|parking)%' then '🚗'
  when lower(name) similar to '%(child|nursery|school|activity)%' then '👶'
  when lower(name) similar to '%(food|grocery|shop|supermarket)%' then '🛒'
  when lower(name) similar to '%(insurance|cover|policy)%' then '🛡️'
  when lower(name) similar to '%(loan|debt|credit|card)%' then '💳'
  when lower(name) similar to '%(saving|investment|isa|pension)%' then '💰'
  else '🏷️'
end
where category_icon is null or length(trim(category_icon)) = 0;
