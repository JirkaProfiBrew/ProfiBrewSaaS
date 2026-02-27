"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────

interface RecipeExecutionSectionProps {
  isNew: boolean;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  values: Record<string, unknown>;
  errors: Record<string, string>;
  onChange: (key: string, value: unknown) => void;
  brewingSystemOptions: Array<{ value: string; label: string }>;
  mashingProfileOptions: Array<{ value: string; label: string }>;
  productionItemOptions: Array<{ value: string; label: string }>;
  onContinue?: () => void;
  // Computed display values for collapsed view
  systemName: string | null;
}

// ── Component ────────────────────────────────────────────────────

export function RecipeExecutionSection({
  isNew,
  isCollapsed,
  onToggleCollapse,
  values,
  errors,
  onChange,
  brewingSystemOptions,
  mashingProfileOptions,
  productionItemOptions,
  onContinue,
  systemName,
}: RecipeExecutionSectionProps): React.ReactNode {
  const t = useTranslations("recipes");

  // Collapsed summary text
  const collapsedSummary = useMemo(() => {
    const name = values.name ? String(values.name) : "\u2014";
    const system = systemName ?? t("designer.target.noSystem");
    return `${name} | ${system}`;
  }, [values.name, systemName, t]);

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
            {/* Name */}
            <div className="space-y-1.5">
              <Label htmlFor="target-name">{t("form.name")}</Label>
              <Input
                id="target-name"
                value={String(values.name ?? "")}
                onChange={(e) => onChange("name", e.target.value)}
                placeholder={t("form.name")}
                className={cn(errors.name && "border-destructive")}
              />
              {errors.name && (
                <p className="text-xs text-destructive">{errors.name}</p>
              )}
            </div>

            {/* Code */}
            <div className="space-y-1.5">
              <Label htmlFor="target-code">{t("form.code")}</Label>
              <Input
                id="target-code"
                value={String(values.code ?? "")}
                onChange={(e) => onChange("code", e.target.value)}
                placeholder={t("form.code")}
                disabled={!isNew}
              />
            </div>

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

            {/* Status */}
            <div className="space-y-1.5">
              <Label>{t("form.status")}</Label>
              <Select
                value={String(values.status ?? "draft")}
                onValueChange={(v) => onChange("status", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">{t("status.draft")}</SelectItem>
                  <SelectItem value="active">{t("status.active")}</SelectItem>
                  <SelectItem value="archived">
                    {t("status.archived")}
                  </SelectItem>
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

          {/* Continue button (only for new recipe) */}
          {isNew && onContinue && (
            <div className="mt-4 flex justify-end">
              <Button onClick={onContinue}>
                {t("designer.target.continue")}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
