# LoopHealth scoring logic

The live code for processed load and gut-health scoring lives in:

- `lib/nutrition/scoring.ts`
  - `scoreProcessedFood(...)`
  - `scoreGutHealth(...)`
  - `nutritionBalanceRecommendations(...)`
  - `scoreMeal(...)`

## Processed load: current logic

Processed load is not a simple calorie score. It weighs processing signals and nutrient context:

- explicit processing level: `low`, `medium`, `high`, `unknown`
- additive/manufacturing markers: emulsifiers, stabilisers, preservatives, colours, flavourings, sweeteners, maltodextrin, anti-caking agents
- energy drink / powder markers: G Fuel, energy powder, caffeine, taurine, L-tyrosine, L-theanine, glucuronolactone, citrulline, carnitine, focus/energy complex
- restaurant/commercial/takeaway markers
- pastry/fast-food/processed-meat markers
- salt, added sugar, saturated fat, trans fat, energy density, caffeine
- fibre/protein reduce the score slightly where they add nutritional balance

Important correction in v27.31: zero/low calorie no longer means low processed load. A zero-sugar powdered drink can still score as highly processed if it has caffeine, sweeteners, colours, flavourings or functional blends.

## Gut health: current logic

Gut-health score weighs:

- total fibre
- soluble fibre
- potassium, magnesium, calcium
- plant/legume/wholegrain/fermented-food signals
- added sugar, saturated fat, salt and high glycemic load as pressure
- processed/fast-food/pastry/processed-meat pressure
- energy drink / powder / artificial sweetener / colour / stimulant pressure

This should be refined further with user profile context, bowel/gut symptoms, tolerated foods, weekly trend history and Apple Health/body data when available.
