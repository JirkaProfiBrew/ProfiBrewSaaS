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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { useShop } from "../hooks";
import { createShop, updateShop, deleteShop } from "../actions";
import type { ShopAddress, ShopSettings } from "../types";
import { getWarehouses } from "@/modules/warehouses/actions";

// ── Props ─────────────────────────────────────────────────────

interface ShopDetailProps {
  id: string;
}

// ── Helpers ────────────────────────────────────────────────────

function shopToFormValues(
  shop: {
    name: string;
    shopType: string;
    address: ShopAddress | null;
    isDefault: boolean;
    isActive: boolean;
  }
): Record<string, unknown> {
  return {
    name: shop.name,
    shopType: shop.shopType,
    street: shop.address?.street ?? "",
    city: shop.address?.city ?? "",
    zip: shop.address?.zip ?? "",
    country: shop.address?.country ?? "",
    isDefault: shop.isDefault,
    isActive: shop.isActive,
  };
}

function formValuesToAddress(values: Record<string, unknown>): ShopAddress | null {
  const street = typeof values.street === "string" ? values.street : "";
  const city = typeof values.city === "string" ? values.city : "";
  const zip = typeof values.zip === "string" ? values.zip : "";
  const country = typeof values.country === "string" ? values.country : "";

  if (!street && !city && !zip && !country) return null;

  return {
    street: street || undefined,
    city: city || undefined,
    zip: zip || undefined,
    country: country || undefined,
  };
}

function getDefaultValues(): Record<string, unknown> {
  return {
    name: "",
    shopType: "brewery",
    street: "",
    city: "",
    zip: "",
    country: "",
    isDefault: false,
    isActive: true,
  };
}

function getDefaultSettingsValues(): Record<string, unknown> {
  return {
    stock_mode: "none",
    default_warehouse_raw_id: "__none__",
    default_warehouse_beer_id: "__none__",
    ingredient_pricing_mode: "calc_price",
    beer_pricing_mode: "fixed",
    overhead_pct: "20",
    overhead_czk: "0",
    brew_cost_czk: "0",
  };
}

// ── Component ──────────────────────────────────────────────────

export function ShopDetail({ id }: ShopDetailProps): React.ReactNode {
  const t = useTranslations("shops");
  const tCommon = useTranslations("common");
  const router = useRouter();

  const isNew = id === "new";
  const mode: FormMode = isNew ? "create" : "edit";

  const { data: shop, isLoading } = useShop(isNew ? "" : id);

  const [values, setValues] = useState<Record<string, unknown>>(getDefaultValues());
  const [settingsValues, setSettingsValues] = useState<Record<string, unknown>>(getDefaultSettingsValues());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [warehouseOptions, setWarehouseOptions] = useState<{ value: string; label: string }[]>([]);

  // Load warehouse options for settings selects
  useEffect(() => {
    void getWarehouses({ isActive: true }).then((whs) =>
      setWarehouseOptions([
        { value: "__none__", label: "\u2014" },
        ...whs.map((w) => ({ value: w.id, label: `${w.code} \u2014 ${w.name}` })),
      ])
    );
  }, []);

  // Populate form when shop data loads
  useEffect(() => {
    if (shop) {
      setValues(shopToFormValues(shop));
      // Load settings from JSONB
      const s = shop.settings as ShopSettings;
      setSettingsValues({
        stock_mode: s.stock_mode ?? "none",
        default_warehouse_raw_id: s.default_warehouse_raw_id ?? "__none__",
        default_warehouse_beer_id: s.default_warehouse_beer_id ?? "__none__",
        ingredient_pricing_mode: s.ingredient_pricing_mode ?? "calc_price",
        beer_pricing_mode: s.beer_pricing_mode ?? "fixed",
        overhead_pct: String(s.overhead_pct ?? 20),
        overhead_czk: String(s.overhead_czk ?? 0),
        brew_cost_czk: String(s.brew_cost_czk ?? 0),
      });
    }
  }, [shop]);

  // ── Form section definitions ──────────────────────────────────

  const basicSection: FormSectionDef = useMemo(() => ({
    columns: 2,
    fields: [
      {
        key: "name",
        label: t("detail.fields.name"),
        type: "text",
        required: true,
      },
      {
        key: "shopType",
        label: t("detail.fields.shopType"),
        type: "select",
        required: true,
        options: [
          { value: "brewery", label: t("shopType.brewery") },
          { value: "taproom", label: t("shopType.taproom") },
          { value: "warehouse", label: t("shopType.warehouse") },
          { value: "office", label: t("shopType.office") },
        ],
      },
      {
        key: "street",
        label: t("detail.fields.street"),
        type: "text",
      },
      {
        key: "city",
        label: t("detail.fields.city"),
        type: "text",
      },
      {
        key: "zip",
        label: t("detail.fields.zip"),
        type: "text",
      },
      {
        key: "country",
        label: t("detail.fields.country"),
        type: "text",
        placeholder: "CZ",
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
    ],
  }), [t]);

  const stockModeSection: FormSectionDef = useMemo(() => ({
    title: t("settings.stockMode.title"),
    columns: 2,
    fields: [
      {
        key: "stock_mode",
        label: t("settings.stockMode.label"),
        type: "select",
        options: [
          { value: "none", label: t("settings.stockMode.none") },
          { value: "bulk", label: t("settings.stockMode.bulk") },
          { value: "packaged", label: t("settings.stockMode.packaged") },
        ],
      },
      {
        key: "default_warehouse_raw_id",
        label: t("settings.defaultWarehouseRaw"),
        type: "select",
        options: warehouseOptions,
      },
      {
        key: "default_warehouse_beer_id",
        label: t("settings.defaultWarehouseBeer"),
        type: "select",
        options: warehouseOptions,
      },
    ],
  }), [t, warehouseOptions]);

  const ingredientPricingSection: FormSectionDef = useMemo(() => ({
    title: t("settings.ingredientPricing.title"),
    columns: 1,
    fields: [
      {
        key: "ingredient_pricing_mode",
        label: t("settings.ingredientPricing.label"),
        type: "select",
        options: [
          { value: "calc_price", label: t("settings.ingredientPricing.calcPrice") },
          { value: "avg_stock", label: t("settings.ingredientPricing.avgStock") },
          { value: "last_purchase", label: t("settings.ingredientPricing.lastPurchase") },
        ],
      },
    ],
  }), [t]);

  const beerPricingSection: FormSectionDef = useMemo(() => ({
    title: t("settings.beerPricing.title"),
    columns: 1,
    fields: [
      {
        key: "beer_pricing_mode",
        label: t("settings.beerPricing.label"),
        type: "select",
        options: [
          { value: "fixed", label: t("settings.beerPricing.fixed") },
          { value: "recipe_calc", label: t("settings.beerPricing.recipeCalc") },
          { value: "actual_costs", label: t("settings.beerPricing.actualCosts") },
        ],
      },
    ],
  }), [t]);

  const calcInputsSection: FormSectionDef = useMemo(() => ({
    title: t("settings.calcInputs.title"),
    columns: 3,
    fields: [
      {
        key: "overhead_pct",
        label: t("settings.calcInputs.overheadPct"),
        type: "number",
        suffix: "%",
      },
      {
        key: "overhead_czk",
        label: t("settings.calcInputs.overheadCzk"),
        type: "currency",
        suffix: "CZK",
      },
      {
        key: "brew_cost_czk",
        label: t("settings.calcInputs.brewCostCzk"),
        type: "currency",
        suffix: "CZK",
      },
    ],
  }), [t]);

  // ── Handlers ─────────────────────────────────────────────────

  const handleChange = useCallback((key: string, value: unknown): void => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (prev[key]) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return prev;
    });
  }, []);

  const handleSettingsChange = useCallback((key: string, value: unknown): void => {
    setSettingsValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const handleSave = useCallback(async (): Promise<void> => {
    const newErrors: Record<string, string> = {};
    if (!values.name || (typeof values.name === "string" && values.name.trim() === "")) {
      newErrors.name = tCommon("validation.required");
    }
    if (!values.shopType) {
      newErrors.shopType = tCommon("validation.required");
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    try {
      const address = formValuesToAddress(values);

      // Build settings JSONB
      const settings: ShopSettings = {
        stock_mode: (settingsValues.stock_mode as ShopSettings["stock_mode"]) ?? "none",
        default_warehouse_raw_id:
          String(settingsValues.default_warehouse_raw_id) !== "__none__"
            ? String(settingsValues.default_warehouse_raw_id)
            : undefined,
        default_warehouse_beer_id:
          String(settingsValues.default_warehouse_beer_id) !== "__none__"
            ? String(settingsValues.default_warehouse_beer_id)
            : undefined,
        ingredient_pricing_mode:
          (settingsValues.ingredient_pricing_mode as ShopSettings["ingredient_pricing_mode"]) ?? "calc_price",
        beer_pricing_mode:
          (settingsValues.beer_pricing_mode as ShopSettings["beer_pricing_mode"]) ?? "fixed",
        overhead_pct: parseFloat(String(settingsValues.overhead_pct)) || 20,
        overhead_czk: parseFloat(String(settingsValues.overhead_czk)) || 0,
        brew_cost_czk: parseFloat(String(settingsValues.brew_cost_czk)) || 0,
      };

      const shopData = {
        name: String(values.name),
        shopType: String(values.shopType),
        address,
        isDefault: values.isDefault === true,
        isActive: values.isActive === true,
        settings,
      };

      if (isNew) {
        await createShop(shopData);
      } else {
        await updateShop(id, shopData);
      }
      toast.success(tCommon("saved"));
      router.push("/settings/shops");
    } catch (error) {
      console.error("Failed to save shop:", error);
      toast.error(tCommon("saveFailed"));
    }
  }, [values, settingsValues, isNew, id, router, tCommon]);

  const handleDelete = useCallback(async (): Promise<void> => {
    try {
      await deleteShop(id);
      toast.success(tCommon("deleted"));
      router.push("/settings/shops");
    } catch (error) {
      console.error("Failed to delete shop:", error);
      toast.error(tCommon("deleteFailed"));
    }
  }, [id, router, tCommon]);

  const handleCancel = useCallback((): void => {
    router.push("/settings/shops");
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

  const title = isNew ? t("detail.newTitle") : t("detail.title");

  return (
    <div className="flex flex-col gap-6 p-6">
      <DetailView
        title={title}
        backHref="/settings/shops"
        actions={actions}
        isLoading={!isNew && isLoading}
        onSave={() => {
          void handleSave();
        }}
        onCancel={handleCancel}
        saveLabel={t("detail.actions.save")}
        cancelLabel={t("detail.actions.cancel")}
      >
        {isNew ? (
          <FormSection
            section={basicSection}
            values={values}
            errors={errors}
            mode={mode}
            onChange={handleChange}
          />
        ) : (
          <Tabs defaultValue="basic" className="w-full">
            <TabsList>
              <TabsTrigger value="basic">{t("tabs.basic")}</TabsTrigger>
              <TabsTrigger value="parameters">{t("tabs.parameters")}</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="mt-4">
              <FormSection
                section={basicSection}
                values={values}
                errors={errors}
                mode={mode}
                onChange={handleChange}
              />
            </TabsContent>

            <TabsContent value="parameters" className="mt-4">
              <div className="flex flex-col gap-8">
                <FormSection
                  section={stockModeSection}
                  values={settingsValues}
                  errors={{}}
                  mode={mode}
                  onChange={handleSettingsChange}
                />
                <FormSection
                  section={ingredientPricingSection}
                  values={settingsValues}
                  errors={{}}
                  mode={mode}
                  onChange={handleSettingsChange}
                />
                <FormSection
                  section={beerPricingSection}
                  values={settingsValues}
                  errors={{}}
                  mode={mode}
                  onChange={handleSettingsChange}
                />
                <FormSection
                  section={calcInputsSection}
                  values={settingsValues}
                  errors={{}}
                  mode={mode}
                  onChange={handleSettingsChange}
                />
              </div>
            </TabsContent>
          </Tabs>
        )}
      </DetailView>
    </div>
  );
}
