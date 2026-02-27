"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { Copy, Archive, Trash2, FlaskConical } from "lucide-react";
import { toast } from "sonner";

import { DetailView } from "@/components/detail-view";
import { FormSection } from "@/components/forms";
import type { FormSectionDef, FormMode } from "@/components/forms";
import type { DetailViewTab, DetailViewAction } from "@/components/detail-view";
import { BeerGlass } from "@/components/ui/beer-glass";

import { useRecipeDetail, useBeerStyles, useBrewingSystemOptions } from "../hooks";
import {
  createRecipe,
  updateRecipe,
  deleteRecipe,
  permanentDeleteRecipe,
  duplicateRecipe,
} from "../actions";
import { getProductionItemOptions, updateBatch } from "@/modules/batches/actions";
import { RecipeIngredientsTab } from "./RecipeIngredientsTab";
import { RecipeStepsTab } from "./RecipeStepsTab";
import { RecipeCalculation } from "./RecipeCalculation";

// ── Component ──────────────────────────────────────────────────

interface RecipeDetailProps {
  id: string;
}

export function RecipeDetail({ id }: RecipeDetailProps): React.ReactNode {
  const t = useTranslations("recipes");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const searchParams = useSearchParams();

  const isNew = id === "new";
  const { data: recipeDetail, isLoading, mutate } = useRecipeDetail(id);
  const { data: beerStyles } = useBeerStyles();
  const { data: brewingSystemOpts } = useBrewingSystemOptions();

  // Snapshot mode: opened from a batch detail
  const batchId = searchParams.get("batchId");
  const batchNumber = searchParams.get("batchNumber");
  const isSnapshot = batchId != null && batchNumber != null;

  const [productionItemOptions, setProductionItemOptions] = useState<Array<{ value: string; label: string }>>([]);

  const [values, setValues] = useState<Record<string, unknown>>({
    name: "",
    code: null,
    beerStyleId: null,
    itemId: null,
    brewingSystemId: null,
    status: "draft",
    batchSizeL: null,
    batchSizeBrutoL: null,
    beerVolumeL: null,
    boilTimeMin: null,
    durationFermentationDays: null,
    durationConditioningDays: null,
    shelfLifeDays: null,
    notes: null,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState("basic");

  // Populate form when data loads
  useEffect(() => {
    if (recipeDetail?.recipe) {
      const r = recipeDetail.recipe;
      setValues({
        name: r.name,
        code: r.code,
        beerStyleId: r.beerStyleId,
        itemId: r.itemId,
        brewingSystemId: r.brewingSystemId,
        status: r.status,
        batchSizeL: r.batchSizeL,
        batchSizeBrutoL: r.batchSizeBrutoL,
        beerVolumeL: r.beerVolumeL,
        boilTimeMin: r.boilTimeMin,
        durationFermentationDays: r.durationFermentationDays,
        durationConditioningDays: r.durationConditioningDays,
        shelfLifeDays: r.shelfLifeDays,
        notes: r.notes,
      });
    }
  }, [recipeDetail]);

  // Load production item options for the select field
  useEffect(() => {
    let cancelled = false;
    getProductionItemOptions()
      .then((opts) => {
        if (!cancelled) setProductionItemOptions(opts);
      })
      .catch((err: unknown) => console.error("Failed to load production items:", err));
    return () => { cancelled = true; };
  }, []);

  const mode: FormMode = isNew ? "create" : "edit";

  const backHref = isSnapshot
    ? `/brewery/batches/${batchId}?tab=ingredients`
    : "/brewery/recipes";

  // Build beer style options for select
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

  // Build brewing system options for select
  const brewingSystemOptions = useMemo(
    () =>
      brewingSystemOpts.map((bs) => ({
        value: bs.id,
        label: `${bs.name} (${bs.batchSizeL} L, ${bs.efficiencyPct}%)`,
      })),
    [brewingSystemOpts]
  );

  // Form section definition for the basic tab
  const basicFormSection: FormSectionDef = useMemo(
    () => ({
      title: isNew ? t("detail.newTitle") : t("detail.title"),
      columns: 2,
      fields: [
        {
          key: "name",
          label: t("form.name"),
          type: "text",
          required: true,
          placeholder: t("form.name"),
        },
        {
          key: "code",
          label: t("form.code"),
          type: "text",
          disabled: !isNew,
          placeholder: t("form.code"),
        },
        {
          key: "beerStyleId",
          label: t("form.beerStyle"),
          type: "select",
          options: beerStyleOptions,
        },
        {
          key: "brewingSystemId",
          label: t("form.brewingSystem"),
          type: "select",
          options: brewingSystemOptions,
          placeholder: t("form.brewingSystemPlaceholder"),
        },
        {
          key: "itemId",
          label: t("form.itemId"),
          type: "select",
          options: productionItemOptions,
          placeholder: t("form.itemIdPlaceholder"),
        },
        {
          key: "status",
          label: t("form.status"),
          type: "select",
          options: [
            { value: "draft", label: t("status.draft") },
            { value: "active", label: t("status.active") },
            { value: "archived", label: t("status.archived") },
          ],
        },
        {
          key: "batchSizeL",
          label: t("form.batchSize"),
          type: "decimal",
          suffix: "L",
          placeholder: "0",
        },
        {
          key: "batchSizeBrutoL",
          label: t("form.batchSizeBruto"),
          type: "decimal",
          suffix: "L",
          placeholder: "0",
        },
        {
          key: "beerVolumeL",
          label: t("form.beerVolume"),
          type: "decimal",
          suffix: "L",
          placeholder: "0",
        },
        {
          key: "boilTimeMin",
          label: t("form.boilTime"),
          type: "number",
          suffix: "min",
          placeholder: "60",
        },
        {
          key: "durationFermentationDays",
          label: t("form.fermentationDays"),
          type: "number",
          suffix: "d",
          placeholder: "0",
        },
        {
          key: "durationConditioningDays",
          label: t("form.conditioningDays"),
          type: "number",
          suffix: "d",
          placeholder: "0",
        },
        {
          key: "shelfLifeDays",
          label: t("form.shelfLifeDays"),
          type: "number",
          suffix: "d",
          placeholder: "0",
        },
        {
          key: "notes",
          label: t("form.notes"),
          type: "textarea",
          gridSpan: 2,
          placeholder: t("form.notes"),
        },
      ],
    }),
    [t, isNew, beerStyleOptions, brewingSystemOptions, productionItemOptions]
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
    },
    [errors]
  );

  const validate = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};

    if (!values.name || String(values.name).trim() === "") {
      newErrors.name = tCommon("validation.required");
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [values, tCommon]);

  const handleSave = useCallback(async (): Promise<void> => {
    if (!validate()) return;

    try {
      if (isNew) {
        const created = await createRecipe({
          name: String(values.name),
          beerStyleId: values.beerStyleId ? String(values.beerStyleId) : null,
          itemId: values.itemId ? String(values.itemId) : null,
          status: String(values.status ?? "draft"),
          batchSizeL: values.batchSizeL ? String(values.batchSizeL) : null,
          batchSizeBrutoL: values.batchSizeBrutoL
            ? String(values.batchSizeBrutoL)
            : null,
          beerVolumeL: values.beerVolumeL ? String(values.beerVolumeL) : null,
          boilTimeMin: values.boilTimeMin
            ? Number(values.boilTimeMin)
            : null,
          durationFermentationDays: values.durationFermentationDays
            ? Number(values.durationFermentationDays)
            : null,
          durationConditioningDays: values.durationConditioningDays
            ? Number(values.durationConditioningDays)
            : null,
          shelfLifeDays: values.shelfLifeDays
            ? Number(values.shelfLifeDays)
            : null,
          notes: values.notes ? String(values.notes) : null,
          brewingSystemId: values.brewingSystemId ? String(values.brewingSystemId) : null,
        });

        toast.success(tCommon("saved"));
        router.push(backHref);
      } else {
        const itemIdValue = values.itemId ? String(values.itemId) : null;

        await updateRecipe(id, {
          name: String(values.name),
          beerStyleId: values.beerStyleId ? String(values.beerStyleId) : null,
          brewingSystemId: values.brewingSystemId ? String(values.brewingSystemId) : null,
          itemId: itemIdValue,
          status: String(values.status ?? "draft"),
          batchSizeL: values.batchSizeL ? String(values.batchSizeL) : null,
          batchSizeBrutoL: values.batchSizeBrutoL
            ? String(values.batchSizeBrutoL)
            : null,
          beerVolumeL: values.beerVolumeL ? String(values.beerVolumeL) : null,
          boilTimeMin: values.boilTimeMin
            ? Number(values.boilTimeMin)
            : null,
          durationFermentationDays: values.durationFermentationDays
            ? Number(values.durationFermentationDays)
            : null,
          durationConditioningDays: values.durationConditioningDays
            ? Number(values.durationConditioningDays)
            : null,
          shelfLifeDays: values.shelfLifeDays
            ? Number(values.shelfLifeDays)
            : null,
          notes: values.notes ? String(values.notes) : null,
        });

        // Sync item_id to the batch when saving a snapshot recipe
        if (batchId) {
          await updateBatch(batchId, { itemId: itemIdValue });
        }

        toast.success(tCommon("saved"));
        router.push(backHref);
      }
    } catch (error: unknown) {
      console.error("Failed to save recipe:", error);
      toast.error(tCommon("saveFailed"));
    }
  }, [isNew, id, values, validate, router, tCommon, mutate, batchId, backHref]);

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
    if (isSnapshot) {
      router.push(`/brewery/batches/${batchId}?tab=ingredients`);
    } else {
      router.push("/brewery/recipes");
    }
  }, [router, isSnapshot, batchId]);

  // Header actions (only for edit mode)
  const actions: DetailViewAction[] = useMemo(() => {
    if (isNew) return [];

    const result: DetailViewAction[] = [
      {
        key: "duplicate",
        label: t("detail.actions.duplicate"),
        icon: Copy,
        variant: "outline" as const,
        onClick: () => {
          void handleDuplicate();
        },
      },
    ];

    const currentStatus = recipeDetail?.recipe?.status;

    if (currentStatus !== "archived") {
      result.push({
        key: "archive",
        label: t("detail.actions.archive"),
        icon: Archive,
        variant: "outline" as const,
        onClick: () => {
          void handleArchive();
        },
      });
    }

    // Only show delete for already archived recipes
    if (currentStatus === "archived") {
      result.push({
        key: "delete",
        label: t("detail.actions.delete"),
        icon: Trash2,
        variant: "destructive" as const,
        confirm: {
          title: tCommon("confirmDelete"),
          description: tCommon("confirmDeleteDescription"),
        },
        onClick: () => {
          void handleDelete();
        },
      });
    }

    return result;
  }, [isNew, t, tCommon, handleDuplicate, handleArchive, handleDelete, recipeDetail]);

  // Build tabs — always shown (in create mode some tabs have placeholder content)
  const tabs: DetailViewTab[] = useMemo(() => {
    const saveFirstMessage = (
      <p className="text-sm text-muted-foreground py-8 text-center">
        {tCommon("saveFirst")}
      </p>
    );

    return [
      {
        key: "basic",
        label: t("tabs.basic"),
        content: (
          <FormSection
            section={basicFormSection}
            values={values}
            errors={errors}
            mode={mode}
            onChange={handleChange}
          />
        ),
      },
      {
        key: "ingredients",
        label: t("tabs.ingredients"),
        content: isNew ? saveFirstMessage : (
          <RecipeIngredientsTab
            recipeId={id}
            items={recipeDetail?.items ?? []}
            onMutate={mutate}
          />
        ),
      },
      {
        key: "steps",
        label: t("tabs.steps"),
        content: isNew ? saveFirstMessage : (
          <RecipeStepsTab
            recipeId={id}
            steps={recipeDetail?.steps ?? []}
            onMutate={mutate}
          />
        ),
      },
      {
        key: "calculation",
        label: t("tabs.calculation"),
        content: isNew ? saveFirstMessage : (
          <RecipeCalculation
            recipeId={id}
            recipe={recipeDetail?.recipe ?? null}
            items={recipeDetail?.items ?? []}
            onMutate={mutate}
          />
        ),
      },
      {
        key: "notes",
        label: t("tabs.notes"),
        content: (
          <div className="max-w-2xl">
            <FormSection
              section={{
                columns: 1,
                fields: [
                  {
                    key: "notes",
                    label: t("form.notes"),
                    type: "textarea",
                    gridSpan: 1,
                    placeholder: t("form.notes"),
                  },
                ],
              }}
              values={values}
              errors={errors}
              mode={mode}
              onChange={handleChange}
            />
          </div>
        ),
      },
    ];
  }, [
    isNew,
    t,
    tCommon,
    basicFormSection,
    values,
    errors,
    mode,
    handleChange,
    id,
    recipeDetail,
    mutate,
  ]);

  const title = isNew
    ? t("detail.newTitle")
    : recipeDetail?.recipe?.name ?? t("detail.title");

  const subtitle = !isNew && recipeDetail?.recipe?.beerStyleName
    ? recipeDetail.recipe.beerStyleName
    : undefined;

  // Determine EBC for the BeerGlass header decoration:
  // 1. Use recipe's calculated EBC if available
  // 2. Fall back to selected beer style's midpoint EBC
  const headerEbc = useMemo((): number | null => {
    const recipeEbc = recipeDetail?.recipe?.ebc;
    if (recipeEbc != null) return Number(recipeEbc);

    const selectedStyleId = values.beerStyleId;
    if (selectedStyleId) {
      const style = beerStyles.find((s) => s.id === String(selectedStyleId));
      if (style?.ebcMin != null && style?.ebcMax != null) {
        return (Number(style.ebcMin) + Number(style.ebcMax)) / 2;
      }
    }
    return null;
  }, [recipeDetail, values.beerStyleId, beerStyles]);

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Snapshot banner — shown when editing a batch copy */}
      {isSnapshot && (
        <div className="flex items-center gap-2 rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-2 text-sm dark:border-yellow-700 dark:bg-yellow-950">
          <FlaskConical className="size-4 text-yellow-600 dark:text-yellow-400 shrink-0" />
          <span>
            {t("detail.snapshotBanner", { batchNumber })}
          </span>
        </div>
      )}
      <DetailView
        title={title}
        subtitle={subtitle}
        headerExtra={headerEbc !== null ? <BeerGlass ebc={headerEbc} size="sm" /> : undefined}
        backHref={backHref}
        actions={actions}
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        isLoading={!isNew && isLoading}
        onSave={() => {
          void handleSave();
        }}
        onCancel={handleCancel}
        saveLabel={t("detail.actions.save")}
        cancelLabel={t("detail.actions.cancel")}
      />
    </div>
  );
}
