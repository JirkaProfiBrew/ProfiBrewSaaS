"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { BeerGlass } from "@/components/ui/beer-glass";
import { ebcToColor } from "@/components/ui/beer-glass/ebc-to-color";
import { cn } from "@/lib/utils";
import { DesignSlider } from "./DesignSlider";

// ── Types ────────────────────────────────────────────────────────

interface DesignValues {
  beerStyleId: string | null;
  batchSizeL: number;
  og: number;
  fg: number;
  targetIbu: number;
  targetEbc: number;
  waterPerKgMalt: number;
}

// ── Metric Box (collapsed summary) ──────────────────────────────

type MetricVariant = "ok" | "warn" | "danger" | "neutral";

const VARIANT_CLASSES: Record<MetricVariant, string> = {
  ok: "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/40",
  warn: "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40",
  danger: "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/40",
  neutral: "border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/40",
};

function MetricBox({
  value,
  label,
  variant = "neutral",
  ebcColor,
}: {
  value: string;
  label: string;
  variant?: MetricVariant;
  ebcColor?: string;
}): React.ReactElement {
  return (
    <div
      className={cn("border rounded-lg px-3 py-1.5 text-center min-w-[80px]", VARIANT_CLASSES[variant])}
      style={ebcColor ? { borderLeftWidth: "4px", borderLeftColor: ebcColor } : undefined}
    >
      <div className="text-sm font-semibold tabular-nums leading-tight">{value}</div>
      <div className="text-[10px] text-muted-foreground leading-tight">{label}</div>
    </div>
  );
}

function getMetricVariant(
  calcValue: number,
  range: [number, number] | null,
): MetricVariant {
  if (!range) return "neutral";
  const [min, max] = range;
  if (calcValue >= min && calcValue <= max) return "ok";
  const span = max - min;
  const distance = calcValue < min ? min - calcValue : calcValue - max;
  if (distance <= span * 0.15) return "warn";
  return "danger";
}

interface RecipeDesignSectionProps {
  isNew: boolean;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  values: DesignValues;
  onChange: (key: keyof DesignValues, value: unknown) => void;
  beerStyleOptions: Array<{ value: string; label: string }>;
  styleRanges: {
    og: [number, number] | null;
    fg: [number, number] | null;
    ibu: [number, number] | null;
    ebc: [number, number] | null;
  };
  // Calculated values from ingredients (for markers on sliders)
  calcOg: number;
  calcIbu: number;
  calcEbc: number;
  // Name + Status (moved from Execution section)
  name: string;
  status: string;
  onNameChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  nameError?: string;
  styleName: string | null;
  onContinue?: () => void;
}

// ── Helpers ──────────────────────────────────────────────────────

function platoToSG(plato: number): string {
  if (plato <= 0) return "1.000";
  const sg = 1 + plato / (258.6 - 227.1 * (plato / 258.2));
  return sg.toFixed(3);
}

// ── Component ────────────────────────────────────────────────────

export function RecipeDesignSection({
  isNew,
  isCollapsed,
  onToggleCollapse,
  values,
  onChange,
  beerStyleOptions,
  styleRanges,
  calcOg,
  calcIbu,
  calcEbc,
  name,
  status,
  onNameChange,
  onStatusChange,
  nameError,
  styleName,
  onContinue,
}: RecipeDesignSectionProps): React.ReactNode {
  const t = useTranslations("recipes");

  // ABV computed from OG and FG (Balling formula)
  const designAbv = useMemo(() => {
    if (values.og <= 0) return 0;
    const divisor = 2.0665 - 0.010665 * values.og;
    if (divisor <= 0) return 0;
    return (values.og - values.fg) / divisor;
  }, [values.og, values.fg]);

  // SG displays for OG and FG
  const ogSG = useMemo(() => platoToSG(values.og), [values.og]);
  const fgSG = useMemo(() => platoToSG(values.fg), [values.fg]);

  // Metric variants for collapsed view (based on calc values vs style ranges)
  const ogVariant = useMemo(() => getMetricVariant(calcOg > 0 ? calcOg : values.og, styleRanges.og), [calcOg, values.og, styleRanges.og]);
  const ibuVariant = useMemo(() => getMetricVariant(calcIbu > 0 ? calcIbu : values.targetIbu, styleRanges.ibu), [calcIbu, values.targetIbu, styleRanges.ibu]);
  const ebcVariant = useMemo(() => getMetricVariant(calcEbc > 0 ? calcEbc : values.targetEbc, styleRanges.ebc), [calcEbc, values.targetEbc, styleRanges.ebc]);

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
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">
              {t("designer.design.title")}
            </h2>
            {isCollapsed && name && (
              <span className="text-xs text-muted-foreground truncate">{name}</span>
            )}
            {isCollapsed && styleName && (
              <span className="text-xs text-muted-foreground truncate">· {styleName}</span>
            )}
          </div>
          {isCollapsed && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              <MetricBox value={`${values.batchSizeL} L`} label={t("designer.design.batchSizeLabel")} />
              <MetricBox value={`${values.og.toFixed(1)} °P`} label="OG" variant={ogVariant} />
              <MetricBox value={`${values.fg.toFixed(1)} °P`} label="FG" />
              <MetricBox value={`${values.targetIbu}`} label="IBU" variant={ibuVariant} />
              <MetricBox
                value={`${values.targetEbc}`}
                label="EBC"
                variant={ebcVariant}
                ebcColor={values.targetEbc > 0 ? ebcToColor(values.targetEbc) : undefined}
              />
              <MetricBox value={designAbv > 0 ? `${designAbv.toFixed(1)}%` : "—"} label="ABV" />
            </div>
          )}
        </div>
      </div>

      {/* Content — hidden when collapsed */}
      {!isCollapsed && (
        <div className="rounded-b-lg border border-t-0 bg-card p-4 space-y-4">
          {/* Row 1: Name + Status + Beer Style + Batch Size */}
          <div className="grid grid-cols-1 sm:grid-cols-[2fr_auto_3fr_auto] gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="design-name">{t("form.name")}</Label>
              <Input
                id="design-name"
                value={name}
                onChange={(e) => onNameChange(e.target.value)}
                placeholder={t("form.name")}
                className={cn(nameError && "border-destructive")}
              />
              {nameError && (
                <p className="text-xs text-destructive">{nameError}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>{t("form.status")}</Label>
              <Select value={status} onValueChange={onStatusChange}>
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

            <div className="space-y-1.5 min-w-0">
              <Label>{t("form.beerStyle")}</Label>
              <Select
                value={values.beerStyleId ?? "__none__"}
                onValueChange={(v) =>
                  onChange("beerStyleId", v === "__none__" ? null : v)
                }
              >
                <SelectTrigger className="truncate">
                  <SelectValue placeholder={t("form.beerStyle")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">
                    {t("designer.design.noStyle")}
                  </SelectItem>
                  {beerStyleOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="design-batchSize">
                {t("designer.design.batchSize")}
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="design-batchSize"
                  type="number"
                  value={values.batchSizeL || ""}
                  onChange={(e) =>
                    onChange(
                      "batchSizeL",
                      e.target.value ? Number(e.target.value) : 0
                    )
                  }
                  placeholder="0"
                  step="1"
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">
                  {t("designer.design.batchSizeUnit")}
                </span>
              </div>
            </div>
          </div>

          {/* OG Slider */}
          <DesignSlider
            label={t("designer.design.ogLabel")}
            value={values.og}
            onChange={(v) => onChange("og", v)}
            min={0}
            max={30}
            step={0.1}
            styleRange={styleRanges.og}
            unit={t("designer.design.ogUnit")}
            secondary={
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                ({ogSG} SG)
              </span>
            }
            calculatedValue={calcOg > 0 ? calcOg : undefined}
          />

          {/* FG Slider */}
          <DesignSlider
            label={t("designer.design.fgLabel")}
            value={values.fg}
            onChange={(v) => onChange("fg", v)}
            min={0}
            max={15}
            step={0.1}
            styleRange={styleRanges.fg}
            unit={t("designer.design.fgUnit")}
            secondary={
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                ({fgSG} SG)
              </span>
            }
          />

          {/* IBU Slider */}
          <DesignSlider
            label={t("designer.design.ibuLabel")}
            value={values.targetIbu}
            onChange={(v) => onChange("targetIbu", v)}
            min={0}
            max={120}
            step={1}
            styleRange={styleRanges.ibu}
            calculatedValue={calcIbu > 0 ? calcIbu : undefined}
          />

          {/* EBC Slider */}
          <DesignSlider
            label={t("designer.design.ebcLabel")}
            value={values.targetEbc}
            onChange={(v) => onChange("targetEbc", v)}
            min={2}
            max={80}
            step={1}
            styleRange={styleRanges.ebc}
            secondary={
              values.targetEbc > 0 ? (
                <BeerGlass ebc={values.targetEbc} size="sm" />
              ) : undefined
            }
            calculatedValue={calcEbc > 0 ? calcEbc : undefined}
          />

          {/* Water/malt slider (UX-06) */}
          <DesignSlider
            label={t("designer.design.waterPerKgLabel")}
            value={values.waterPerKgMalt}
            onChange={(v) => onChange("waterPerKgMalt", v)}
            min={1.5}
            max={6.0}
            step={0.1}
            styleRange={[2.5, 4.0]}
            unit={t("designer.design.waterPerKgUnit")}
            secondary={
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {t("designer.design.mashThickness", { value: values.waterPerKgMalt.toFixed(1) })}
              </span>
            }
          />

          {/* ABV readonly */}
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium w-10 shrink-0">
              {t("designer.design.abvLabel")}
            </span>
            <span className="text-sm font-semibold tabular-nums">
              {designAbv > 0 ? `${designAbv.toFixed(1)}%` : "—"}
            </span>
            <span className="text-xs text-muted-foreground">
              {t("designer.design.abvReadonly")}
            </span>
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
