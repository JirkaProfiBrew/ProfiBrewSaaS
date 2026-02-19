"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { getRecipeIngredients } from "../actions";
import type { RecipeIngredient } from "../types";

// ── Category color mapping ────────────────────────────────────

const CATEGORY_CLASS_MAP: Record<string, string> = {
  malt: "bg-amber-100 text-amber-800 border-amber-300",
  hop: "bg-green-100 text-green-800 border-green-300",
  yeast: "bg-yellow-100 text-yellow-800 border-yellow-300",
  adjunct: "bg-purple-100 text-purple-800 border-purple-300",
  other: "bg-gray-100 text-gray-800 border-gray-300",
};

/** Format amount as a number. */
function formatAmount(amountG: string): string {
  const val = parseFloat(amountG);
  if (isNaN(val)) return amountG;
  return val.toLocaleString("cs-CZ", { maximumFractionDigits: 2 });
}

// ── Component ──────────────────────────────────────────────────

interface BatchIngredientsTabProps {
  recipeId: string | null;
}

export function BatchIngredientsTab({
  recipeId,
}: BatchIngredientsTabProps): React.ReactNode {
  const t = useTranslations("batches");
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!recipeId) return;

    let cancelled = false;
    setIsLoading(true);

    getRecipeIngredients(recipeId)
      .then((result) => {
        if (!cancelled) {
          setIngredients(result);
          setIsLoading(false);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          console.error("Failed to load recipe ingredients:", error);
          setIsLoading(false);
        }
      });

    return (): void => {
      cancelled = true;
    };
  }, [recipeId]);

  if (!recipeId) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        {t("ingredients.noRecipe")}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        {t("ingredients.loading")}
      </div>
    );
  }

  if (ingredients.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        {t("ingredients.empty")}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        {t("ingredients.description")}
      </p>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("ingredients.columns.name")}</TableHead>
            <TableHead>{t("ingredients.columns.category")}</TableHead>
            <TableHead>{t("ingredients.columns.amount")}</TableHead>
            <TableHead>{t("ingredients.columns.unit")}</TableHead>
            <TableHead>{t("ingredients.columns.stage")}</TableHead>
            <TableHead>{t("ingredients.columns.time")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ingredients.map((item) => {
            const categoryClass =
              CATEGORY_CLASS_MAP[item.category] ?? CATEGORY_CLASS_MAP.other;
            return (
              <TableRow key={item.id}>
                <TableCell className="font-medium">
                  {item.itemName}
                  {item.itemCode && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      ({item.itemCode})
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={categoryClass}>
                    {t(`ingredients.category.${item.category}` as Parameters<typeof t>[0])}
                  </Badge>
                </TableCell>
                <TableCell>{formatAmount(item.amountG)}</TableCell>
                <TableCell>{item.unitSymbol ?? "g"}</TableCell>
                <TableCell>
                  {item.useStage
                    ? t(`ingredients.stage.${item.useStage}` as Parameters<typeof t>[0])
                    : "-"}
                </TableCell>
                <TableCell>
                  {item.useTimeMin ? `${item.useTimeMin} min` : "-"}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
