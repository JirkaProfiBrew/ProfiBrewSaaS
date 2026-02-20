"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Settings2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

// ── Props ───────────────────────────────────────────────────────

interface LotAttributesSectionProps {
  materialType: string | null;
  lotAttributes: Record<string, unknown>;
  isDraft: boolean;
  onUpdate: (attrs: Record<string, unknown>) => void;
}

// ── Field config per material type ──────────────────────────────

interface FieldDef {
  key: string;
  labelKey: string;
}

const MATERIAL_FIELDS: Record<string, FieldDef[]> = {
  malt: [
    { key: "extractPercent", labelKey: "lines.lotAttr.extractPercent" },
    { key: "moisture", labelKey: "lines.lotAttr.moisture" },
  ],
  hop: [
    { key: "cropYear", labelKey: "lines.lotAttr.cropYear" },
    { key: "actualAlpha", labelKey: "lines.lotAttr.actualAlpha" },
  ],
  yeast: [
    { key: "generation", labelKey: "lines.lotAttr.generation" },
    { key: "viability", labelKey: "lines.lotAttr.viability" },
  ],
};

// ── Component ───────────────────────────────────────────────────

export function LotAttributesSection({
  materialType,
  lotAttributes,
  isDraft,
  onUpdate,
}: LotAttributesSectionProps): React.ReactNode {
  const t = useTranslations("stockIssues");

  const fields = materialType ? MATERIAL_FIELDS[materialType] : undefined;
  if (!fields) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          type="button"
        >
          <Settings2 className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64" align="end">
        <h4 className="mb-3 text-sm font-semibold">
          {t("lines.lotAttr.title")}
        </h4>
        <div className="flex flex-col gap-3">
          {fields.map((field) => (
            <LotAttrField
              key={field.key}
              fieldKey={field.key}
              label={t(field.labelKey as Parameters<typeof t>[0])}
              value={lotAttributes[field.key]}
              isDraft={isDraft}
              lotAttributes={lotAttributes}
              onUpdate={onUpdate}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── Individual Field ────────────────────────────────────────────

interface LotAttrFieldProps {
  fieldKey: string;
  label: string;
  value: unknown;
  isDraft: boolean;
  lotAttributes: Record<string, unknown>;
  onUpdate: (attrs: Record<string, unknown>) => void;
}

function LotAttrField({
  fieldKey,
  label,
  value,
  isDraft,
  lotAttributes,
  onUpdate,
}: LotAttrFieldProps): React.ReactNode {
  const [localValue, setLocalValue] = useState<string>(
    value != null ? String(value) : ""
  );

  const handleBlur = useCallback((): void => {
    const numVal = localValue === "" ? undefined : Number(localValue);
    const currentVal = lotAttributes[fieldKey];

    // Only update if value actually changed
    if (numVal !== currentVal) {
      const updated = { ...lotAttributes, [fieldKey]: numVal };
      // Remove undefined values
      if (numVal === undefined) {
        delete updated[fieldKey];
      }
      onUpdate(updated);
    }
  }, [localValue, lotAttributes, fieldKey, onUpdate]);

  if (!isDraft) {
    return (
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        <span className="text-sm">{localValue || "\u2014"}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        step="any"
        className="h-8"
        value={localValue}
        onChange={(e) => {
          setLocalValue(e.target.value);
        }}
        onBlur={handleBlur}
      />
    </div>
  );
}
