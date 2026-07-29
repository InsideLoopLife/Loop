# v28.97 · Compact guidance and registration-first vehicles

- `Adopt` on food guidance now saves only the food assumption; it no longer opens footprint settings.
- Household guidance is collapsed by default and shows compact range lines when opened.
- Selecting a guidance line opens its evidence, range and assumptions in a focused modal.
- People in the Family timeline link directly to their editable household profile.
- Adult household profiles create vehicle-verification slots. These are prompts, not claims of ownership; registrations confirm the vehicles.
- Vehicle entry starts with a UK registration lookup. When `DVLA_API_KEY` is configured, DVLA data prefills available make/fuel details.
- Annual mileage and real-world MPG remain manual confirmation fields because registration data does not reliably provide household driving activity or real-world efficiency.
- The existing v28.96 migration is idempotently extended with `registration` and `owner_person_id`; rerun `202607171800_household_carbon_vehicles.sql`.
