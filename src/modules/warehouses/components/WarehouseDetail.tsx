"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { DetailView } from "@/components/detail-view";
import { FormSection } from "@/components/forms";
import type { FormSectionDef, FormMode } from "@/components/forms";
import type { DetailViewAction } from "@/components/detail-view";

import { useWarehouseItem } from "../hooks";
import {
  createWarehouse,
  updateWarehouse,
  deleteWarehouse,
} from "../actions";
import { useShops } from "@/modules/shops/hooks";
import { WAREHOUSE_CATEGORIES } from "../types";

// ── Props ─────────────────────────────────────────────────────

interface WarehouseDetailProps {
  id: string;
}

// ── Helpers ────────────────────────────────────────────────────

/** Convert categories array to individual toggle values. */
function categoriesToFormValues(
  categories: string[] | null
): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const cat of WAREHOUSE_CATEGORIES) {
    result[`cat_${cat}`] = categories?.includes(cat) ?? false;
  }
  return result;
}

/** Collect category toggle values back into an array. */
function formValuesToCategories(
  values: Record<string, unknown>
): string[] | null {
  const selected: string[] = [];
  for (const cat of WAREHOUSE_CATEGORIES) {
    if (values[`cat_${cat}`] === true) {
      selected.push(cat);
    }
  }
  return selected.length > 0 ? selected : null;
}

/** Default form values for a new warehouse. */
function getDefaultValues(): Record<string, unknown> {
  return {
    code: "",
    name: "",
    shopId: "__none__",
    isExciseRelevant: false,
    isDefault: false,
    isActive: true,
    ...categoriesToFormValues(null),
  };
}

// ── Component ──────────────────────────────────────────────────

export function WarehouseDetail({
  id,
}: WarehouseDetailProps): React.ReactNode {
  const t = useTranslations("warehouses");
  const tCommon = useTranslations("common");
  const router = useRouter();

  const isNew = id === "new";
  const mode: FormMode = isNew ? "create" : "edit";

  const { data: warehouse, isLoading } = useWarehouseItem(isNew ? "" : id);
  const { data: shopList } = useShops();

  const [values, setValues] =
    useState<Record<string, unknown>>(getDefaultValues());
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Populate form when warehouse data loads
  useEffect(() => {
    if (warehouse) {
      setValues({
        code: warehouse.code,
        name: warehouse.name,
        shopId: warehouse.shopId ?? "__none__",
        isExciseRelevant: warehouse.isExciseRelevant,
        isDefault: warehouse.isDefault,
        isActive: warehouse.isActive,
        ...categoriesToFormValues(warehouse.categories),
      });
    }
  }, [warehouse]);

  // Shop options for select field
  const shopOptions = useMemo(
    () => [
      { value: "__none__", label: t("detail.fields.noShop") },
      ...shopList.map((shop) => ({
        value: shop.id,
        label: shop.name,
      })),
    ],
    [shopList, t]
  );

  // Category label map
  const categoryLabels: Record<string, string> = useMemo(
    () => ({
      suroviny: t("categories.suroviny"),
      pivo: t("categories.pivo"),
      obaly: t("categories.obaly"),
      sluzby: t("categories.sluzby"),
      ostatni: t("categories.ostatni"),
    }),
    [t]
  );

  // Form section definition
  const sectionDef: FormSectionDef = useMemo(
    () => ({
      columns: 2,
      fields: [
        {
          key: "code",
          label: t("detail.fields.code"),
          type: "text",
          required: true,
          disabled: !isNew,
          helpText: !isNew ? t("detail.fields.codeReadonly") : undefined,
        },
        {
          key: "name",
          label: t("detail.fields.name"),
          type: "text",
          required: true,
        },
        {
          key: "shopId",
          label: t("detail.fields.shopId"),
          type: "select",
          required: true,
          options: shopOptions,
        },
        {
          key: "isExciseRelevant",
          label: t("detail.fields.isExciseRelevant"),
          type: "toggle",
        },
        {
          key: "isDefault",
          label: t("detail.fields.isDefault"),
          type: "toggle",
        },
        {
          key: "isActive",
          label: t("detail.fields.isActive"),
          type: "toggle",
        },
        // Category toggles
        ...WAREHOUSE_CATEGORIES.map((cat) => ({
          key: `cat_${cat}`,
          label: categoryLabels[cat] ?? cat,
          type: "toggle" as const,
        })),
      ],
    }),
    [t, isNew, shopOptions, categoryLabels]
  );

  // ── Handlers ─────────────────────────────────────────────────

  const handleChange = useCallback(
    (key: string, value: unknown): void => {
      setValues((prev) => ({ ...prev, [key]: value }));
      setErrors((prev) => {
        if (prev[key]) {
          const next = { ...prev };
          delete next[key];
          return next;
        }
        return prev;
      });
    },
    []
  );

  const handleSave = useCallback(async (): Promise<void> => {
    const newErrors: Record<string, string> = {};
    if (
      !values.code ||
      (typeof values.code === "string" && values.code.trim() === "")
    ) {
      newErrors.code = tCommon("validation.required");
    }
    if (
      !values.name ||
      (typeof values.name === "string" && values.name.trim() === "")
    ) {
      newErrors.name = tCommon("validation.required");
    }
    if (!values.shopId || String(values.shopId) === "__none__") {
      newErrors.shopId = t("detail.fields.shopRequired");
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    try {
      const categories = formValuesToCategories(values);
      const warehouseData = {
        code: String(values.code),
        name: String(values.name),
        shopId: values.shopId && String(values.shopId) !== "__none__" ? String(values.shopId) : null,
        isExciseRelevant: values.isExciseRelevant === true,
        categories,
        isDefault: values.isDefault === true,
        isActive: values.isActive === true,
      };

      if (isNew) {
        const result = await createWarehouse(warehouseData);
        if ("error" in result && result.error === "DUPLICATE_CODE") {
          setErrors({ code: t("detail.fields.codeDuplicate") });
          toast.error(t("detail.fields.codeDuplicate"));
          return;
        }
      } else {
        await updateWarehouse(id, {
          name: warehouseData.name,
          shopId: warehouseData.shopId,
          isExciseRelevant: warehouseData.isExciseRelevant,
          categories: warehouseData.categories,
          isDefault: warehouseData.isDefault,
          isActive: warehouseData.isActive,
        });
      }
      toast.success(tCommon("saved"));
      router.push("/settings/warehouses");
    } catch (error) {
      console.error("Failed to save warehouse:", error);
      toast.error(tCommon("saveFailed"));
    }
  }, [values, isNew, id, router, t, tCommon]);

  const handleDelete = useCallback(async (): Promise<void> => {
    try {
      const result = await deleteWarehouse(id);
      if ("error" in result) {
        const errorKey = ({
          HAS_STOCK_ISSUES: "deleteHasStockIssues",
          HAS_ORDERS: "deleteHasOrders",
          HAS_SHOP_SETTINGS: "deleteHasShopSettings",
        } as Record<string, string>)[result.error] ?? "deleteFailed";
        toast.error(t(`detail.fields.${errorKey}` as Parameters<typeof t>[0]));
        return;
      }
      toast.success(tCommon("deleted"));
      router.push("/settings/warehouses");
    } catch (error) {
      console.error("Failed to delete warehouse:", error);
      toast.error(tCommon("deleteFailed"));
    }
  }, [id, router, t, tCommon]);

  const handleCancel = useCallback((): void => {
    router.push("/settings/warehouses");
  }, [router]);

  // ── Actions ──────────────────────────────────────────────────

  const actions: DetailViewAction[] = useMemo(() => {
    if (isNew) return [];

    return [
      {
        key: "delete",
        label: t("detail.actions.delete"),
        icon: Trash2,
        variant: "destructive",
        onClick: () => {
          void handleDelete();
        },
      },
    ];
  }, [isNew, t, handleDelete]);

  // ── Render ───────────────────────────────────────────────────

  const title = isNew
    ? t("detail.newTitle")
    : warehouse?.name ?? t("detail.title");

  return (
    <div className="flex flex-col gap-6 p-6">
      <DetailView
        title={title}
        backHref="/settings/warehouses"
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
          section={sectionDef}
          values={values}
          errors={errors}
          mode={mode}
          onChange={handleChange}
        />
      </DetailView>
    </div>
  );
}
