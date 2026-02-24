"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

import { getRecipesByItemId } from "@/modules/recipes/actions";

interface ItemRecipesTabProps {
  itemId: string;
}

export function ItemRecipesTab({ itemId }: ItemRecipesTabProps): React.ReactNode {
  const t = useTranslations("items");
  const router = useRouter();

  const [recipes, setRecipes] = useState<Array<{
    id: string;
    name: string;
    beerStyleName?: string | null;
    batchSizeL: string | null;
    og: string | null;
    ibu: string | null;
    status: string;
  }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    getRecipesByItemId(itemId)
      .then((data) => {
        if (!cancelled) {
          setRecipes(data);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        console.error("Failed to load recipes:", err);
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [itemId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        ...
      </div>
    );
  }

  if (recipes.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        {t("productionTabs.recipesEmpty")}
      </div>
    );
  }

  const statusVariant = (status: string): "default" | "secondary" | "outline" => {
    if (status === "active") return "default";
    if (status === "archived") return "outline";
    return "secondary";
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("productionTabs.recipeName")}</TableHead>
          <TableHead>{t("productionTabs.recipeStyle")}</TableHead>
          <TableHead className="text-right">{t("productionTabs.recipeVolume")}</TableHead>
          <TableHead className="text-right">{t("productionTabs.recipeOG")}</TableHead>
          <TableHead className="text-right">{t("productionTabs.recipeIBU")}</TableHead>
          <TableHead>{t("productionTabs.recipeStatus")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {recipes.map((r) => (
          <TableRow
            key={r.id}
            className="cursor-pointer"
            onClick={() => router.push(`/brewery/recipes/${r.id}`)}
          >
            <TableCell className="font-medium">{r.name}</TableCell>
            <TableCell>{r.beerStyleName ?? "-"}</TableCell>
            <TableCell className="text-right tabular-nums">
              {r.batchSizeL ? `${r.batchSizeL} L` : "-"}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {r.og ?? "-"}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {r.ibu ?? "-"}
            </TableCell>
            <TableCell>
              <Badge variant={statusVariant(r.status)}>
                {r.status}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
