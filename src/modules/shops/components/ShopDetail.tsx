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

import { useShop } from "../hooks";
import { createShop, updateShop, deleteShop } from "../actions";
import type { ShopAddress } from "../types";

// ── Props ─────────────────────────────────────────────────────

interface ShopDetailProps {
  id: string;
}

// ── Helpers ────────────────────────────────────────────────────

/** Decompose Shop data into flat form values. */
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

/** Compose flat form values back into an address JSONB object. */
function formValuesToAddress(values: Record<string, unknown>): ShopAddress | null {
  const street = typeof values.street === "string" ? values.street : "";
  const city = typeof values.city === "string" ? values.city : "";
  const zip = typeof values.zip === "string" ? values.zip : "";
  const country = typeof values.country === "string" ? values.country : "";

  // Return null if all address fields are empty
  if (!street && !city && !zip && !country) return null;

  return {
    street: street || undefined,
    city: city || undefined,
    zip: zip || undefined,
    country: country || undefined,
  };
}

// ── Default form values ────────────────────────────────────────

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

// ── Component ──────────────────────────────────────────────────

export function ShopDetail({ id }: ShopDetailProps): React.ReactNode {
  const t = useTranslations("shops");
  const tCommon = useTranslations("common");
  const router = useRouter();

  const isNew = id === "new";
  const mode: FormMode = isNew ? "create" : "edit";

  const { data: shop, isLoading } = useShop(isNew ? "" : id);

  const [values, setValues] = useState<Record<string, unknown>>(getDefaultValues());
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Populate form when shop data loads
  useEffect(() => {
    if (shop) {
      setValues(shopToFormValues(shop));
    }
  }, [shop]);

  // ── Form section definition ──────────────────────────────────

  const sectionDef: FormSectionDef = useMemo(() => ({
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

  // ── Handlers ─────────────────────────────────────────────────

  const handleChange = useCallback((key: string, value: unknown): void => {
    setValues((prev) => ({ ...prev, [key]: value }));
    // Clear error for the changed field
    setErrors((prev) => {
      if (prev[key]) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return prev;
    });
  }, []);

  const handleSave = useCallback(async (): Promise<void> => {
    // Basic validation
    const newErrors: Record<string, string> = {};
    if (!values.name || (typeof values.name === "string" && values.name.trim() === "")) {
      newErrors.name = t("detail.fields.name") + " is required";
    }
    if (!values.shopType) {
      newErrors.shopType = t("detail.fields.shopType") + " is required";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    try {
      const address = formValuesToAddress(values);
      const shopData = {
        name: String(values.name),
        shopType: String(values.shopType),
        address,
        isDefault: values.isDefault === true,
        isActive: values.isActive === true,
        settings: {},
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
  }, [values, isNew, id, router, t, tCommon]);

  const handleDelete = useCallback(async (): Promise<void> => {
    try {
      await deleteShop(id);
      router.push("/settings/shops");
    } catch (error) {
      console.error("Failed to delete shop:", error);
    }
  }, [id, router]);

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
