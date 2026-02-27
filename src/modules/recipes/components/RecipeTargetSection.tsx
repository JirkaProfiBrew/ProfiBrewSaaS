"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ── Types ────────────────────────────────────────────────────────

interface RecipeExecutionSectionProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
  brewingSystemOptions: Array<{ value: string; label: string }>;
  mashingProfileOptions: Array<{ value: string; label: string }>;
  productionItemOptions: Array<{ value: string; label: string }>;
  // Computed display values for collapsed view
  systemName: string | null;
}

// ── Component ────────────────────────────────────────────────────

export function RecipeExecutionSection({
  isCollapsed,
  onToggleCollapse,
  values,
  onChange,
  brewingSystemOptions,
  mashingProfileOptions,
  productionItemOptions,
  systemName,
}: RecipeExecutionSectionProps): React.ReactNode {
  const t = useTranslations("recipes");

  // Collapsed summary text
  const collapsedSummary = useMemo(() => {
    const parts: string[] = [];
    if (systemName) parts.push(systemName);
    if (values.boilTimeMin) parts.push(`${values.boilTimeMin} min`);
    if (values.durationFermentationDays) {
      parts.push(`${t("form.fermentationDays")}: ${values.durationFermentationDays}d`);
    }
    if (values.durationConditioningDays) {
      parts.push(`${t("form.conditioningDays")}: ${values.durationConditioningDays}d`);
    }
    return parts.join(" | ") || t("designer.target.noSystem");
  }, [systemName, values.boilTimeMin, values.durationFermentationDays, values.durationConditioningDays, t]);

  return (
    <div>
      {/* Header — always visible, clickable to toggle */}
      <div
        role="button"
        tabIndex={0}
        onClick={onToggleCollapse}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggleCollapse();
          }
        }}
        className="flex items-center gap-3 cursor-pointer rounded-lg border bg-card p-4 hover:bg-accent/50 transition-colors"
      >
        {isCollapsed ? (
          <ChevronRight className="size-5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="size-5 text-muted-foreground shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold">
            {t("designer.execution.title")}
          </h2>
          {isCollapsed && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {collapsedSummary}
            </p>
          )}
        </div>
      </div>

      {/* Content — hidden when collapsed */}
      {!isCollapsed && (
        <div className="rounded-b-lg border border-t-0 bg-card p-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* Brewing System */}
            <div className="space-y-1.5">
              <Label>{t("form.brewingSystem")}</Label>
              <Select
                value={
                  values.brewingSystemId
                    ? String(values.brewingSystemId)
                    : "__none__"
                }
                onValueChange={(v) => onChange("brewingSystemId", v === "__none__" ? null : v)}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={t("form.brewingSystemPlaceholder")}
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">
                    {t("form.noBrewingSystem")}
                  </SelectItem>
                  {brewingSystemOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Mashing Profile */}
            <div className="space-y-1.5">
              <Label>{t("steps.loadProfile")}</Label>
              <Select
                value=""
                onValueChange={(v) => onChange("mashingProfileId", v || null)}
              >
                <SelectTrigger>
                  <SelectValue
                    placeholder={t("steps.dialog.selectProfile")}
                  />
                </SelectTrigger>
                <SelectContent>
                  {mashingProfileOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Production Item */}
            <div className="space-y-1.5">
              <Label>{t("form.itemId")}</Label>
              <Select
                value={values.itemId ? String(values.itemId) : ""}
                onValueChange={(v) => onChange("itemId", v || null)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("form.itemIdPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {productionItemOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Boil Time */}
            <div className="space-y-1.5">
              <Label htmlFor="target-boilTimeMin">
                {t("form.boilTime")}
              </Label>
              <Input
                id="target-boilTimeMin"
                type="number"
                value={
                  values.boilTimeMin != null
                    ? String(values.boilTimeMin)
                    : ""
                }
                onChange={(e) =>
                  onChange(
                    "boilTimeMin",
                    e.target.value ? Number(e.target.value) : null
                  )
                }
                placeholder="60"
              />
            </div>

            {/* Fermentation Days */}
            <div className="space-y-1.5">
              <Label htmlFor="target-fermentationDays">
                {t("form.fermentationDays")}
              </Label>
              <Input
                id="target-fermentationDays"
                type="number"
                value={
                  values.durationFermentationDays != null
                    ? String(values.durationFermentationDays)
                    : ""
                }
                onChange={(e) =>
                  onChange(
                    "durationFermentationDays",
                    e.target.value ? Number(e.target.value) : null
                  )
                }
                placeholder="0"
              />
            </div>

            {/* Conditioning Days */}
            <div className="space-y-1.5">
              <Label htmlFor="target-conditioningDays">
                {t("form.conditioningDays")}
              </Label>
              <Input
                id="target-conditioningDays"
                type="number"
                value={
                  values.durationConditioningDays != null
                    ? String(values.durationConditioningDays)
                    : ""
                }
                onChange={(e) =>
                  onChange(
                    "durationConditioningDays",
                    e.target.value ? Number(e.target.value) : null
                  )
                }
                placeholder="0"
              />
            </div>

            {/* Shelf Life */}
            <div className="space-y-1.5">
              <Label htmlFor="target-shelfLifeDays">
                {t("form.shelfLifeDays")}
              </Label>
              <Input
                id="target-shelfLifeDays"
                type="number"
                value={
                  values.shelfLifeDays != null
                    ? String(values.shelfLifeDays)
                    : ""
                }
                onChange={(e) =>
                  onChange(
                    "shelfLifeDays",
                    e.target.value ? Number(e.target.value) : null
                  )
                }
                placeholder="0"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
