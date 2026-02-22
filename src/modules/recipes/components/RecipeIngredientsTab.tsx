"use client";

import { useState, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Trash2, ChevronUp, ChevronDown, Plus, Pencil } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { RecipeItem } from "../types";
import {
  addRecipeItem,
  updateRecipeItem,
  removeRecipeItem,
  reorderRecipeItems,
} from "../actions";
import { useBrewMaterialItems } from "../hooks";
import { useUnits } from "@/modules/units/hooks";

// ── Props ──────────────────────────────────────────────────────

interface RecipeIngredientsTabProps {
  recipeId: string;
  items: RecipeItem[];
  onMutate: () => void;
}

// ── Helpers ────────────────────────────────────────────────────

const INGREDIENT_CATEGORIES = ["malt", "hop", "yeast", "adjunct", "other"] as const;
const USE_STAGES = ["mash", "boil", "whirlpool", "fermentation", "dry_hop"] as const;

function formatAmount(amountG: string): string {
  const val = parseFloat(amountG);
  if (isNaN(val)) return amountG;
  return val.toLocaleString("cs-CZ", { maximumFractionDigits: 2 });
}

function sumByCategory(recipeItems: RecipeItem[], category: string): number {
  return recipeItems
    .filter((i) => i.category === category)
    .reduce((sum, i) => sum + (parseFloat(i.amountG) || 0), 0);
}

// ── Component ──────────────────────────────────────────────────

export function RecipeIngredientsTab({
  recipeId,
  items,
  onMutate,
}: RecipeIngredientsTabProps): React.ReactNode {
  const t = useTranslations("recipes");
  const tCommon = useTranslations("common");

  const { data: brewMaterialItems } = useBrewMaterialItems();
  const { units: allUnits } = useUnits();

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"add" | "edit">("add");
  const [editingRecipeItemId, setEditingRecipeItemId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state (shared for add/edit)
  const [newItemId, setNewItemId] = useState("");
  const [newCategory, setNewCategory] = useState<string>("malt");
  const [newAmountG, setNewAmountG] = useState("");
  const [newUseStage, setNewUseStage] = useState<string>("");
  const [newUseTimeMin, setNewUseTimeMin] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [newUnitId, setNewUnitId] = useState("");

  // Compute the unit symbol based on selected unit
  const selectedUnitSymbol = useMemo((): string => {
    if (!newUnitId) return "g";
    const unit = allUnits.find((u) => u.id === newUnitId);
    return unit?.symbol ?? "g";
  }, [newUnitId, allUnits]);

  const amountLabel = useMemo(
    (): string => `${t("ingredients.amount")} (${selectedUnitSymbol})`,
    [t, selectedUnitSymbol]
  );

  const resetForm = useCallback((): void => {
    setNewItemId("");
    setNewCategory("malt");
    setNewAmountG("");
    setNewUseStage("");
    setNewUseTimeMin("");
    setNewNotes("");
    setNewUnitId("");
    setEditingRecipeItemId(null);
    setDialogMode("add");
  }, []);

  const handleItemSelect = useCallback(
    (itemId: string): void => {
      setNewItemId(itemId);
      // Auto-set category based on item's materialType
      const selected = brewMaterialItems.find((i) => i.id === itemId);
      if (selected?.materialType) {
        const typeMap: Record<string, string> = {
          malt: "malt",
          hop: "hop",
          yeast: "yeast",
          adjunct: "adjunct",
        };
        const mapped = typeMap[selected.materialType];
        if (mapped) setNewCategory(mapped);
      }
      // Auto-set unit: prefer recipeUnitId (for hops), fallback to unitId
      if (selected) {
        const defaultUnitId = selected.recipeUnitId ?? selected.unitId;
        setNewUnitId(defaultUnitId ?? "");
      }
    },
    [brewMaterialItems]
  );

  // Open add dialog
  const openAddDialog = useCallback((): void => {
    resetForm();
    setDialogMode("add");
    setDialogOpen(true);
  }, [resetForm]);

  // Open edit dialog with pre-populated values
  const openEditDialog = useCallback(
    (item: RecipeItem): void => {
      setDialogMode("edit");
      setEditingRecipeItemId(item.id);
      setNewItemId(item.itemId);
      setNewCategory(item.category);
      setNewAmountG(item.amountG);
      setNewUseStage(item.useStage ?? "");
      setNewUseTimeMin(item.useTimeMin != null ? String(item.useTimeMin) : "");
      setNewNotes(item.notes ?? "");
      setNewUnitId(item.unitId ?? "");
      setDialogOpen(true);
    },
    []
  );

  const handleAdd = useCallback(async (): Promise<void> => {
    if (!newItemId || !newAmountG.trim()) {
      toast.error(tCommon("validation.required"));
      return;
    }

    setIsSubmitting(true);
    try {
      await addRecipeItem(recipeId, {
        itemId: newItemId,
        category: newCategory,
        amountG: newAmountG,
        unitId: newUnitId || null,
        useStage: newUseStage || null,
        useTimeMin: newUseTimeMin ? Number(newUseTimeMin) : null,
        notes: newNotes || null,
      });
      toast.success(tCommon("saved"));
      resetForm();
      setDialogOpen(false);
      onMutate();
    } catch (error: unknown) {
      console.error("Failed to add recipe item:", error);
      const msg = error instanceof Error ? error.message : String(error);
      toast.error(`${tCommon("saveFailed")}: ${msg}`);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    recipeId,
    newItemId,
    newCategory,
    newAmountG,
    newUnitId,
    newUseStage,
    newUseTimeMin,
    newNotes,
    tCommon,
    resetForm,
    onMutate,
  ]);

  const handleEditSave = useCallback(async (): Promise<void> => {
    if (!editingRecipeItemId || !newAmountG.trim()) {
      toast.error(tCommon("validation.required"));
      return;
    }

    setIsSubmitting(true);
    try {
      await updateRecipeItem(editingRecipeItemId, {
        category: newCategory,
        amountG: newAmountG,
        unitId: newUnitId || null,
        useStage: newUseStage || null,
        useTimeMin: newUseTimeMin ? Number(newUseTimeMin) : null,
        notes: newNotes || null,
      });
      toast.success(tCommon("saved"));
      resetForm();
      setDialogOpen(false);
      onMutate();
    } catch (error: unknown) {
      console.error("Failed to update recipe item:", error);
      toast.error(tCommon("saveFailed"));
    } finally {
      setIsSubmitting(false);
    }
  }, [
    editingRecipeItemId,
    newCategory,
    newAmountG,
    newUnitId,
    newUseStage,
    newUseTimeMin,
    newNotes,
    tCommon,
    resetForm,
    onMutate,
  ]);

  const handleDialogSave = useCallback((): void => {
    if (dialogMode === "edit") {
      void handleEditSave();
    } else {
      void handleAdd();
    }
  }, [dialogMode, handleEditSave, handleAdd]);

  const handleRemove = useCallback(
    async (itemId: string): Promise<void> => {
      try {
        await removeRecipeItem(itemId);
        toast.success(tCommon("saved"));
        onMutate();
      } catch (error: unknown) {
        console.error("Failed to remove recipe item:", error);
        toast.error(tCommon("saveFailed"));
      }
    },
    [tCommon, onMutate]
  );

  const handleMoveUp = useCallback(
    async (index: number): Promise<void> => {
      if (index <= 0) return;
      const newOrder = [...items.map((i) => i.id)];
      const id = newOrder[index];
      const prevId = newOrder[index - 1];
      if (!id || !prevId) return;
      newOrder[index] = prevId;
      newOrder[index - 1] = id;
      try {
        await reorderRecipeItems(recipeId, newOrder);
        onMutate();
      } catch (error: unknown) {
        console.error("Failed to reorder items:", error);
      }
    },
    [items, recipeId, onMutate]
  );

  const handleMoveDown = useCallback(
    async (index: number): Promise<void> => {
      if (index >= items.length - 1) return;
      const newOrder = [...items.map((i) => i.id)];
      const id = newOrder[index];
      const nextId = newOrder[index + 1];
      if (!id || !nextId) return;
      newOrder[index] = nextId;
      newOrder[index + 1] = id;
      try {
        await reorderRecipeItems(recipeId, newOrder);
        onMutate();
      } catch (error: unknown) {
        console.error("Failed to reorder items:", error);
      }
    },
    [items, recipeId, onMutate]
  );

  // Category label map
  const categoryLabels: Record<string, string> = {
    malt: t("ingredients.categories.malt"),
    hop: t("ingredients.categories.hop"),
    yeast: t("ingredients.categories.yeast"),
    adjunct: t("ingredients.categories.adjunct"),
    other: t("ingredients.categories.other"),
  };

  const stageLabels: Record<string, string> = {
    mash: t("ingredients.stages.mash"),
    boil: t("ingredients.stages.boil"),
    whirlpool: t("ingredients.stages.whirlpool"),
    fermentation: t("ingredients.stages.fermentation"),
    dry_hop: t("ingredients.stages.dry_hop"),
  };

  const totalMaltG = sumByCategory(items, "malt") + sumByCategory(items, "adjunct");
  const totalHopG = sumByCategory(items, "hop");

  // Item name for display in edit mode
  const editingItemName = useMemo((): string => {
    if (dialogMode !== "edit" || !newItemId) return "";
    const item = brewMaterialItems.find((i) => i.id === newItemId);
    return item ? `${item.name} (${item.code})` : "";
  }, [dialogMode, newItemId, brewMaterialItems]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{t("tabs.ingredients")}</h3>
        <Button size="sm" onClick={openAddDialog}>
          <Plus className="mr-1 size-4" />
          {t("ingredients.add")}
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">#</TableHead>
            <TableHead>{t("ingredients.item")}</TableHead>
            <TableHead>{t("ingredients.category")}</TableHead>
            <TableHead className="text-right">
              {t("ingredients.amount")}
            </TableHead>
            <TableHead>{t("ingredients.unit")}</TableHead>
            <TableHead>{t("ingredients.stage")}</TableHead>
            <TableHead className="text-right">
              {t("ingredients.time")}
            </TableHead>
            <TableHead>{t("ingredients.notes")}</TableHead>
            <TableHead className="w-28" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length === 0 ? (
            <TableRow>
              <TableCell colSpan={9} className="text-center text-muted-foreground">
                {t("ingredients.empty")}
              </TableCell>
            </TableRow>
          ) : (
            items.map((item, idx) => (
              <TableRow key={item.id}>
                <TableCell className="text-muted-foreground">
                  {idx + 1}
                </TableCell>
                <TableCell className="font-medium">
                  {item.itemName ?? item.itemId}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">
                    {categoryLabels[item.category] ?? item.category}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {formatAmount(item.amountG)}
                </TableCell>
                <TableCell>
                  {item.unitSymbol ?? "g"}
                </TableCell>
                <TableCell>
                  {item.useStage ? (
                    <Badge variant="outline">
                      {stageLabels[item.useStage] ?? item.useStage}
                    </Badge>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {item.useTimeMin != null ? `${item.useTimeMin} min` : "—"}
                </TableCell>
                <TableCell className="max-w-[200px] truncate text-muted-foreground">
                  {item.notes ?? "—"}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEditDialog(item)}
                      title={t("ingredients.dialog.editTitle")}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={idx === 0}
                      onClick={() => {
                        void handleMoveUp(idx);
                      }}
                    >
                      <ChevronUp className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={idx === items.length - 1}
                      onClick={() => {
                        void handleMoveDown(idx);
                      }}
                    >
                      <ChevronDown className="size-4" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{tCommon("confirmDelete")}</AlertDialogTitle>
                          <AlertDialogDescription>{tCommon("confirmDeleteDescription")}</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => {
                              void handleRemove(item.id);
                            }}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            {tCommon("delete")}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
        {items.length > 0 && (
          <TableFooter>
            <TableRow>
              <TableCell colSpan={3} className="font-medium">
                {t("ingredients.totalMalt")}
              </TableCell>
              <TableCell className="text-right font-medium">
                {totalMaltG.toLocaleString("cs-CZ", { maximumFractionDigits: 2 })}
              </TableCell>
              <TableCell>{"\u2014"}</TableCell>
              <TableCell colSpan={4} />
            </TableRow>
            <TableRow>
              <TableCell colSpan={3} className="font-medium">
                {t("ingredients.totalHops")}
              </TableCell>
              <TableCell className="text-right font-medium">
                {totalHopG.toLocaleString("cs-CZ", { maximumFractionDigits: 2 })}
              </TableCell>
              <TableCell>{"\u2014"}</TableCell>
              <TableCell colSpan={4} />
            </TableRow>
          </TableFooter>
        )}
      </Table>

      {/* Add / Edit Ingredient Dialog */}
      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) resetForm();
          setDialogOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialogMode === "edit"
                ? t("ingredients.dialog.editTitle")
                : t("ingredients.dialog.title")}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            {/* Item selection — only for add mode; read-only in edit */}
            {dialogMode === "add" ? (
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">
                  {t("ingredients.dialog.selectItem")}
                </label>
                <Select value={newItemId} onValueChange={handleItemSelect}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("ingredients.dialog.selectItem")} />
                  </SelectTrigger>
                  <SelectContent>
                    {brewMaterialItems.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name} ({item.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <label className="text-sm font-medium">
                  {t("ingredients.dialog.selectItem")}
                </label>
                <Input value={editingItemName} disabled />
              </div>
            )}

            {/* Category */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">
                {t("ingredients.dialog.selectCategory")}
              </label>
              <Select value={newCategory} onValueChange={setNewCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INGREDIENT_CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {categoryLabels[cat] ?? cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Amount — unit-aware label and placeholder */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">
                {amountLabel}
              </label>
              <Input
                type="number"
                value={newAmountG}
                onChange={(e) => setNewAmountG(e.target.value)}
                placeholder={selectedUnitSymbol}
              />
            </div>

            {/* Use Stage */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">
                {t("ingredients.dialog.selectStage")}
              </label>
              <Select value={newUseStage} onValueChange={setNewUseStage}>
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {USE_STAGES.map((stage) => (
                    <SelectItem key={stage} value={stage}>
                      {stageLabels[stage] ?? stage}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Use Time */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">
                {t("ingredients.time")}
              </label>
              <Input
                type="number"
                value={newUseTimeMin}
                onChange={(e) => setNewUseTimeMin(e.target.value)}
                placeholder="min"
              />
            </div>

            {/* Notes */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">
                {t("ingredients.notes")}
              </label>
              <Input
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                placeholder={t("ingredients.notes")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                resetForm();
                setDialogOpen(false);
              }}
            >
              {tCommon("cancel")}
            </Button>
            <Button onClick={handleDialogSave} disabled={isSubmitting}>
              {tCommon("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
