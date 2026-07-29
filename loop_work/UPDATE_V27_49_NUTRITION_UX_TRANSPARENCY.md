# v27.49 — Nutrition UX + product transparency hotfix

This update responds to the latest localhost review.

## Main changes

- Food log modal is simplified: it starts with only the Quick Search / Ask AI area.
- Date, time, serving, person allocation and meal slot now appear only after a saved card/product/AI entry is selected or built.
- Saved cards now appear as realtime matches while typing in the main search bar rather than as a separate always-visible dropdown.
- Product detail pages now show a product subtype badge such as `Drink product`, `Food product`, `Supplement`, or `Ingredient`.
- Product cards no longer present a meaningless cooking/product-use method panel; it is now a Product details panel.
- Nutrition label facts now feed the macro/micro snapshot even when the DB scalar columns are still empty.
- Nutrition facts/supplement facts no longer get ingredient-info star buttons.
- Real ingredients inside meals/products get an `Info` link to the ingredient intelligence page.
- Allergens are inferred from ingredient text as a fallback, so obvious dairy, egg, gluten, nuts, sesame, soy and fish/shellfish signals are surfaced even if the AI did not set allergen_flags.
- Household person avatars are included on the card quick-log buttons for consistency.

## No migration needed

This is a frontend/data-normalisation hotfix only.

## Test checklist

1. Open Log food / drink.
2. Confirm only Quick Search / Ask AI and a starter message appear initially.
3. Type `GFuel` and confirm saved products appear in realtime.
4. Select GFuel and confirm the detailed logging controls appear.
5. Open the GFuel product card and confirm macro/micro snapshot shows label-derived values such as 5 kcal, 2g carbs, 80mg sodium and 140mg caffeine.
6. Confirm nutrition/supplement rows do not show star/info buttons.
7. Open the scrambled eggs card and confirm real ingredients such as cheese, ZOE Daily 30+, oil etc show Info links.
8. Confirm allergens include inferred obvious allergens where present.
