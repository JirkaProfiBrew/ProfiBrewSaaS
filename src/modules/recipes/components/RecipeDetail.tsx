"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Copy, Archive, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { DetailView } from "@/components/detail-view";
import { FormSection } from "@/components/forms";
import type { FormSectionDef, FormMode } from "@/components/forms";
import type { DetailViewTab, DetailViewAction } from "@/components/detail-view";

import { useRecipeDetail, useBeerStyles } from "../hooks";
import {
  createRecipe,
  updateRecipe,
  deleteRecipe,
  permanentDeleteRecipe,
  duplicateRecipe,
} from "../actions";
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

  const isNew = id === "new";
  const { data: recipeDetail, isLoading, mutate } = useRecipeDetail(id);
  const { data: beerStyles } = useBeerStyles();

  const [values, setValues] = useState<Record<string, unknown>>({
    name: "",
    code: null,
    beerStyleId: null,
    status: "draft",
    batchSizeL: null,
    batchSizeBrutoL: null,
    beerVolumeL: null,
    boilTimeMin: null,
    durationFermentationDays: null,
    durationConditioningDays: null,
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
        status: r.status,
        batchSizeL: r.batchSizeL,
        batchSizeBrutoL: r.batchSizeBrutoL,
        beerVolumeL: r.beerVolumeL,
        boilTimeMin: r.boilTimeMin,
        durationFermentationDays: r.durationFermentationDays,
        durationConditioningDays: r.durationConditioningDays,
        notes: r.notes,
      });
    }
  }, [recipeDetail]);

  const mode: FormMode = isNew ? "create" : "edit";

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
          key: "notes",
          label: t("form.notes"),
          type: "textarea",
          gridSpan: 2,
          placeholder: t("form.notes"),
        },
      ],
    }),
    [t, isNew, beerStyleOptions]
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
          notes: values.notes ? String(values.notes) : null,
        });

        toast.success(tCommon("saved"));
        // Redirect to the newly created recipe detail
        router.push(`/brewery/recipes/${created.id}`);
      } else {
        await updateRecipe(id, {
          name: String(values.name),
          beerStyleId: values.beerStyleId ? String(values.beerStyleId) : null,
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
          notes: values.notes ? String(values.notes) : null,
        });

        toast.success(tCommon("saved"));
        mutate();
      }
    } catch (error: unknown) {
      console.error("Failed to save recipe:", error);
      toast.error(tCommon("saveFailed"));
    }
  }, [isNew, id, values, validate, router, tCommon, mutate]);

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
    router.push("/brewery/recipes");
  }, [router]);

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
        onClick: () => {
          void handleDelete();
        },
      });
    }

    return result;
  }, [isNew, t, handleDuplicate, handleArchive, handleDelete, recipeDetail]);

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

  return (
    <div className="flex flex-col gap-6 p-6">
      <DetailView
        title={title}
        subtitle={subtitle}
        backHref="/brewery/recipes"
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
