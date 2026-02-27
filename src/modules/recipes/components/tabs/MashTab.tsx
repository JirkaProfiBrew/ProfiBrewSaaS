"use client";

import { RecipeStepsTab } from "../RecipeStepsTab";
import type { RecipeStep } from "../../types";

interface MashTabProps {
  recipeId: string;
  steps: RecipeStep[];
  onMutate: () => void;
}

export function MashTab({ recipeId, steps, onMutate }: MashTabProps): React.ReactNode {
  return <RecipeStepsTab recipeId={recipeId} steps={steps} onMutate={onMutate} />;
}
