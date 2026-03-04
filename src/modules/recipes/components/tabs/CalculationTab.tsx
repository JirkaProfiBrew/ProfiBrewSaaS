"use client";

import { RecipeCalculation } from "../RecipeCalculation";
import type { Recipe, RecipeItem, RecipeCalculationResult } from "../../types";

interface CalculationTabProps {
  recipeId: string;
  recipe: Recipe | null;
  items: RecipeItem[];
  liveCalcResult?: RecipeCalculationResult | null;
  targetOg: number;
  targetFg: number;
  targetIbu: number;
  targetEbc: number;
  onMutate: () => void;
}

export function CalculationTab({ recipeId, recipe, items, liveCalcResult, targetOg, targetFg, targetIbu, targetEbc, onMutate }: CalculationTabProps): React.ReactNode {
  return (
    <RecipeCalculation
      recipeId={recipeId}
      recipe={recipe}
      items={items}
      liveCalcResult={liveCalcResult}
      targetOg={targetOg}
      targetFg={targetFg}
      targetIbu={targetIbu}
      targetEbc={targetEbc}
      onMutate={onMutate}
    />
  );
}
