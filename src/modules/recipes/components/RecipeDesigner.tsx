"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { Copy, Archive, Trash2, FlaskConical, Save, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BeerGlass } from "@/components/ui/beer-glass";

import {
  useRecipeDetail,
  useBeerStyles,
  useBrewingSystemOptions,
  useBrewMaterialItems,
  useMashingProfiles,
} from "../hooks";
import {
  createRecipe,
  updateRecipe,
  deleteRecipe,
  permanentDeleteRecipe,
  duplicateRecipe,
  addRecipeItem,
  updateRecipeItem,
  removeRecipeItem,
  reorderRecipeItems,
  applyMashProfile,
} from "../actions";
import { getProductionItemOptions } from "@/modules/batches/actions";
import { useUnits } from "@/modules/units/hooks";

import type {
  RecipeItem,
  RecipeConstantsOverride,
  BrewingSystemInput,
  BeerStyle,
} from "../types";
import { DEFAULT_BREWING_SYSTEM } from "../types";
import { calculateAll } from "../utils";
import type { IngredientInput } from "../utils";

import { RecipeExecutionSection } from "./RecipeTargetSection";
import { RecipeEditor } from "./RecipeEditor";
import { RecipeDesignSection } from "./RecipeDesignSection";
import { RecipeFeedbackSidebar } from "./RecipeFeedbackSidebar";

// ── Props ────────────────────────────────────────────────────────

interface RecipeDesignerProps {
  id: string;
}

// ── Component ────────────────────────────────────────────────────

export function RecipeDesigner({ id }: RecipeDesignerProps): React.ReactNode {
  const t = useTranslations("recipes");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const searchParams = useSearchParams();

  const isNew = id === "new";
  const { data: recipeDetail, isLoading, mutate } = useRecipeDetail(id);
  const { data: beerStyles } = useBeerStyles();
  const { data: brewingSystemOpts } = useBrewingSystemOptions();
  const { data: brewMaterialItems } = useBrewMaterialItems();
  const { data: mashProfiles } = useMashingProfiles();
  const { units: allUnits } = useUnits();

  // Snapshot mode
  const batchId = searchParams.get("batchId");
  const batchNumber = searchParams.get("batchNumber");
  const isSnapshot = batchId != null && batchNumber != null;

  // ── State ──────────────────────────────────────────────────────

  const [designCollapsed, setDesignCollapsed] = useState(!isNew);
  const [targetCollapsed, setTargetCollapsed] = useState(!isNew);
  const [productionItemOptions, setProductionItemOptions] = useState<
    Array<{ value: string; label: string }>
  >([]);

  const [values, setValues] = useState<Record<string, unknown>>({
    name: "",
    code: null,
    itemId: null,
    brewingSystemId: null,
    status: "draft",
    boilTimeMin: null,
    durationFermentationDays: null,
    durationConditioningDays: null,
    shelfLifeDays: null,
    notes: null,
  });

  // Design section state (sliders + style + batch size)
  const [designValues, setDesignValues] = useState({
    beerStyleId: null as string | null,
    batchSizeL: 0,
    og: 0,
    fg: 0,
    targetIbu: 0,
    targetEbc: 0,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Local items state for real-time editing
  const [localItems, setLocalItems] = useState<RecipeItem[]>([]);

  // Constants override
  const [constants, setConstants] = useState<RecipeConstantsOverride>({});

  // Add ingredient dialog
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addCategory, setAddCategory] = useState<string>("malt");
  const [addItemId, setAddItemId] = useState("");

  // ── Effects ────────────────────────────────────────────────────

  // Populate form when data loads
  useEffect(() => {
    if (recipeDetail?.recipe) {
      const r = recipeDetail.recipe;
      setValues({
        name: r.name,
        code: r.code,
        itemId: r.itemId,
        brewingSystemId: r.brewingSystemId,
        status: r.status,
        boilTimeMin: r.boilTimeMin,
        durationFermentationDays: r.durationFermentationDays,
        durationConditioningDays: r.durationConditioningDays,
        shelfLifeDays: r.shelfLifeDays,
        notes: r.notes,
      });
      setDesignValues({
        beerStyleId: r.beerStyleId,
        batchSizeL: r.batchSizeL ? parseFloat(r.batchSizeL) : 0,
        og: r.og ? parseFloat(r.og) : 0,
        fg: r.fg ? parseFloat(r.fg) : 0,
        targetIbu: r.targetIbu ? parseFloat(r.targetIbu) : 0,
        targetEbc: r.targetEbc ? parseFloat(r.targetEbc) : 0,
      });
      setConstants(r.constantsOverride ?? {});
      setLocalItems(recipeDetail.items);
      setDesignCollapsed(true);
      setTargetCollapsed(true);
    }
  }, [recipeDetail]);

  // Load production item options
  useEffect(() => {
    let cancelled = false;
    getProductionItemOptions()
      .then((opts) => {
        if (!cancelled) setProductionItemOptions(opts);
      })
      .catch((err: unknown) =>
        console.error("Failed to load production items:", err)
      );
    return (): void => {
      cancelled = true;
    };
  }, []);

  // ── Derived values ─────────────────────────────────────────────

  const beerStyleOptions = useMemo(
    () =>
      beerStyles.map((style) => ({
        value: style.id,
        label: style.groupName
          ? `${style.groupName} — ${style.name}`
          : style.name,
      })),
    [beerStyles]
  );

  const brewingSystemOptions = useMemo(
    () =>
      brewingSystemOpts.map((bs) => ({
        value: bs.id,
        label: `${bs.name} (${bs.batchSizeL} L, ${bs.efficiencyPct}%)`,
      })),
    [brewingSystemOpts]
  );

  const mashingProfileOptions = useMemo(
    () =>
      mashProfiles.map((p) => ({
        value: p.id,
        label: p.name,
      })),
    [mashProfiles]
  );

  // Current selected style
  const selectedStyle: BeerStyle | null = useMemo(() => {
    const styleId = designValues.beerStyleId;
    if (!styleId) return null;
    return beerStyles.find((s) => s.id === String(styleId)) ?? null;
  }, [designValues.beerStyleId, beerStyles]);

  // Build system defaults (from selected brewing system or DEFAULT)
  const systemDefaults: BrewingSystemInput = useMemo(() => {
    const bsId = values.brewingSystemId ? String(values.brewingSystemId) : null;
    if (!bsId) return DEFAULT_BREWING_SYSTEM;
    const bs = brewingSystemOpts.find((b) => b.id === bsId);
    if (!bs) return DEFAULT_BREWING_SYSTEM;
    return {
      ...DEFAULT_BREWING_SYSTEM,
      batchSizeL: parseFloat(bs.batchSizeL) || 100,
      efficiencyPct: parseFloat(bs.efficiencyPct) || 75,
    };
  }, [values.brewingSystemId, brewingSystemOpts]);

  // Merged system with constants override
  const effectiveSystem: BrewingSystemInput = useMemo(() => {
    const merged = { ...systemDefaults };
    if (constants.efficiencyPct != null)
      merged.efficiencyPct = constants.efficiencyPct;
    if (constants.kettleLossPct != null)
      merged.kettleLossPct = constants.kettleLossPct;
    if (constants.whirlpoolLossPct != null)
      merged.whirlpoolLossPct = constants.whirlpoolLossPct;
    if (constants.fermentationLossPct != null)
      merged.fermentationLossPct = constants.fermentationLossPct;
    if (constants.extractEstimate != null)
      merged.extractEstimate = constants.extractEstimate;
    if (constants.waterPerKgMalt != null)
      merged.waterPerKgMalt = constants.waterPerKgMalt;
    if (constants.waterReserveL != null)
      merged.waterReserveL = constants.waterReserveL;
    return merged;
  }, [systemDefaults, constants]);

  // Items by category
  const maltItems = useMemo(
    () =>
      localItems.filter(
        (i) => i.category === "malt" || i.category === "adjunct"
      ),
    [localItems]
  );
  const hopItems = useMemo(
    () => localItems.filter((i) => i.category === "hop"),
    [localItems]
  );
  const yeastItems = useMemo(
    () => localItems.filter((i) => i.category === "yeast"),
    [localItems]
  );
  const adjunctItems = useMemo(
    () => localItems.filter((i) => i.category === "other"),
    [localItems]
  );

  // Volume
  const volumeL = designValues.batchSizeL;

  // Real-time calculation (client-side)
  const calcResult = useMemo(() => {
    const ingredients: IngredientInput[] = localItems.map((item) => ({
      category: item.category,
      amountG: parseFloat(item.amountG) || 0,
      unitToBaseFactor: item.unitToBaseFactor ?? null,
      alpha: item.itemAlpha ? parseFloat(item.itemAlpha) : null,
      ebc: item.itemEbc ? parseFloat(item.itemEbc) : null,
      extractPercent: item.itemExtractPercent
        ? parseFloat(item.itemExtractPercent)
        : null,
      costPrice: item.itemCostPrice ? parseFloat(item.itemCostPrice) : null,
      useTimeMin: item.useTimeMin,
      itemId: item.itemId,
      recipeItemId: item.id,
      name: item.itemName ?? item.itemId,
    }));

    return calculateAll(ingredients, volumeL, undefined, undefined, effectiveSystem);
  }, [localItems, volumeL, effectiveSystem]);

  // Malt actual kg
  const maltActualKg = useMemo(() => {
    return maltItems.reduce((sum, item) => {
      const amount = parseFloat(item.amountG) || 0;
      const factor = item.unitToBaseFactor ?? 1;
      return sum + amount * factor;
    }, 0);
  }, [maltItems]);

  // Style targets
  const ibuTarget = useMemo(() => {
    if (!selectedStyle?.ibuMin || !selectedStyle?.ibuMax) return null;
    return {
      min: parseFloat(selectedStyle.ibuMin),
      max: parseFloat(selectedStyle.ibuMax),
    };
  }, [selectedStyle]);

  const ebcTarget = useMemo(() => {
    if (!selectedStyle?.ebcMin || !selectedStyle?.ebcMax) return null;
    return {
      min: parseFloat(selectedStyle.ebcMin),
      max: parseFloat(selectedStyle.ebcMax),
    };
  }, [selectedStyle]);

  // Style ranges for design sliders
  const styleRanges = useMemo(() => {
    if (!selectedStyle) return { og: null, fg: null, ibu: null, ebc: null };
    const parse = (min: string | null, max: string | null): [number, number] | null => {
      if (!min || !max) return null;
      const a = parseFloat(min);
      const b = parseFloat(max);
      if (isNaN(a) || isNaN(b)) return null;
      return [a, b];
    };
    return {
      og: parse(selectedStyle.ogMin, selectedStyle.ogMax),
      fg: parse(selectedStyle.fgMin, selectedStyle.fgMax),
      ibu: parse(selectedStyle.ibuMin, selectedStyle.ibuMax),
      ebc: parse(selectedStyle.ebcMin, selectedStyle.ebcMax),
    };
  }, [selectedStyle]);

  // Display names
  const styleName = selectedStyle?.name ?? null;
  const systemName = useMemo(() => {
    const bsId = values.brewingSystemId ? String(values.brewingSystemId) : null;
    if (!bsId) return null;
    return brewingSystemOpts.find((b) => b.id === bsId)?.name ?? null;
  }, [values.brewingSystemId, brewingSystemOpts]);

  // Header EBC for BeerGlass — use design target EBC, fallback to style midpoint
  const headerEbc = useMemo((): number | null => {
    if (designValues.targetEbc > 0) return designValues.targetEbc;
    if (calcResult.ebc > 0) return calcResult.ebc;
    if (selectedStyle?.ebcMin != null && selectedStyle?.ebcMax != null) {
      return (Number(selectedStyle.ebcMin) + Number(selectedStyle.ebcMax)) / 2;
    }
    return null;
  }, [designValues.targetEbc, calcResult.ebc, selectedStyle]);

  const backHref = isSnapshot
    ? `/brewery/batches/${batchId}?tab=ingredients`
    : "/brewery/recipes";

  // ── Handlers ───────────────────────────────────────────────────

  const handleDesignChange = useCallback(
    (key: string, value: unknown): void => {
      setDesignValues((prev) => ({ ...prev, [key]: value }));

      // When selecting a beer style, set sliders to midpoint if currently 0
      if (key === "beerStyleId" && value) {
        const style = beerStyles.find((s) => s.id === String(value));
        if (style) {
          setDesignValues((prev) => {
            const mid = (a: string | null, b: string | null): number => {
              if (!a || !b) return 0;
              return (parseFloat(a) + parseFloat(b)) / 2;
            };
            return {
              ...prev,
              beerStyleId: String(value),
              og: prev.og === 0 ? Math.round(mid(style.ogMin, style.ogMax) * 10) / 10 : prev.og,
              fg: prev.fg === 0 ? Math.round(mid(style.fgMin, style.fgMax) * 10) / 10 : prev.fg,
              targetIbu: prev.targetIbu === 0 ? Math.round(mid(style.ibuMin, style.ibuMax)) : prev.targetIbu,
              targetEbc: prev.targetEbc === 0 ? Math.round(mid(style.ebcMin, style.ebcMax)) : prev.targetEbc,
            };
          });
        }
      }
    },
    [beerStyles]
  );

  const handleChange = useCallback(
    (key: string, value: unknown): void => {
      setValues((prev) => ({ ...prev, [key]: value }));
      if (errors[key]) {
        setErrors((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      }

      // When selecting a mashing profile, apply it
      if (key === "mashingProfileId" && value && !isNew) {
        void applyMashProfile(id, String(value)).then(() => {
          toast.success(tCommon("saved"));
          mutate();
        });
      }
    },
    [errors, isNew, id, tCommon, mutate]
  );

  const validate = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};
    if (!values.name || String(values.name).trim() === "") {
      newErrors.name = tCommon("validation.required");
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [values, tCommon]);

  // Build the data payload for save (merges execution values + design values)
  const buildSaveData = useCallback((): Record<string, unknown> => ({
    name: String(values.name),
    beerStyleId: designValues.beerStyleId || null,
    itemId: values.itemId ? String(values.itemId) : null,
    status: String(values.status ?? "draft"),
    batchSizeL: designValues.batchSizeL ? String(designValues.batchSizeL) : null,
    og: designValues.og ? String(designValues.og) : null,
    fg: designValues.fg ? String(designValues.fg) : null,
    targetIbu: designValues.targetIbu ? String(designValues.targetIbu) : null,
    targetEbc: designValues.targetEbc ? String(designValues.targetEbc) : null,
    boilTimeMin: values.boilTimeMin ? Number(values.boilTimeMin) : null,
    durationFermentationDays: values.durationFermentationDays
      ? Number(values.durationFermentationDays)
      : null,
    durationConditioningDays: values.durationConditioningDays
      ? Number(values.durationConditioningDays)
      : null,
    shelfLifeDays: values.shelfLifeDays ? Number(values.shelfLifeDays) : null,
    notes: values.notes ? String(values.notes) : null,
    brewingSystemId: values.brewingSystemId
      ? String(values.brewingSystemId)
      : null,
    constantsOverride: Object.keys(constants).length > 0 ? constants : null,
  }), [values, designValues, constants]);

  const handleSave = useCallback(async (): Promise<void> => {
    if (!validate()) return;

    try {
      const data = buildSaveData();
      if (isNew) {
        const created = await createRecipe(data);
        toast.success(tCommon("saved"));
        router.push(`/brewery/recipes/${created.id}`);
      } else {
        await updateRecipe(id, data);
        toast.success(tCommon("saved"));
        mutate();
      }
    } catch (error: unknown) {
      console.error("Failed to save recipe:", error);
      toast.error(tCommon("saveFailed"));
    }
  }, [isNew, id, buildSaveData, validate, router, tCommon, mutate]);

  const handleDuplicate = useCallback(async (): Promise<void> => {
    try {
      const copy = await duplicateRecipe(id);
      toast.success(t("detail.actions.duplicateSuccess"));
      router.push(`/brewery/recipes/${copy.id}`);
    } catch (error: unknown) {
      console.error("Failed to duplicate recipe:", error);
      toast.error(tCommon("saveFailed"));
    }
  }, [id, router, t, tCommon]);

  const handleArchive = useCallback(async (): Promise<void> => {
    try {
      await deleteRecipe(id);
      toast.success(tCommon("saved"));
      router.push("/brewery/recipes");
    } catch (error: unknown) {
      console.error("Failed to archive recipe:", error);
      toast.error(tCommon("saveFailed"));
    }
  }, [id, router, tCommon]);

  const handleDelete = useCallback(async (): Promise<void> => {
    try {
      await permanentDeleteRecipe(id);
      toast.success(t("detail.actions.deleteSuccess"));
      router.push("/brewery/recipes");
    } catch (error: unknown) {
      console.error("Failed to delete recipe:", error);
      const message =
        error instanceof Error && error.message === "RECIPE_HAS_BATCHES"
          ? t("detail.actions.deleteHasBatches")
          : tCommon("saveFailed");
      toast.error(message);
    }
  }, [id, router, t, tCommon]);

  const handleCancel = useCallback((): void => {
    router.push(backHref);
  }, [router, backHref]);

  const handleContinue = useCallback(async (): Promise<void> => {
    if (!validate()) return;

    try {
      const data = buildSaveData();
      const created = await createRecipe(data);
      toast.success(tCommon("saved"));
      router.push(`/brewery/recipes/${created.id}`);
    } catch (error: unknown) {
      console.error("Failed to create recipe:", error);
      toast.error(tCommon("saveFailed"));
    }
  }, [buildSaveData, validate, router, tCommon]);

  // ── Ingredient handlers ────────────────────────────────────────

  const handleAmountChange = useCallback(
    (itemId: string, amount: string): void => {
      setLocalItems((prev) =>
        prev.map((item) =>
          item.id === itemId ? { ...item, amountG: amount } : item
        )
      );
      // Persist to server (debounced would be ideal, but simple approach here)
      void updateRecipeItem(itemId, { amountG: amount });
    },
    []
  );

  const handleStageChange = useCallback(
    (itemId: string, stage: string): void => {
      setLocalItems((prev) =>
        prev.map((item) =>
          item.id === itemId ? { ...item, useStage: stage } : item
        )
      );
      void updateRecipeItem(itemId, { useStage: stage });
    },
    []
  );

  const handleTimeChange = useCallback(
    (itemId: string, time: number | null): void => {
      setLocalItems((prev) =>
        prev.map((item) =>
          item.id === itemId ? { ...item, useTimeMin: time } : item
        )
      );
      void updateRecipeItem(itemId, { useTimeMin: time });
    },
    []
  );

  const handleNotesChange = useCallback(
    (itemId: string, notes: string): void => {
      setLocalItems((prev) =>
        prev.map((item) =>
          item.id === itemId ? { ...item, notes: notes || null } : item
        )
      );
      void updateRecipeItem(itemId, { notes: notes || null });
    },
    []
  );

  const handleRemoveIngredient = useCallback(
    (itemId: string): void => {
      setLocalItems((prev) => prev.filter((item) => item.id !== itemId));
      void removeRecipeItem(itemId);
    },
    []
  );

  const handleReorder = useCallback(
    (activeId: string, overId: string): void => {
      setLocalItems((prev) => {
        const oldIndex = prev.findIndex((i) => i.id === activeId);
        const newIndex = prev.findIndex((i) => i.id === overId);
        if (oldIndex === -1 || newIndex === -1) return prev;

        const updated = [...prev];
        const [removed] = updated.splice(oldIndex, 1);
        if (removed) {
          updated.splice(newIndex, 0, removed);
        }

        // Persist reorder in a microtask to avoid setState during render
        const ids = updated.map((i) => i.id);
        queueMicrotask(() => {
          void reorderRecipeItems(id, ids);
        });

        return updated;
      });
    },
    [id]
  );

  const handleAddIngredient = useCallback(
    (category: string): void => {
      setAddCategory(category);
      setAddItemId("");
      setAddDialogOpen(true);
    },
    []
  );

  const handleAddIngredientConfirm = useCallback(async (): Promise<void> => {
    if (!addItemId) return;

    try {
      // Determine default unit for the selected item
      const selectedItem = brewMaterialItems.find((i) => i.id === addItemId);
      const defaultUnitId = selectedItem?.recipeUnitId ?? selectedItem?.unitId ?? null;

      await addRecipeItem(id, {
        itemId: addItemId,
        category: addCategory,
        amountG: "0",
        unitId: defaultUnitId,
        useStage: addCategory === "hop" ? "boil" : null,
        useTimeMin: addCategory === "hop" ? 60 : null,
      });

      setAddDialogOpen(false);
      mutate();
    } catch (error: unknown) {
      console.error("Failed to add ingredient:", error);
      toast.error(tCommon("saveFailed"));
    }
  }, [addItemId, addCategory, id, brewMaterialItems, mutate, tCommon]);

  const handleConstantsChange = useCallback(
    (newConstants: RecipeConstantsOverride): void => {
      setConstants(newConstants);
    },
    []
  );

  const handleConstantsReset = useCallback((): void => {
    setConstants({});
  }, []);

  // ── Filter brew materials for add dialog ───────────────────────

  const filteredMaterials = useMemo(() => {
    const categoryMap: Record<string, string[]> = {
      malt: ["malt"],
      hop: ["hop"],
      yeast: ["yeast"],
      adjunct: ["adjunct", "other"],
      other: ["adjunct", "other"],
    };
    const types = categoryMap[addCategory] ?? [addCategory];
    return brewMaterialItems.filter(
      (item) => item.materialType && types.includes(item.materialType)
    );
  }, [addCategory, brewMaterialItems]);

  // ── Loading state ──────────────────────────────────────────────

  if (!isNew && isLoading) {
    return (
      <div className="flex items-center justify-center p-12 text-muted-foreground">
        {tCommon("loading")}
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────

  const title = isNew
    ? t("detail.newTitle")
    : recipeDetail?.recipe?.name ?? t("detail.title");

  return (
    <div className="flex flex-col h-full">
      {/* Snapshot banner */}
      {isSnapshot && (
        <div className="flex items-center gap-2 rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-2 text-sm dark:border-yellow-700 dark:bg-yellow-950 mx-6 mt-6">
          <FlaskConical className="size-4 text-yellow-600 dark:text-yellow-400 shrink-0" />
          <span>{t("detail.snapshotBanner", { batchNumber })}</span>
        </div>
      )}

      {/* Header with actions */}
      <div className="flex items-center justify-between px-6 pt-6 pb-2">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={handleCancel}>
            <ArrowLeft className="size-4" />
          </Button>
          <div className="flex items-center gap-3">
            {headerEbc !== null && <BeerGlass ebc={headerEbc} size="sm" />}
            <div>
              <h1 className="text-lg font-semibold">{title}</h1>
              {selectedStyle && (
                <p className="text-xs text-muted-foreground">{selectedStyle.name}</p>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isNew && (
            <>
              <Button variant="outline" size="sm" onClick={() => void handleDuplicate()}>
                <Copy className="mr-1 size-4" />
                {t("detail.actions.duplicate")}
              </Button>
              {recipeDetail?.recipe?.status !== "archived" && (
                <Button variant="outline" size="sm" onClick={() => void handleArchive()}>
                  <Archive className="mr-1 size-4" />
                  {t("detail.actions.archive")}
                </Button>
              )}
              {recipeDetail?.recipe?.status === "archived" && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm">
                      <Trash2 className="mr-1 size-4" />
                      {t("detail.actions.delete")}
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
                        onClick={() => void handleDelete()}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        {tCommon("delete")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </>
          )}
          <Button size="sm" onClick={() => void handleSave()}>
            <Save className="mr-1 size-4" />
            {t("detail.actions.save")}
          </Button>
        </div>
      </div>

      {/* Main content with optional sidebar */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Section 1: Design (collapsible) */}
          <RecipeDesignSection
            isNew={isNew}
            isCollapsed={designCollapsed}
            onToggleCollapse={() => setDesignCollapsed((p) => !p)}
            values={designValues}
            onChange={handleDesignChange}
            beerStyleOptions={beerStyleOptions}
            styleRanges={styleRanges}
            calcOg={calcResult.og}
            calcIbu={calcResult.ibu}
            calcEbc={calcResult.ebc}
            name={String(values.name ?? "")}
            status={String(values.status ?? "draft")}
            onNameChange={(v) => handleChange("name", v)}
            onStatusChange={(v) => handleChange("status", v)}
            nameError={errors.name}
            styleName={styleName}
            onContinue={isNew ? () => void handleContinue() : undefined}
          />

          {/* Section 2: Execution (collapsible) */}
          <RecipeExecutionSection
            isCollapsed={targetCollapsed}
            onToggleCollapse={() => setTargetCollapsed((p) => !p)}
            values={values}
            onChange={handleChange}
            brewingSystemOptions={brewingSystemOptions}
            mashingProfileOptions={mashingProfileOptions}
            productionItemOptions={productionItemOptions}
            systemName={systemName}
          />

          {/* Section 3: Editor (only shown for existing recipes) */}
          {!isNew && (
            <RecipeEditor
              recipeId={id}
              maltItems={maltItems}
              hopItems={hopItems}
              yeastItems={yeastItems}
              adjunctItems={adjunctItems}
              steps={recipeDetail?.steps ?? []}
              recipe={recipeDetail?.recipe ?? null}
              allItems={localItems}
              ogPlato={calcResult.og}
              volumeL={volumeL}
              maltPlanKg={calcResult.maltRequiredKg ?? 0}
              ibuTarget={ibuTarget}
              ebcTarget={ebcTarget}
              constants={constants}
              systemDefaults={systemDefaults}
              systemName={systemName}
              onAmountChange={handleAmountChange}
              onStageChange={handleStageChange}
              onTimeChange={handleTimeChange}
              onNotesChange={handleNotesChange}
              onRemove={handleRemoveIngredient}
              onReorder={handleReorder}
              onAddIngredient={handleAddIngredient}
              onConstantsChange={handleConstantsChange}
              onConstantsReset={handleConstantsReset}
              onMutate={mutate}
            />
          )}
        </div>

        {/* Detail sidebar (xl+ screens) */}
        <RecipeFeedbackSidebar
          designIbu={designValues.targetIbu}
          designEbc={designValues.targetEbc}
          calcIbu={calcResult.ibu}
          calcEbc={calcResult.ebc}
          maltPlanKg={calcResult.maltRequiredKg ?? 0}
          maltActualKg={maltActualKg}
          pipeline={calcResult.pipeline ?? null}
          waterRequiredL={calcResult.waterRequiredL ?? 0}
          totalCost={calcResult.totalProductionCost}
          costPerLiter={calcResult.costPerLiter}
        />
      </div>

      {/* Add Ingredient Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("ingredients.dialog.title")}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">
                {t("ingredients.dialog.selectItem")}
              </label>
              <Select value={addItemId} onValueChange={setAddItemId}>
                <SelectTrigger>
                  <SelectValue placeholder={t("designer.cards.selectItem")} />
                </SelectTrigger>
                <SelectContent>
                  {filteredMaterials.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name} ({item.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAddDialogOpen(false)}
            >
              {tCommon("cancel")}
            </Button>
            <Button
              onClick={() => void handleAddIngredientConfirm()}
              disabled={!addItemId}
            >
              {tCommon("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
