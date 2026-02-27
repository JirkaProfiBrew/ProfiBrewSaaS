"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BeerGlass } from "@/components/ui/beer-glass";
import { DesignSlider } from "./DesignSlider";

// ── Types ────────────────────────────────────────────────────────

interface DesignValues {
  beerStyleId: string | null;
  batchSizeL: number;
  og: number;
  fg: number;
  targetIbu: number;
  targetEbc: number;
}

interface RecipeDesignSectionProps {
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
}

// ── Helpers ──────────────────────────────────────────────────────

function platoToSG(plato: number): string {
  if (plato <= 0) return "1.000";
  const sg = 1 + plato / (258.6 - 227.1 * (plato / 258.2));
  return sg.toFixed(3);
}

// ── Component ────────────────────────────────────────────────────

export function RecipeDesignSection({
  values,
  onChange,
  beerStyleOptions,
  styleRanges,
  calcOg,
  calcIbu,
  calcEbc,
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

  return (
    <div className="rounded-lg border bg-card p-4 space-y-4">
      <h2 className="text-sm font-semibold">{t("designer.design.title")}</h2>

      {/* Row: Style + Batch Size */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>{t("form.beerStyle")}</Label>
          <Select
            value={values.beerStyleId ?? "__none__"}
            onValueChange={(v) =>
              onChange("beerStyleId", v === "__none__" ? null : v)
            }
          >
            <SelectTrigger>
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
              className="w-28"
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
    </div>
  );
}
