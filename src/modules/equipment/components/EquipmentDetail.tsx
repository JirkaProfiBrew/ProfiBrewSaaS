"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { DetailView } from "@/components/detail-view";
import { FormSection } from "@/components/forms";
import type { FormSectionDef, FormMode } from "@/components/forms";
import type { DetailViewAction } from "@/components/detail-view";

import { useEquipmentItem } from "../hooks";
import { createEquipment, updateEquipment, deleteEquipment } from "../actions";

// ── Component ──────────────────────────────────────────────────

interface EquipmentDetailProps {
  id: string;
}

export function EquipmentDetail({ id }: EquipmentDetailProps): React.ReactNode {
  const t = useTranslations("equipment");
  const tCommon = useTranslations("common");
  const router = useRouter();

  const isNew = id === "new";
  const { data: equipmentItem, isLoading } = useEquipmentItem(id);

  const [values, setValues] = useState<Record<string, unknown>>({
    name: "",
    equipmentType: "",
    volumeL: null,
    shopId: null,
    status: "available",
    notes: null,
    isActive: true,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Populate form when data loads
  useEffect(() => {
    if (equipmentItem) {
      setValues({
        name: equipmentItem.name,
        equipmentType: equipmentItem.equipmentType,
        volumeL: equipmentItem.volumeL,
        shopId: equipmentItem.shopId,
        status: equipmentItem.status,
        notes: equipmentItem.notes,
        isActive: equipmentItem.isActive,
      });
    }
  }, [equipmentItem]);

  const mode: FormMode = isNew ? "create" : "edit";

  // Form section definition
  const formSection: FormSectionDef = useMemo(
    () => ({
      title: isNew ? t("detail.newTitle") : t("detail.title"),
      columns: 2,
      fields: [
        {
          key: "name",
          label: t("detail.fields.name"),
          type: "text",
          required: true,
          placeholder: t("detail.fields.name"),
        },
        {
          key: "equipmentType",
          label: t("detail.fields.equipmentType"),
          type: "select",
          required: true,
          options: [
            { value: "brewhouse", label: t("equipmentType.brewhouse") },
            { value: "fermenter", label: t("equipmentType.fermenter") },
            { value: "brite_tank", label: t("equipmentType.brite_tank") },
            { value: "conditioning", label: t("equipmentType.conditioning") },
            {
              value: "bottling_line",
              label: t("equipmentType.bottling_line"),
            },
            { value: "keg_washer", label: t("equipmentType.keg_washer") },
          ],
        },
        {
          key: "volumeL",
          label: t("detail.fields.volumeL"),
          type: "decimal",
          suffix: "l",
          placeholder: "0",
        },
        {
          key: "shopId",
          label: t("detail.fields.shopId"),
          type: "text",
          placeholder: t("detail.fields.shopId"),
          helpText: t("detail.fields.shopIdHelp"),
        },
        {
          key: "status",
          label: t("detail.fields.status"),
          type: "select",
          options: [
            { value: "available", label: t("status.available") },
            { value: "in_use", label: t("status.in_use") },
            { value: "maintenance", label: t("status.maintenance") },
            { value: "retired", label: t("status.retired") },
          ],
        },
        {
          key: "isActive",
          label: t("detail.fields.isActive"),
          type: "toggle",
        },
        {
          key: "notes",
          label: t("detail.fields.notes"),
          type: "textarea",
          gridSpan: 2,
          placeholder: t("detail.fields.notes"),
        },
      ],
    }),
    [t, isNew]
  );

  const handleChange = useCallback(
    (key: string, value: unknown): void => {
      setValues((prev) => ({ ...prev, [key]: value }));
      // Clear error when field changes
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
    if (!values.equipmentType || String(values.equipmentType).trim() === "") {
      newErrors.equipmentType = tCommon("validation.required");
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [values, tCommon]);

  const handleSave = useCallback(async (): Promise<void> => {
    if (!validate()) return;

    try {
      if (isNew) {
        await createEquipment({
          name: String(values.name),
          equipmentType: String(values.equipmentType),
          volumeL: values.volumeL ? String(values.volumeL) : null,
          shopId: values.shopId ? String(values.shopId) : null,
          status: String(values.status ?? "available"),
          properties: {},
          notes: values.notes ? String(values.notes) : null,
          isActive: values.isActive !== false,
        });
      } else {
        await updateEquipment(id, {
          name: String(values.name),
          equipmentType: String(values.equipmentType),
          volumeL: values.volumeL ? String(values.volumeL) : null,
          shopId: values.shopId ? String(values.shopId) : null,
          status: String(values.status ?? "available"),
          properties: {},
          notes: values.notes ? String(values.notes) : null,
          isActive: values.isActive !== false,
        });
      }

      toast.success(tCommon("saved"));
      router.push("/brewery/equipment");
    } catch (error: unknown) {
      console.error("Failed to save equipment:", error);
      toast.error(tCommon("saveFailed"));
    }
  }, [isNew, id, values, validate, router, tCommon]);

  const handleDelete = useCallback(async (): Promise<void> => {
    try {
      await deleteEquipment(id);
      router.push("/brewery/equipment");
    } catch (error: unknown) {
      console.error("Failed to delete equipment:", error);
    }
  }, [id, router]);

  const handleCancel = useCallback((): void => {
    router.push("/brewery/equipment");
  }, [router]);

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

  const title = isNew
    ? t("detail.newTitle")
    : equipmentItem?.name ?? t("detail.title");

  return (
    <div className="flex flex-col gap-6 p-6">
      <DetailView
        title={title}
        backHref="/brewery/equipment"
        actions={actions}
        isLoading={!isNew && isLoading}
        onSave={() => {
          void handleSave();
        }}
        onCancel={handleCancel}
        saveLabel={t("detail.actions.save")}
        cancelLabel={t("detail.actions.cancel")}
      >
        <FormSection
          section={formSection}
          values={values}
          errors={errors}
          mode={mode}
          onChange={handleChange}
        />
      </DetailView>
    </div>
  );
}
