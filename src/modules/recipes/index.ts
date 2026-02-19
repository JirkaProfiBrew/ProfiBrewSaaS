/**
 * Recipes module — public API.
 * Re-exports types, config, and components for use by other modules.
 */
export { RecipeBrowser } from "./components/RecipeBrowser";
export { RecipeDetail } from "./components/RecipeDetail";
export type {
  Recipe,
  RecipeItem,
  RecipeStep,
  RecipeStatus,
  BeerStyle,
  MashingProfile,
  RecipeDetailData,
} from "./types";
