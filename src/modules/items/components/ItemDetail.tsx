"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Copy, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { DetailView } from "@/components/detail-view";
import { FormSection } from "@/components/forms";
import type { FormSectionDef, FormMode } from "@/components/forms";
import type { DetailViewAction } from "@/components/detail-view";
import { Alert, AlertDescription } from "@/components/ui/alert";

import { useItem } from "../hooks";
import {
  createItem,
  updateItem,
  deleteItem,
  duplicateItem,
  getProductionItemOptions,
} from "../actions";
import type { Item } from "../types";
import { useUnits } from "@/modules/units/hooks";
import { ALLOWED_UNITS, HAS_RECIPE_UNIT } from "@/modules/units/types";
import { ItemStockTab } from "./ItemStockTab";
import { ItemRecipesTab } from "./ItemRecipesTab";
import { ItemProductsTab } from "./ItemProductsTab";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

// ── Props ──────────────────────────────────────────────────────

interface ItemDetailProps {
  id: string;
  backHref: string;
}

// ── Component ──────────────────────────────────────────────────

export function ItemDetail({ id, backHref }: ItemDetailProps): React.ReactNode {
  const t = useTranslations("items");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const isNewItem = id === "new";

  const { item, isLoading } = useItem(isNewItem ? "" : id);
  const { units: allUnits } = useUnits();

  const mode: FormMode = isNewItem ? "create" : "edit";

  // ── Form State ─────────────────────────────────────────────
  const [values, setValues] = useState<Record<string, unknown>>({
    name: "",
    brand: null,
    isBrewMaterial: false,
    isProductionItem: false,
    isSaleItem: false,
    isExciseRelevant: false,
    stockCategory: null,
    issueMode: "fifo",
    unitId: null,
    recipeUnitId: null,
    baseUnitAmount: null,
    hasBaseItem: false,
    baseItemId: null,
    baseItemQuantity: null,
    materialType: null,
    alpha: null,
    ebc: null,
    extractPercent: null,
    packagingType: null,
    volumeL: null,
    abv: null,
    plato: null,
    ean: null,
    costPrice: null,
    avgPrice: null,
    salePrice: null,
    overheadManual: false,
    overheadPrice: null,
    packagingCost: null,
    fillingCost: null,
    posAvailable: false,
    webAvailable: false,
    color: null,
    imageUrl: null,
    notes: null,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [productionItemOptions, setProductionItemOptions] = useState<{ value: string; label: string; unitSymbol: string | null; costPrice: string | null }[]>([]);

  // Load production items for base-item select
  useEffect(() => {
    void getProductionItemOptions().then((opts) =>
      setProductionItemOptions([{ value: "__none__", label: "\u2014", unitSymbol: null, costPrice: null }, ...opts])
    );
  }, []);

  // Load item data into form when fetched
  useEffect(() => {
    if (item) {
      setValues({
        code: item.code,
        name: item.name,
        brand: item.brand,
        isBrewMaterial: item.isBrewMaterial,
        isProductionItem: item.isProductionItem,
        isSaleItem: item.isSaleItem,
        isExciseRelevant: item.isExciseRelevant,
        stockCategory: item.stockCategory,
        issueMode: item.issueMode,
        unitId: item.unitId,
        recipeUnitId: item.recipeUnitId,
        baseUnitAmount: item.baseUnitAmount,
        hasBaseItem: item.baseItemId !== null,
        baseItemId: item.baseItemId ?? "__none__",
        baseItemQuantity: item.baseItemQuantity,
        materialType: item.materialType,
        alpha: item.alpha,
        ebc: item.ebc,
        extractPercent: item.extractPercent,
        packagingType: item.packagingType,
        volumeL: item.volumeL,
        abv: item.abv,
        plato: item.plato,
        ean: item.ean,
        costPrice: item.costPrice,
        avgPrice: item.avgPrice,
        salePrice: item.salePrice,
        overheadManual: item.overheadManual,
        overheadPrice: item.overheadPrice,
        packagingCost: item.packagingCost,
        fillingCost: item.fillingCost,
        posAvailable: item.posAvailable,
        webAvailable: item.webAvailable,
        color: item.color,
        imageUrl: item.imageUrl,
        notes: item.notes,
      });
    }
  }, [item]);

  // ── Handlers ───────────────────────────────────────────────
  const handleChange = useCallback((key: string, value: unknown): void => {
    setValues((prev) => {
      const next = { ...prev, [key]: value };

      // When hasBaseItem toggle is turned off, clear base item fields
      if (key === "hasBaseItem" && value === false) {
        next.baseItemId = "__none__";
        next.baseItemQuantity = null;
      }

      // Comma → dot for baseItemQuantity decimal input
      if (key === "baseItemQuantity" && typeof value === "string") {
        next.baseItemQuantity = value.replace(",", ".");
      }

      // Auto-set unit defaults when materialType changes
      if (key === "materialType" && allUnits.length > 0) {
        const mt = value as string;
        const kgUnit = allUnits.find((u) => u.code === "kg");
        const gUnit = allUnits.find((u) => u.code === "g");

        if (mt === "malt" || mt === "grain") {
          next.unitId = kgUnit?.id ?? null;
          next.recipeUnitId = null;
        } else if (mt === "hop") {
          next.unitId = kgUnit?.id ?? null;
          next.recipeUnitId = gUnit?.id ?? null;
        } else if (mt === "yeast") {
          next.unitId = gUnit?.id ?? null;
          next.recipeUnitId = null;
        } else if (mt === "adjunct") {
          next.unitId = kgUnit?.id ?? null;
          next.recipeUnitId = null;
        } else {
          next.unitId = kgUnit?.id ?? null;
          next.recipeUnitId = null;
        }
      }

      return next;
    });
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, [allUnits]);

  const handleSave = useCallback(async (): Promise<void> => {
    // Basic validation
    const newErrors: Record<string, string> = {};
    if (!values.name || (typeof values.name === "string" && values.name.trim() === "")) {
      newErrors.name = t("detail.fields.name") + " is required";
    }

    // Validate base item fields when hasBaseItem is true
    if (values.hasBaseItem === true) {
      if (!values.baseItemId || values.baseItemId === "__none__") {
        newErrors.baseItemId = t("detail.fields.baseItemId") + " is required";
      }
      if (!values.baseItemQuantity || String(values.baseItemQuantity).trim() === "") {
        newErrors.baseItemQuantity = t("detail.fields.baseItemQuantity") + " is required";
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    // Resolve base item fields: null out when toggle is off, normalize comma→dot
    const resolvedBaseItemId = values.hasBaseItem && String(values.baseItemId) !== "__none__"
      ? (values.baseItemId as string)
      : null;
    const rawQty = values.hasBaseItem && values.baseItemQuantity != null
      ? String(values.baseItemQuantity)
      : null;
    const resolvedBaseItemQuantity = rawQty ? rawQty.replace(",", ".") : null;

    setIsSaving(true);
    try {
      if (isNewItem) {
        await createItem({
          name: values.name as string,
          brand: (values.brand as string | null) ?? null,
          isBrewMaterial: (values.isBrewMaterial as boolean) ?? false,
          isProductionItem: (values.isProductionItem as boolean) ?? false,
          isSaleItem: (values.isSaleItem as boolean) ?? false,
          isExciseRelevant: (values.isExciseRelevant as boolean) ?? false,
          stockCategory: (values.stockCategory as string | null) ?? null,
          issueMode: (values.issueMode as string) ?? "fifo",
          unitId: (values.unitId as string | null) ?? null,
          recipeUnitId: (values.recipeUnitId as string | null) ?? null,
          baseUnitAmount: (values.baseUnitAmount as string | null) ?? null,
          baseItemId: resolvedBaseItemId,
          baseItemQuantity: resolvedBaseItemQuantity,
          materialType: (values.materialType as string | null) ?? null,
          alpha: (values.alpha as string | null) ?? null,
          ebc: (values.ebc as string | null) ?? null,
          extractPercent: (values.extractPercent as string | null) ?? null,
          packagingType: (values.packagingType as string | null) ?? null,
          volumeL: (values.volumeL as string | null) ?? null,
          abv: (values.abv as string | null) ?? null,
          plato: (values.plato as string | null) ?? null,
          ean: (values.ean as string | null) ?? null,
          costPrice: (values.costPrice as string | null) ?? null,
          salePrice: (values.salePrice as string | null) ?? null,
          overheadManual: (values.overheadManual as boolean) ?? false,
          overheadPrice: (values.overheadPrice as string | null) ?? null,
          packagingCost: (values.packagingCost as string | null) ?? null,
          fillingCost: (values.fillingCost as string | null) ?? null,
          posAvailable: (values.posAvailable as boolean) ?? false,
          webAvailable: (values.webAvailable as boolean) ?? false,
          color: (values.color as string | null) ?? null,
          imageUrl: (values.imageUrl as string | null) ?? null,
          notes: (values.notes as string | null) ?? null,
          isActive: true,
          isFromLibrary: false,
        });
      } else {
        await updateItem(id, {
          name: values.name as string,
          brand: (values.brand as string | null) ?? null,
          isBrewMaterial: (values.isBrewMaterial as boolean) ?? false,
          isProductionItem: (values.isProductionItem as boolean) ?? false,
          isSaleItem: (values.isSaleItem as boolean) ?? false,
          isExciseRelevant: (values.isExciseRelevant as boolean) ?? false,
          stockCategory: (values.stockCategory as string | null) ?? null,
          issueMode: (values.issueMode as string) ?? "fifo",
          unitId: (values.unitId as string | null) ?? null,
          recipeUnitId: (values.recipeUnitId as string | null) ?? null,
          baseUnitAmount: (values.baseUnitAmount as string | null) ?? null,
          baseItemId: resolvedBaseItemId,
          baseItemQuantity: resolvedBaseItemQuantity,
          materialType: (values.materialType as string | null) ?? null,
          alpha: (values.alpha as string | null) ?? null,
          ebc: (values.ebc as string | null) ?? null,
          extractPercent: (values.extractPercent as string | null) ?? null,
          packagingType: (values.packagingType as string | null) ?? null,
          volumeL: (values.volumeL as string | null) ?? null,
          abv: (values.abv as string | null) ?? null,
          plato: (values.plato as string | null) ?? null,
          ean: (values.ean as string | null) ?? null,
          costPrice: (values.costPrice as string | null) ?? null,
          salePrice: (values.salePrice as string | null) ?? null,
          overheadManual: (values.overheadManual as boolean) ?? false,
          overheadPrice: (values.overheadPrice as string | null) ?? null,
          packagingCost: (values.packagingCost as string | null) ?? null,
          fillingCost: (values.fillingCost as string | null) ?? null,
          posAvailable: (values.posAvailable as boolean) ?? false,
          webAvailable: (values.webAvailable as boolean) ?? false,
          color: (values.color as string | null) ?? null,
          imageUrl: (values.imageUrl as string | null) ?? null,
          notes: (values.notes as string | null) ?? null,
        });
      }
      toast.success(tCommon("saved"));
      router.push(backHref);
    } catch (error) {
      console.error("Failed to save item:", error);
      toast.error(tCommon("saveFailed"));
    } finally {
      setIsSaving(false);
    }
  }, [id, isNewItem, values, backHref, router, tCommon]);

  const handleDelete = useCallback(async (): Promise<void> => {
    if (isNewItem) return;
    try {
      await deleteItem(id);
      router.push(backHref);
    } catch (error) {
      console.error("Failed to delete item:", error);
    }
  }, [id, isNewItem, backHref, router]);

  const handleDuplicate = useCallback(async (): Promise<void> => {
    if (isNewItem) return;
    try {
      const duplicated = await duplicateItem(id);
      router.push(`${backHref}/${duplicated.id}`);
    } catch (error) {
      console.error("Failed to duplicate item:", error);
    }
  }, [id, isNewItem, backHref, router]);

  const handleCancel = useCallback((): void => {
    router.push(backHref);
  }, [backHref, router]);

  // ── Computed Options ───────────────────────────────────────

  const unitOptions = useMemo(() => {
    const materialType = values.materialType as string | null;
    const allowedCodes = materialType && ALLOWED_UNITS[materialType]
      ? ALLOWED_UNITS[materialType]
      : ALLOWED_UNITS["other"] ?? [];

    return allUnits
      .filter((u) => allowedCodes.includes(u.code))
      .map((u) => ({
        value: u.id,
        label: `${u.symbol} — ${u.nameCs}`,
      }));
  }, [allUnits, values.materialType]);

  // Compute dynamic label for baseItemQuantity based on selected base item's unit
  const baseItemQuantityLabel = useMemo(() => {
    const selectedId = values.baseItemId as string | null;
    if (selectedId && selectedId !== "__none__") {
      const selected = productionItemOptions.find((o) => o.value === selectedId);
      if (selected?.unitSymbol) {
        return t("detail.fields.baseItemQuantityWithUnit", { unit: selected.unitSymbol });
      }
    }
    return t("detail.fields.baseItemQuantity");
  }, [values.baseItemId, productionItemOptions, t]);

  // Computed packaged item cost
  const calculatedPackagedCost = useMemo(() => {
    const baseItemId = values.baseItemId as string | null;
    const baseQty = parseFloat(String(values.baseItemQuantity ?? "")) || 0;
    const pkgCost = parseFloat(String(values.packagingCost ?? "")) || 0;
    const fillCost = parseFloat(String(values.fillingCost ?? "")) || 0;

    if (!baseItemId || baseItemId === "__none__" || baseQty <= 0) return null;

    const baseItem = productionItemOptions.find((o) => o.value === baseItemId);
    const beerCostPerUnit = baseItem?.costPrice ? parseFloat(baseItem.costPrice) : 0;

    const beerCost = Math.round(beerCostPerUnit * baseQty * 100) / 100;
    const total = Math.round((beerCost + pkgCost + fillCost) * 100) / 100;

    return { beerCostPerUnit, baseQty, beerCost, pkgCost, fillCost, total };
  }, [values.baseItemId, values.baseItemQuantity, values.packagingCost, values.fillingCost, productionItemOptions]);

  // ── Form Sections ──────────────────────────────────────────

  const sections: FormSectionDef[] = useMemo(
    () => [
      // Section 1: Basic info
      {
        title: t("detail.sections.basic"),
        columns: 2,
        fields: [
          {
            key: "code",
            label: t("detail.fields.code"),
            type: "text",
            disabled: true,
          },
          {
            key: "name",
            label: t("detail.fields.name"),
            type: "text",
            required: true,
          },
          {
            key: "brand",
            label: t("detail.fields.brand"),
            type: "text",
          },
        ],
      },
      // Section 2: Flags
      {
        title: t("detail.sections.flags"),
        columns: 4,
        fields: [
          {
            key: "isBrewMaterial",
            label: t("detail.fields.isBrewMaterial"),
            type: "toggle",
          },
          {
            key: "isProductionItem",
            label: t("detail.fields.isProductionItem"),
            type: "toggle",
          },
          {
            key: "isSaleItem",
            label: t("detail.fields.isSaleItem"),
            type: "toggle",
          },
          {
            key: "isExciseRelevant",
            label: t("detail.fields.isExciseRelevant"),
            type: "toggle",
          },
        ],
      },
      // Section 3: Stock
      {
        title: t("detail.sections.stock"),
        columns: 2,
        fields: [
          {
            key: "stockCategory",
            label: t("detail.fields.stockCategory"),
            type: "select",
            options: [
              { value: "raw_material", label: t("stockCategory.raw_material") },
              { value: "finished_product", label: t("stockCategory.finished_product") },
              { value: "packaging", label: t("stockCategory.packaging") },
              { value: "other", label: t("stockCategory.other") },
            ],
          },
          {
            key: "issueMode",
            label: t("detail.fields.issueMode"),
            type: "select",
            helpText: t("issueModeHelp.description"),
            options: [
              { value: "fifo", label: t("issueMode.fifo") },
              { value: "manual_lot", label: t("issueMode.manual_lot") },
            ],
          },
          {
            key: "unitId",
            label: t("detail.fields.unit"),
            type: "select",
            options: unitOptions,
            placeholder: t("units.selectUnit"),
            disabled: values.materialType === "malt" || values.materialType === "grain",
          },
          {
            key: "recipeUnitId",
            label: t("detail.fields.recipeUnit"),
            type: "select",
            options: unitOptions,
            placeholder: t("units.selectUnit"),
            visible: (v: Record<string, unknown>) => {
              const mt = v.materialType as string | null;
              return mt !== null && HAS_RECIPE_UNIT.includes(mt);
            },
          },
          {
            key: "baseUnitAmount",
            label: t("detail.fields.baseUnitAmount"),
            type: "decimal",
          },
        ],
      },
      // Section 4: Material (visible only if isBrewMaterial)
      {
        title: t("detail.sections.material"),
        columns: 2,
        fields: [
          {
            key: "materialType",
            label: t("detail.fields.materialType"),
            type: "select",
            visible: (v: Record<string, unknown>) => v.isBrewMaterial === true,
            options: [
              { value: "malt", label: t("materialType.malt") },
              { value: "hop", label: t("materialType.hop") },
              { value: "yeast", label: t("materialType.yeast") },
              { value: "adjunct", label: t("materialType.adjunct") },
              { value: "other", label: t("materialType.other") },
            ],
          },
          {
            key: "alpha",
            label: t("detail.fields.alpha"),
            type: "decimal",
            suffix: "%",
            visible: (v: Record<string, unknown>) =>
              v.isBrewMaterial === true && v.materialType === "hop",
          },
          {
            key: "ebc",
            label: t("detail.fields.ebc"),
            type: "decimal",
            visible: (v: Record<string, unknown>) =>
              v.isBrewMaterial === true && v.materialType === "malt",
          },
          {
            key: "extractPercent",
            label: t("detail.fields.extractPercent"),
            type: "decimal",
            suffix: "%",
            visible: (v: Record<string, unknown>) =>
              v.isBrewMaterial === true && v.materialType === "malt",
          },
        ],
      },
      // Section 5: Product (visible only if isSaleItem)
      {
        title: t("detail.sections.product"),
        columns: 2,
        fields: [
          {
            key: "packagingType",
            label: t("detail.fields.packagingType"),
            type: "select",
            visible: (v: Record<string, unknown>) => v.isSaleItem === true,
            options: [
              { value: "keg_30", label: "KEG 30l" },
              { value: "keg_50", label: "KEG 50l" },
              { value: "bottle_500", label: "Lahev 500ml" },
              { value: "bottle_330", label: "Lahev 330ml" },
              { value: "can_500", label: "Plechovka 500ml" },
              { value: "can_330", label: "Plechovka 330ml" },
            ],
          },
          {
            key: "volumeL",
            label: t("detail.fields.volumeL"),
            type: "decimal",
            suffix: "l",
            visible: (v: Record<string, unknown>) => v.isSaleItem === true,
          },
          {
            key: "abv",
            label: t("detail.fields.abv"),
            type: "decimal",
            suffix: "%",
            visible: (v: Record<string, unknown>) => v.isSaleItem === true,
          },
          {
            key: "plato",
            label: t("detail.fields.plato"),
            type: "decimal",
            suffix: "°P",
            visible: (v: Record<string, unknown>) => v.isSaleItem === true,
          },
          {
            key: "ean",
            label: t("detail.fields.ean"),
            type: "text",
            visible: (v: Record<string, unknown>) => v.isSaleItem === true,
          },
          {
            key: "hasBaseItem",
            label: t("detail.fields.hasBaseItem"),
            type: "toggle",
            visible: (v: Record<string, unknown>) => v.isSaleItem === true,
          },
        ],
      },
      // Section 6: Base Item (visible only if hasBaseItem)
      {
        title: t("detail.sections.baseItem"),
        columns: 2,
        fields: [
          {
            key: "baseItemId",
            label: t("detail.fields.baseItemId"),
            type: "select",
            options: productionItemOptions,
            visible: (v: Record<string, unknown>) => v.hasBaseItem === true,
            required: true,
            helpText: t("detail.fields.baseItemHelp"),
          },
          {
            key: "baseItemQuantity",
            label: baseItemQuantityLabel,
            type: "decimal",
            visible: (v: Record<string, unknown>) =>
              v.hasBaseItem === true && v.baseItemId !== null && v.baseItemId !== "__none__",
            required: true,
            helpText: t("detail.fields.baseItemQuantityHelp"),
          },
        ],
      },
      // Section 7: Pricing
      {
        title: t("detail.sections.pricing"),
        columns: 2,
        fields: [
          {
            key: "costPrice",
            label: t("detail.fields.costPrice"),
            type: "currency",
            suffix: "CZK",
          },
          // avgPrice removed — shown per-warehouse on Stock tab
          {
            key: "packagingCost",
            label: t("detail.fields.packagingCost"),
            type: "currency",
            suffix: "CZK",
            visible: (v: Record<string, unknown>) =>
              v.isSaleItem === true && v.baseItemId != null && v.baseItemId !== "__none__",
          },
          {
            key: "fillingCost",
            label: t("detail.fields.fillingCost"),
            type: "currency",
            suffix: "CZK",
            visible: (v: Record<string, unknown>) =>
              v.isSaleItem === true && v.baseItemId != null && v.baseItemId !== "__none__",
          },
          {
            key: "salePrice",
            label: t("detail.fields.salePrice"),
            type: "currency",
            suffix: "CZK",
          },
          {
            key: "overheadManual",
            label: t("detail.fields.overheadManual"),
            type: "toggle",
          },
          {
            key: "overheadPrice",
            label: t("detail.fields.overheadPrice"),
            type: "currency",
            suffix: "CZK",
            visible: (v: Record<string, unknown>) => v.overheadManual === true,
          },
        ],
      },
      // Section 8: POS / Web
      {
        title: t("detail.sections.pos"),
        columns: 2,
        fields: [
          {
            key: "posAvailable",
            label: t("detail.fields.posAvailable"),
            type: "toggle",
          },
          {
            key: "webAvailable",
            label: t("detail.fields.webAvailable"),
            type: "toggle",
          },
          {
            key: "color",
            label: t("detail.fields.color"),
            type: "color",
          },
        ],
      },
      // Section 9: Meta
      {
        title: t("detail.sections.meta"),
        columns: 1,
        fields: [
          {
            key: "notes",
            label: t("detail.fields.notes"),
            type: "textarea",
            gridSpan: 1,
          },
          {
            key: "imageUrl",
            label: t("detail.fields.imageUrl"),
            type: "text",
          },
        ],
      },
    ],
    [t, unitOptions, values.materialType, productionItemOptions, baseItemQuantityLabel]
  );

  // ── Actions ────────────────────────────────────────────────

  const detailActions: DetailViewAction[] = useMemo(() => {
    if (isNewItem) return [];
    return [
      {
        key: "duplicate",
        label: t("detail.actions.duplicate"),
        icon: Copy,
        variant: "outline" as const,
        onClick: () => {
          void handleDuplicate();
        },
      },
      {
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
      },
    ];
  }, [isNewItem, t, tCommon, handleDuplicate, handleDelete]);

  // ── Title ──────────────────────────────────────────────────

  const title = isNewItem
    ? t("detail.newTitle")
    : (item?.name ?? tCommon("loading"));

  const subtitle = !isNewItem && item?.code ? item.code : undefined;

  // ── Render ─────────────────────────────────────────────────

  return (
    <div className="p-6">
      <DetailView
        title={title}
        subtitle={subtitle}
        backHref={backHref}
        actions={detailActions}
        isLoading={!isNewItem && isLoading}
        onSave={() => {
          void handleSave();
        }}
        onCancel={handleCancel}
        saveLabel={
          isSaving ? tCommon("loading") : t("detail.actions.save")
        }
        cancelLabel={t("detail.actions.cancel")}
      >
        {isNewItem ? (
          <div className="flex flex-col gap-8">
            {sections.map((section, index) => {
              const hasVisibleFields = section.fields.some((field) => {
                if (field.visible === undefined) return true;
                if (typeof field.visible === "function") return field.visible(values);
                return field.visible;
              });

              if (!hasVisibleFields) return null;

              return (
                <FormSection
                  key={section.title ?? index}
                  section={section}
                  values={values}
                  errors={errors}
                  mode={mode}
                  onChange={handleChange}
                />
              );
            })}
            {calculatedPackagedCost && (
              <Alert>
                <AlertDescription>
                  <span className="font-medium">{t("detail.fields.calculatedCost")}:</span>{" "}
                  {t("detail.fields.calculatedCostFormula", {
                    beerCost: calculatedPackagedCost.beerCost.toFixed(2),
                    pkgCost: calculatedPackagedCost.pkgCost.toFixed(2),
                    fillCost: calculatedPackagedCost.fillCost.toFixed(2),
                    total: calculatedPackagedCost.total.toFixed(2),
                  })}
                </AlertDescription>
              </Alert>
            )}
          </div>
        ) : (
          <Tabs defaultValue="detail" className="w-full">
            <TabsList>
              <TabsTrigger value="detail">
                {t("detail.sections.basic")}
              </TabsTrigger>
              {values.isProductionItem === true && (
                <>
                  <TabsTrigger value="recipes">{t("tabs.recipes")}</TabsTrigger>
                  <TabsTrigger value="products">{t("tabs.products")}</TabsTrigger>
                </>
              )}
              <TabsTrigger value="stock">
                {t("stockTab.title")}
              </TabsTrigger>
            </TabsList>
            <TabsContent value="detail" className="mt-4">
              <div className="flex flex-col gap-8">
                {sections.map((section, index) => {
                  const hasVisibleFields = section.fields.some((field) => {
                    if (field.visible === undefined) return true;
                    if (typeof field.visible === "function") return field.visible(values);
                    return field.visible;
                  });

                  if (!hasVisibleFields) return null;

                  return (
                    <FormSection
                      key={section.title ?? index}
                      section={section}
                      values={values}
                      errors={errors}
                      mode={mode}
                      onChange={handleChange}
                    />
                  );
                })}
                {calculatedPackagedCost && (
                  <Alert>
                    <AlertDescription>
                      <span className="font-medium">{t("detail.fields.calculatedCost")}:</span>{" "}
                      {t("detail.fields.calculatedCostFormula", {
                        beerCost: calculatedPackagedCost.beerCost.toFixed(2),
                        pkgCost: calculatedPackagedCost.pkgCost.toFixed(2),
                        fillCost: calculatedPackagedCost.fillCost.toFixed(2),
                        total: calculatedPackagedCost.total.toFixed(2),
                      })}
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            </TabsContent>
            {values.isProductionItem === true && (
              <>
                <TabsContent value="recipes" className="mt-4">
                  <ItemRecipesTab itemId={id} />
                </TabsContent>
                <TabsContent value="products" className="mt-4">
                  <ItemProductsTab itemId={id} />
                </TabsContent>
              </>
            )}
            <TabsContent value="stock" className="mt-4">
              <ItemStockTab itemId={id} />
            </TabsContent>
          </Tabs>
        )}
      </DetailView>
    </div>
  );
}
