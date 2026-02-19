"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Trash2, Plus, X } from "lucide-react";
import { toast } from "sonner";

import { DetailView } from "@/components/detail-view";
import { FormSection } from "@/components/forms";
import type { FormSectionDef, FormMode } from "@/components/forms";
import type { DetailViewAction } from "@/components/detail-view";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { useMaterialLotDetail } from "../hooks";
import {
  createMaterialLot,
  updateMaterialLot,
  deleteMaterialLot,
  getBrewMaterialOptions,
  getSupplierOptions,
} from "../actions";
import { LotTraceabilityView } from "./LotTraceabilityView";

// ── Props ──────────────────────────────────────────────────────

interface LotDetailProps {
  id: string;
}

// ── Default values ─────────────────────────────────────────────

function getDefaultValues(): Record<string, unknown> {
  return {
    lotNumber: "",
    itemId: "__none__",
    supplierId: "__none__",
    receivedDate: new Date().toISOString().split("T")[0],
    expiryDate: "",
    quantityInitial: "",
    quantityRemaining: "",
    unitPrice: "",
    notes: "",
  };
}

// ── Component ──────────────────────────────────────────────────

export function LotDetail({ id }: LotDetailProps): React.ReactNode {
  const t = useTranslations("materialLots");
  const tCommon = useTranslations("common");
  const router = useRouter();

  const isNew = id === "new";
  const mode: FormMode = isNew ? "create" : "edit";

  const { data: lot, isLoading } = useMaterialLotDetail(isNew ? "" : id);

  const [values, setValues] = useState<Record<string, unknown>>(getDefaultValues());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [properties, setProperties] = useState<Array<{ key: string; value: string }>>([]);

  // Select options
  const [itemOptions, setItemOptions] = useState<{ value: string; label: string }[]>([]);
  const [supplierOptions, setSupplierOptions] = useState<{ value: string; label: string }[]>([]);

  // Load select options
  useEffect(() => {
    void getBrewMaterialOptions().then((opts) =>
      setItemOptions([{ value: "__none__", label: "—" }, ...opts])
    );
    void getSupplierOptions().then((opts) =>
      setSupplierOptions([{ value: "__none__", label: "—" }, ...opts])
    );
  }, []);

  // Populate form when lot data loads
  useEffect(() => {
    if (lot) {
      setValues({
        lotNumber: lot.lotNumber,
        itemId: lot.itemId ?? "__none__",
        supplierId: lot.supplierId ?? "__none__",
        receivedDate: lot.receivedDate ?? "",
        expiryDate: lot.expiryDate ?? "",
        quantityInitial: lot.quantityInitial ?? "",
        quantityRemaining: lot.quantityRemaining ?? "",
        unitPrice: lot.unitPrice ?? "",
        notes: lot.notes ?? "",
      });
      // Convert properties object to array of key-value pairs
      if (lot.properties && typeof lot.properties === "object") {
        const entries = Object.entries(lot.properties).map(([key, value]) => ({
          key,
          value: String(value),
        }));
        setProperties(entries.length > 0 ? entries : []);
      }
    }
  }, [lot]);

  // ── Form section definitions ──────────────────────────────────

  const basicSection: FormSectionDef = useMemo(
    () => ({
      columns: 2,
      fields: [
        {
          key: "lotNumber",
          label: t("form.lotNumber"),
          type: "text",
          required: true,
        },
        {
          key: "itemId",
          label: t("form.item"),
          type: "select",
          required: true,
          options: itemOptions,
          disabled: !isNew,
        },
        {
          key: "supplierId",
          label: t("form.supplier"),
          type: "select",
          options: supplierOptions,
        },
        {
          key: "receivedDate",
          label: t("form.receivedDate"),
          type: "date",
        },
        {
          key: "expiryDate",
          label: t("form.expiryDate"),
          type: "date",
        },
        {
          key: "quantityInitial",
          label: t("form.quantityInitial"),
          type: "number",
          disabled: !isNew,
        },
        {
          key: "quantityRemaining",
          label: t("form.quantityRemaining"),
          type: "number",
          disabled: true,
        },
        {
          key: "unitPrice",
          label: t("form.unitPrice"),
          type: "number",
        },
        {
          key: "notes",
          label: t("form.notes"),
          type: "textarea",
          colSpan: 2,
        },
      ],
    }),
    [t, isNew, itemOptions, supplierOptions]
  );

  // ── Handlers ──────────────────────────────────────────────────

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

  const handleAddProperty = useCallback((): void => {
    setProperties((prev) => [...prev, { key: "", value: "" }]);
  }, []);

  const handleRemoveProperty = useCallback((index: number): void => {
    setProperties((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handlePropertyChange = useCallback(
    (index: number, field: "key" | "value", newValue: string): void => {
      setProperties((prev) =>
        prev.map((p, i) => (i === index ? { ...p, [field]: newValue } : p))
      );
    },
    []
  );

  const handleSave = useCallback(async (): Promise<void> => {
    const newErrors: Record<string, string> = {};
    if (!values.lotNumber || String(values.lotNumber).trim() === "") {
      newErrors.lotNumber = tCommon("validation.required");
    }
    if (!values.itemId || String(values.itemId) === "__none__") {
      newErrors.itemId = tCommon("validation.required");
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    // Convert properties array back to object
    const propsObj: Record<string, string> = {};
    for (const p of properties) {
      if (p.key.trim()) {
        propsObj[p.key.trim()] = p.value;
      }
    }

    try {
      if (isNew) {
        await createMaterialLot({
          lotNumber: String(values.lotNumber),
          itemId: String(values.itemId),
          supplierId: String(values.supplierId) !== "__none__" ? String(values.supplierId) : null,
          receivedDate: String(values.receivedDate) || null,
          expiryDate: String(values.expiryDate) || null,
          quantityInitial: String(values.quantityInitial) || null,
          quantityRemaining: String(values.quantityInitial) || null,
          unitPrice: String(values.unitPrice) || null,
          properties: Object.keys(propsObj).length > 0 ? propsObj : null,
          notes: String(values.notes) || null,
        });
      } else {
        await updateMaterialLot(id, {
          lotNumber: String(values.lotNumber),
          supplierId: String(values.supplierId) !== "__none__" ? String(values.supplierId) : null,
          receivedDate: String(values.receivedDate) || null,
          expiryDate: String(values.expiryDate) || null,
          unitPrice: String(values.unitPrice) || null,
          properties: Object.keys(propsObj).length > 0 ? propsObj : null,
          notes: String(values.notes) || null,
        });
      }
      toast.success(t("detail.saved"));
      router.push("/stock/tracking");
    } catch (error) {
      console.error("Failed to save material lot:", error);
      toast.error(t("detail.saveFailed"));
    }
  }, [values, properties, isNew, id, router, t, tCommon]);

  const handleDelete = useCallback(async (): Promise<void> => {
    try {
      await deleteMaterialLot(id);
      toast.success(t("detail.deleted"));
      router.push("/stock/tracking");
    } catch (error) {
      console.error("Failed to delete material lot:", error);
      toast.error(t("detail.deleteFailed"));
    }
  }, [id, router, t]);

  const handleCancel = useCallback((): void => {
    router.push("/stock/tracking");
  }, [router]);

  // ── Actions ───────────────────────────────────────────────────

  const actions: DetailViewAction[] = useMemo(() => {
    if (isNew) return [];
    return [
      {
        key: "delete",
        label: tCommon("delete"),
        icon: Trash2,
        variant: "destructive",
        onClick: () => {
          void handleDelete();
        },
      },
    ];
  }, [isNew, tCommon, handleDelete]);

  // ── Render ────────────────────────────────────────────────────

  const title = isNew ? t("detail.newTitle") : lot?.lotNumber ?? t("detail.title");

  return (
    <div className="flex flex-col gap-6 p-6">
      <DetailView
        title={title}
        backHref="/stock/tracking"
        actions={actions}
        isLoading={!isNew && isLoading}
        onSave={() => {
          void handleSave();
        }}
        onCancel={handleCancel}
        saveLabel={tCommon("save")}
        cancelLabel={tCommon("cancel")}
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
              <TabsTrigger value="properties">{t("tabs.properties")}</TabsTrigger>
              <TabsTrigger value="traceability">{t("tabs.traceability")}</TabsTrigger>
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

            <TabsContent value="properties" className="mt-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium">{t("properties.title")}</h3>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAddProperty}
                  >
                    <Plus className="mr-1 h-4 w-4" />
                    {t("properties.addProperty")}
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  {t("properties.examples")}
                </p>

                {properties.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    {t("properties.noProperties")}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {properties.map((prop, index) => (
                      <div key={index} className="flex items-end gap-2">
                        <div className="flex-1">
                          {index === 0 && (
                            <Label className="mb-1 text-xs">{t("properties.key")}</Label>
                          )}
                          <Input
                            value={prop.key}
                            onChange={(e) =>
                              handlePropertyChange(index, "key", e.target.value)
                            }
                            placeholder={t("properties.key")}
                          />
                        </div>
                        <div className="flex-1">
                          {index === 0 && (
                            <Label className="mb-1 text-xs">{t("properties.value")}</Label>
                          )}
                          <Input
                            value={prop.value}
                            onChange={(e) =>
                              handlePropertyChange(index, "value", e.target.value)
                            }
                            placeholder={t("properties.value")}
                          />
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveProperty(index)}
                          className="h-9 w-9 shrink-0"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="traceability" className="mt-4">
              <LotTraceabilityView lotId={id} />
            </TabsContent>
          </Tabs>
        )}
      </DetailView>
    </div>
  );
}
