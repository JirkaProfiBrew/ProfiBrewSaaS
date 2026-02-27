"use client";

import { RecipeCalculation } from "../RecipeCalculation";
import type { Recipe, RecipeItem } from "../../types";

interface CalculationTabProps {
  recipeId: string;
  recipe: Recipe | null;
  items: RecipeItem[];
  onMutate: () => void;
}

export function CalculationTab({ recipeId, recipe, items, onMutate }: CalculationTabProps): React.ReactNode {
  return (
    <RecipeCalculation
      recipeId={recipeId}
      recipe={recipe}
      items={items}
      onMutate={onMutate}
    />
  );
}
