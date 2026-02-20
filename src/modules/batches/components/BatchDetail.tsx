"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { DetailView } from "@/components/detail-view";
import { FormSection } from "@/components/forms";
import type { FormSectionDef, FormMode } from "@/components/forms";
import type { DetailViewTab, DetailViewAction } from "@/components/detail-view";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { useBatchDetail } from "../hooks";
import {
  createBatch,
  updateBatch,
  deleteBatch,
  getEquipmentOptions,
  getRecipeOptions,
} from "../actions";
import { BatchStatusBadge } from "./BatchStatusBadge";
import { BatchStatusTransition } from "./BatchStatusTransition";
import { BatchStepsTab } from "./BatchStepsTab";
import { BatchMeasurementsTab } from "./BatchMeasurementsTab";
import { BatchIngredientsTab } from "./BatchIngredientsTab";
import { BatchBottlingTab } from "./BatchBottlingTab";
import { BatchNotesTab } from "./BatchNotesTab";

// ── Component ──────────────────────────────────────────────────

interface BatchDetailProps {
  id: string;
}

export function BatchDetail({ id }: BatchDetailProps): React.ReactNode {
  const t = useTranslations("batches");
  const tCommon = useTranslations("common");
  const router = useRouter();

  const isNew = id === "new";
  const { data: batchDetail, isLoading, mutate } = useBatchDetail(id);

  // Options for selects
  const [equipmentOptions, setEquipmentOptions] = useState<
    Array<{ value: string; label: string }>
  >([]);
  const [recipeOptions, setRecipeOptions] = useState<
    Array<{ value: string; label: string }>
  >([]);

  // Load select options
  useEffect(() => {
    let cancelled = false;

    Promise.all([getEquipmentOptions(), getRecipeOptions()])
      .then(([eqOpts, recOpts]) => {
        if (!cancelled) {
          setEquipmentOptions(eqOpts);
          setRecipeOptions(recOpts);
        }
      })
      .catch((error: unknown) => {
        console.error("Failed to load options:", error);
      });

    return (): void => {
      cancelled = true;
    };
  }, []);

  // Form values
  const [values, setValues] = useState<Record<string, unknown>>({
    recipeId: null,
    itemId: null,
    plannedDate: null,
    equipmentId: null,
    notes: null,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState("overview");

  // Populate form when data loads (edit mode)
  useEffect(() => {
    if (batchDetail?.batch) {
      const b = batchDetail.batch;
      setValues({
        batchNumber: b.batchNumber,
        recipeId: b.recipeId,
        recipeName: b.recipeName,
        itemId: b.itemId,
        plannedDate: b.plannedDate
          ? new Date(b.plannedDate).toISOString().split("T")[0]
          : null,
        brewDate: b.brewDate
          ? new Date(b.brewDate).toISOString().split("T")[0]
          : null,
        equipmentId: b.equipmentId,
        actualVolumeL: b.actualVolumeL,
        ogActual: b.ogActual,
        fgActual: b.fgActual,
        abvActual: b.abvActual,
        notes: b.notes,
      });
    }
  }, [batchDetail]);

  const mode: FormMode = isNew ? "create" : "edit";

  // ── Create form section (new mode) ──────────────────────────

  const createFormSection: FormSectionDef = useMemo(
    () => ({
      title: t("detail.newTitle"),
      columns: 2,
      fields: [
        {
          key: "recipeId",
          label: t("form.recipe"),
          type: "select",
          options: recipeOptions,
          placeholder: t("form.recipePlaceholder"),
        },
        {
          key: "plannedDate",
          label: t("form.plannedDate"),
          type: "date",
        },
        {
          key: "equipmentId",
          label: t("form.equipment"),
          type: "select",
          options: equipmentOptions,
          placeholder: t("form.equipmentPlaceholder"),
        },
        {
          key: "notes",
          label: t("form.notes"),
          type: "textarea",
          gridSpan: 2,
        },
      ],
    }),
    [t, recipeOptions, equipmentOptions]
  );

  // ── Edit form section (overview tab) ────────────────────────

  const editFormSection: FormSectionDef = useMemo(
    () => ({
      title: t("tabs.overview"),
      columns: 2,
      fields: [
        {
          key: "batchNumber",
          label: t("form.batchNumber"),
          type: "text",
          disabled: true,
        },
        {
          key: "recipeName",
          label: t("form.recipe"),
          type: "text",
          disabled: true,
        },
        {
          key: "plannedDate",
          label: t("form.plannedDate"),
          type: "date",
        },
        {
          key: "brewDate",
          label: t("form.brewDate"),
          type: "date",
          disabled: true,
        },
        {
          key: "equipmentId",
          label: t("form.equipment"),
          type: "select",
          options: equipmentOptions,
          placeholder: t("form.equipmentPlaceholder"),
        },
        {
          key: "actualVolumeL",
          label: t("form.actualVolume"),
          type: "decimal",
          suffix: "L",
        },
        {
          key: "ogActual",
          label: t("form.ogActual"),
          type: "decimal",
          suffix: "°P",
        },
        {
          key: "fgActual",
          label: t("form.fgActual"),
          type: "decimal",
          disabled: true,
          suffix: "°P",
        },
        {
          key: "abvActual",
          label: t("form.abvActual"),
          type: "decimal",
          disabled: true,
          suffix: "%",
        },
        {
          key: "notes",
          label: t("form.notes"),
          type: "textarea",
          gridSpan: 2,
        },
      ],
    }),
    [t, equipmentOptions]
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

  const handleSave = useCallback(async (): Promise<void> => {
    try {
      if (isNew) {
        const result = await createBatch({
          recipeId: values.recipeId ? String(values.recipeId) : null,
          plannedDate: values.plannedDate ? String(values.plannedDate) : null,
          equipmentId: values.equipmentId
            ? String(values.equipmentId)
            : null,
          notes: values.notes ? String(values.notes) : null,
        });
        toast.success(tCommon("saved"));
        router.push(`/brewery/batches/${result.id}`);
      } else {
        await updateBatch(id, {
          itemId: values.itemId ? String(values.itemId) : null,
          plannedDate: values.plannedDate ? String(values.plannedDate) : null,
          equipmentId: values.equipmentId
            ? String(values.equipmentId)
            : null,
          actualVolumeL: values.actualVolumeL
            ? String(values.actualVolumeL)
            : null,
          ogActual: values.ogActual ? String(values.ogActual) : null,
          fgActual: values.fgActual ? String(values.fgActual) : null,
          notes: values.notes ? String(values.notes) : null,
        });
        toast.success(tCommon("saved"));
        mutate();
      }
    } catch (error: unknown) {
      console.error("Failed to save batch:", error);
      toast.error(tCommon("saveFailed"));
    }
  }, [isNew, id, values, router, tCommon, mutate]);

  const handleDelete = useCallback(async (): Promise<void> => {
    try {
      await deleteBatch(id);
      toast.success(t("detail.deleted"));
      router.push("/brewery/batches");
    } catch (error: unknown) {
      console.error("Failed to delete batch:", error);
      toast.error(t("detail.deleteError"));
    }
  }, [id, router, t]);

  const handleCancel = useCallback((): void => {
    router.push("/brewery/batches");
  }, [router]);

  const handleTransition = useCallback((): void => {
    mutate();
  }, [mutate]);

  // Header actions (only for edit mode)
  const actions: DetailViewAction[] = useMemo(() => {
    if (isNew) return [];
    return [
      {
        key: "delete",
        label: t("detail.actions.delete"),
        icon: Trash2,
        variant: "destructive" as const,
        onClick: () => {
          void handleDelete();
        },
      },
    ];
  }, [isNew, t, handleDelete]);

  // ── NEW mode ────────────────────────────────────────────────

  if (isNew) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <DetailView
          title={t("detail.newTitle")}
          backHref="/brewery/batches"
          isLoading={false}
          onSave={() => {
            void handleSave();
          }}
          onCancel={handleCancel}
          saveLabel={t("detail.actions.save")}
          cancelLabel={t("detail.actions.cancel")}
        >
          <FormSection
            section={createFormSection}
            values={values}
            errors={errors}
            mode={mode}
            onChange={handleChange}
          />
        </DetailView>
      </div>
    );
  }

  // ── EDIT mode ───────────────────────────────────────────────

  const batch = batchDetail?.batch;
  const title = batch
    ? `${batch.batchNumber}${batch.itemName ? ` — ${batch.itemName}` : ""}`
    : t("detail.title");

  return (
    <div className="flex flex-col gap-6 p-6">
      <DetailView
        title={title}
        subtitle={batch?.recipeName ?? undefined}
        backHref="/brewery/batches"
        actions={actions}
        isLoading={isLoading}
        onSave={() => {
          void handleSave();
        }}
        onCancel={handleCancel}
        saveLabel={t("detail.actions.save")}
        cancelLabel={t("detail.actions.cancel")}
      >
        {/* Status badge and transition buttons */}
        {batch && (
          <div className="flex items-center gap-3 mb-4">
            <BatchStatusBadge status={batch.status} />
            <BatchStatusTransition
              batchId={id}
              currentStatus={batch.status}
              onTransition={handleTransition}
            />
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList>
            <TabsTrigger value="overview">{t("tabs.overview")}</TabsTrigger>
            <TabsTrigger value="steps">{t("tabs.steps")}</TabsTrigger>
            <TabsTrigger value="measurements">
              {t("tabs.measurements")}
            </TabsTrigger>
            <TabsTrigger value="ingredients">
              {t("tabs.ingredients")}
            </TabsTrigger>
            <TabsTrigger value="bottling">{t("tabs.bottling")}</TabsTrigger>
            <TabsTrigger value="notes">{t("tabs.notes")}</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="mt-4">
            <FormSection
              section={editFormSection}
              values={values}
              errors={errors}
              mode={mode}
              onChange={handleChange}
            />
          </TabsContent>

          <TabsContent value="steps" className="mt-4">
            <BatchStepsTab
              batchId={id}
              steps={batchDetail?.steps ?? []}
              onMutate={mutate}
            />
          </TabsContent>

          <TabsContent value="measurements" className="mt-4">
            <BatchMeasurementsTab
              batchId={id}
              measurements={batchDetail?.measurements ?? []}
              onMutate={mutate}
            />
          </TabsContent>

          <TabsContent value="ingredients" className="mt-4">
            <BatchIngredientsTab
              recipeId={batch?.recipeId ?? null}
              sourceRecipeId={batch?.sourceRecipeId ?? null}
              sourceRecipeName={batch?.sourceRecipeName ?? null}
            />
          </TabsContent>

          <TabsContent value="bottling" className="mt-4">
            <BatchBottlingTab
              batchId={id}
              bottlingItems={batchDetail?.bottlingItems ?? []}
              actualVolumeL={batch?.actualVolumeL ?? null}
              onMutate={mutate}
            />
          </TabsContent>

          <TabsContent value="notes" className="mt-4">
            <BatchNotesTab
              batchId={id}
              notes={batchDetail?.notes ?? []}
              onMutate={mutate}
            />
          </TabsContent>
        </Tabs>
      </DetailView>
    </div>
  );
}
