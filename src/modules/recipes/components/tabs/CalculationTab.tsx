"use client";

import { RecipeCalculation } from "../RecipeCalculation";
import type { Recipe, RecipeItem, RecipeCalculationResult } from "../../types";

interface CalculationTabProps {
  recipeId: string;
  recipe: Recipe | null;
  items: RecipeItem[];
  liveCalcResult?: RecipeCalculationResult | null;
  onMutate: () => void;
}

export function CalculationTab({ recipeId, recipe, items, liveCalcResult, onMutate }: CalculationTabProps): React.ReactNode {
  return (
    <RecipeCalculation
      recipeId={recipeId}
      recipe={recipe}
      items={items}
      liveCalcResult={liveCalcResult}
      onMutate={onMutate}
    />
  );
}
