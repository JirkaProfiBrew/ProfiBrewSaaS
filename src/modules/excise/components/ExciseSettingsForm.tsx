"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

import { useExciseRates } from "../hooks";
import {
  getTenantExciseSettingsForUI,
  updateExciseSettings,
} from "../actions";
import type {
  ExciseSettings,
  BreweryCategory,
  TaxPoint,
  PlatoSource,
} from "../types";
import { DEFAULT_EXCISE_SETTINGS } from "../types";

// ── Constants ──────────────────────────────────────────────────

const BREWERY_CATEGORIES: BreweryCategory[] = ["A", "B", "C", "D", "E"];

// ── Component ──────────────────────────────────────────────────

export function ExciseSettingsForm(): React.ReactNode {
  const t = useTranslations("excise");
  const { data: rates, isLoading: ratesLoading } = useExciseRates();

  // Settings state
  const [settings, setSettings] = useState<ExciseSettings>(
    DEFAULT_EXCISE_SETTINGS
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Load current settings
  useEffect(() => {
    let cancelled = false;
    getTenantExciseSettingsForUI()
      .then((s) => {
        if (!cancelled) {
          setSettings(s);
          setLoading(false);
        }
      })
      .catch((error: unknown) => {
        console.error("Failed to load excise settings:", error);
        setLoading(false);
      });
    return (): void => {
      cancelled = true;
    };
  }, []);

  // Save handler
  const handleSave = useCallback(async (): Promise<void> => {
    setSaving(true);
    try {
      await updateExciseSettings(settings);
      toast.success(t("settings.title"));
    } catch (error) {
      console.error("Failed to save excise settings:", error);
      toast.error(String(error));
    } finally {
      setSaving(false);
    }
  }, [settings, t]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse h-64 rounded bg-muted" />
      </div>
    );
  }

  // Filter rates to show the current category's rate highlighted
  const currentCategoryRates = rates.filter(
    (r) => r.category === settings.excise_brewery_category && r.isActive
  );

  return (
    <div className="space-y-6">
      {/* Main settings card */}
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Enabled */}
          <div className="flex items-center justify-between">
            <Label htmlFor="excise-enabled" className="flex-1">
              {t("settings.enabled")}
            </Label>
            <Switch
              id="excise-enabled"
              checked={settings.excise_enabled}
              onCheckedChange={(checked) => {
                setSettings((prev) => ({
                  ...prev,
                  excise_enabled: checked,
                }));
              }}
            />
          </div>

          <Separator />

          {/* Brewery Category */}
          <div className="space-y-2">
            <Label>{t("settings.breweryCategory")}</Label>
            <Select
              value={settings.excise_brewery_category}
              onValueChange={(val) => {
                setSettings((prev) => ({
                  ...prev,
                  excise_brewery_category: val as BreweryCategory,
                }));
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BREWERY_CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {t(
                      `settings.categories.${cat}` as Parameters<
                        typeof t
                      >[0]
                    )}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {t("settings.breweryCategoryHelp")}
            </p>
          </div>

          {/* Tax Point */}
          <div className="space-y-3">
            <Label>{t("settings.taxPoint")}</Label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="taxPoint"
                  value="production"
                  checked={settings.excise_tax_point === "production"}
                  onChange={() => {
                    setSettings((prev) => ({
                      ...prev,
                      excise_tax_point: "production" as TaxPoint,
                    }));
                  }}
                  className="size-4"
                />
                <span className="text-sm">
                  {t("settings.taxPointProduction")}
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="taxPoint"
                  value="release"
                  checked={settings.excise_tax_point === "release"}
                  onChange={() => {
                    setSettings((prev) => ({
                      ...prev,
                      excise_tax_point: "release" as TaxPoint,
                    }));
                  }}
                  className="size-4"
                />
                <span className="text-sm">
                  {t("settings.taxPointRelease")}
                </span>
              </label>
            </div>
          </div>

          {/* Plato Source */}
          <div className="space-y-3">
            <Label>{t("settings.platoSource")}</Label>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="platoSource"
                  value="batch_measurement"
                  checked={
                    settings.excise_plato_source === "batch_measurement"
                  }
                  onChange={() => {
                    setSettings((prev) => ({
                      ...prev,
                      excise_plato_source:
                        "batch_measurement" as PlatoSource,
                    }));
                  }}
                  className="size-4"
                />
                <span className="text-sm">
                  {t("settings.platoSourceMeasurement")}
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="platoSource"
                  value="recipe"
                  checked={settings.excise_plato_source === "recipe"}
                  onChange={() => {
                    setSettings((prev) => ({
                      ...prev,
                      excise_plato_source: "recipe" as PlatoSource,
                    }));
                  }}
                  className="size-4"
                />
                <span className="text-sm">
                  {t("settings.platoSourceRecipe")}
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="platoSource"
                  value="manual"
                  checked={settings.excise_plato_source === "manual"}
                  onChange={() => {
                    setSettings((prev) => ({
                      ...prev,
                      excise_plato_source: "manual" as PlatoSource,
                    }));
                  }}
                  className="size-4"
                />
                <span className="text-sm">
                  {t("settings.platoSourceManual")}
                </span>
              </label>
            </div>
          </div>

          {/* Loss Norm */}
          <div className="space-y-2">
            <Label>{t("settings.lossNorm")}</Label>
            <Input
              type="number"
              step="0.1"
              value={settings.excise_loss_norm_pct}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                setSettings((prev) => ({
                  ...prev,
                  excise_loss_norm_pct: isNaN(val) ? 0 : val,
                }));
              }}
              className="w-32"
            />
          </div>

          <Separator />

          <Button
            onClick={() => void handleSave()}
            disabled={saving}
          >
            {saving ? "..." : t("movements.detail.save")}
          </Button>
        </CardContent>
      </Card>

      {/* Excise Rates (readonly) */}
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.currentRates")}</CardTitle>
        </CardHeader>
        <CardContent>
          {ratesLoading ? (
            <div className="animate-pulse h-24 rounded bg-muted" />
          ) : rates.length > 0 ? (
            <>
              {currentCategoryRates.length > 0 && (
                <div className="mb-4 rounded-md border border-green-300 bg-green-50 px-4 py-2 text-sm text-green-800">
                  {t("settings.yourCategory")}:{" "}
                  <strong>{settings.excise_brewery_category}</strong>
                  {" | "}
                  {t("settings.yourRate")}:{" "}
                  <strong>
                    {Number(
                      currentCategoryRates[0]?.ratePerPlatoHl ?? "0"
                    ).toLocaleString("cs-CZ")}{" "}
                    Kc/°P/hl
                  </strong>
                </div>
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("settings.breweryCategory")}</TableHead>
                    <TableHead className="text-right">
                      Kc/°P/hl
                    </TableHead>
                    <TableHead>{t("movements.columns.date")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rates
                    .filter((r) => r.isActive)
                    .map((rate) => (
                      <TableRow
                        key={rate.id}
                        className={
                          rate.category ===
                          settings.excise_brewery_category
                            ? "bg-green-50"
                            : ""
                        }
                      >
                        <TableCell>
                          <Badge variant="outline">{rate.category}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {Number(rate.ratePerPlatoHl).toLocaleString(
                            "cs-CZ"
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {rate.validFrom}
                          {rate.validTo ? ` - ${rate.validTo}` : "+"}
                        </TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("reports.noResults")}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
