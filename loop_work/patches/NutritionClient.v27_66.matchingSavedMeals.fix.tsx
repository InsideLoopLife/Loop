/**
 * Apply inside components/nutrition/NutritionClient.tsx, in RecipeForm before JSX returns.
 *
 * Fixes:
 * Runtime ReferenceError: matchingSavedMeals is not defined
 *
 * Reason:
 * JSX references matchingSavedMeals but it is not declared in the component scope.
 */

// 1) Make sure these existing values are the ones you actually use in this component:
// const savedMeals = ...
// const productQuery = ...
// const cardSearch = ...

// 2) Add this before the return of RecipeForm:
const matchingSavedMeals = React.useMemo(() => {
  const q = String(
    typeof productQuery !== "undefined" ? productQuery :
    typeof cardSearch !== "undefined" ? cardSearch :
    ""
  ).trim().toLowerCase();

  const list = Array.isArray(savedMeals) ? savedMeals : [];

  if (!q) return list.slice(0, 8);

  return list
    .filter((meal: any) => {
      const haystack = [
        meal?.label,
        meal?.title,
        meal?.name,
        meal?.brand_name,
        meal?.card_kind,
        meal?.source_url,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(q);
    })
    .slice(0, 8);
}, [savedMeals, productQuery, cardSearch]);

// 3) If productQuery/cardSearch may not exist in scope, define one safe search state instead:
// const [productQuery, setProductQuery] = React.useState("");
