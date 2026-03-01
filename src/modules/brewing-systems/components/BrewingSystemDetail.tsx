"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { DetailView } from "@/components/detail-view";
import { FormSection } from "@/components/forms";
import type { FormSectionDef, FormMode } from "@/components/forms";
import type { DetailViewAction } from "@/components/detail-view";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@/components/ui/table";

import { useShops } from "@/modules/shops/hooks";

import { useBrewingSystemItem } from "../hooks";
import {
  createBrewingSystem,
  updateBrewingSystem,
  deleteBrewingSystem,
} from "../actions";
import { calculateVolumes } from "../types";
import type { BrewingSystemVolumes } from "../types";
import { VesselBlock, WhirlpoolBlock } from "./VesselBlock";

// ── Component ──────────────────────────────────────────────────

interface BrewingSystemDetailProps {
  id: string;
}

export function BrewingSystemDetail({
  id,
}: BrewingSystemDetailProps): React.ReactNode {
  const t = useTranslations("brewingSystems");
  const tCommon = useTranslations("common");
  const router = useRouter();

  const isNew = id === "new";
  const { data: systemItem, isLoading } = useBrewingSystemItem(id);
  const { data: shopList } = useShops();

  const [values, setValues] = useState<Record<string, unknown>>({
    name: "",
    description: "",
    isPrimary: false,
    batchSizeL: "500",
    efficiencyPct: "75",
    shopId: "__none__",
    kettleVolumeL: "617",
    evaporationRatePctPerHour: "8",
    kettleTrubLossL: "5",
    whirlpoolLossPct: "10",
    fermenterVolumeL: "800",
    fermentationLossPct: "10",
    extractEstimate: "0.80",
    waterPerKgMalt: "1.0",
    grainAbsorptionLPerKg: "0.8",
    waterReserveL: "0",
    timePreparation: 30,
    timeLautering: 60,
    timeWhirlpool: 90,
    timeTransfer: 15,
    timeCleanup: 60,
    notes: "",
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  // Populate form when data loads
  useEffect(() => {
    if (systemItem) {
      setValues({
        name: systemItem.name,
        description: systemItem.description ?? "",
        isPrimary: systemItem.isPrimary,
        batchSizeL: systemItem.batchSizeL,
        efficiencyPct: systemItem.efficiencyPct,
        shopId: systemItem.shopId ?? "__none__",
        kettleVolumeL: systemItem.kettleVolumeL ?? "",
        evaporationRatePctPerHour: systemItem.evaporationRatePctPerHour ?? "8",
        kettleTrubLossL: systemItem.kettleTrubLossL ?? "5",
        whirlpoolLossPct: systemItem.whirlpoolLossPct ?? "10",
        fermenterVolumeL: systemItem.fermenterVolumeL ?? "",
        fermentationLossPct: systemItem.fermentationLossPct ?? "10",
        extractEstimate: systemItem.extractEstimate ?? "0.80",
        waterPerKgMalt: systemItem.waterPerKgMalt ?? "1.0",
        grainAbsorptionLPerKg: systemItem.grainAbsorptionLPerKg ?? "0.8",
        waterReserveL: systemItem.waterReserveL ?? "0",
        timePreparation: systemItem.timePreparation ?? 30,
        timeLautering: systemItem.timeLautering ?? 60,
        timeWhirlpool: systemItem.timeWhirlpool ?? 90,
        timeTransfer: systemItem.timeTransfer ?? 15,
        timeCleanup: systemItem.timeCleanup ?? 60,
        notes: systemItem.notes ?? "",
      });
    }
  }, [systemItem]);

  const mode: FormMode = isNew ? "create" : "edit";

  // Reactive volume calculations
  const volumes: BrewingSystemVolumes = useMemo(() => {
    return calculateVolumes({
      batchSizeL: String(values.batchSizeL || "0"),
      evaporationRatePctPerHour: String(values.evaporationRatePctPerHour || "0"),
      kettleTrubLossL: String(values.kettleTrubLossL || "0"),
      whirlpoolLossPct: String(values.whirlpoolLossPct || "0"),
      fermentationLossPct: String(values.fermentationLossPct || "0"),
    });
  }, [
    values.batchSizeL,
    values.evaporationRatePctPerHour,
    values.kettleTrubLossL,
    values.whirlpoolLossPct,
    values.fermentationLossPct,
  ]);

  const shopOptions = useMemo(
    () => [
      { value: "__none__", label: t("detail.fields.noShop") },
      ...shopList.map((s) => ({ value: s.id, label: s.name })),
    ],
    [shopList, t]
  );

  // ── Form section: Header ─────────────────────────────────────

  const headerSection: FormSectionDef = useMemo(
    () => ({
      title: t("detail.sections.header"),
      columns: 2,
      fields: [
        {
          key: "name",
          label: t("detail.fields.name"),
          type: "text",
          required: true,
          placeholder: t("detail.fields.name"),
        },
        {
          key: "description",
          label: t("detail.fields.description"),
          type: "text",
          placeholder: t("detail.fields.description"),
        },
        {
          key: "batchSizeL",
          label: t("detail.fields.batchSizeL"),
          type: "decimal",
          required: true,
          suffix: "L",
          highlight: true,
        },
        {
          key: "efficiencyPct",
          label: t("detail.fields.efficiencyPct"),
          type: "decimal",
          suffix: "%",
        },
        {
          key: "shopId",
          label: t("detail.fields.shopId"),
          type: "select",
          required: true,
          options: shopOptions,
        },
        {
          key: "isPrimary",
          label: t("detail.fields.isPrimary"),
          type: "toggle",
        },
      ],
    }),
    [t, shopOptions]
  );

  // ── Form section: Constants ───────────────────────────────────

  const constantsSection: FormSectionDef = useMemo(
    () => ({
      title: t("detail.sections.constants"),
      columns: 4,
      fields: [
        {
          key: "extractEstimate",
          label: t("detail.fields.extractEstimate"),
          type: "decimal",
          placeholder: "0.80",
        },
        {
          key: "waterPerKgMalt",
          label: t("detail.fields.waterPerKgMalt"),
          type: "decimal",
          suffix: "L/kg",
          placeholder: "1.0",
        },
        {
          key: "grainAbsorptionLPerKg",
          label: t("detail.fields.grainAbsorptionLPerKg"),
          type: "decimal",
          suffix: "L/kg",
          placeholder: "0.8",
        },
        {
          key: "waterReserveL",
          label: t("detail.fields.waterReserveL"),
          type: "decimal",
          suffix: "L",
          placeholder: "0",
        },
      ],
    }),
    [t]
  );

  // ── Form section: Notes ───────────────────────────────────────

  const notesSection: FormSectionDef = useMemo(
    () => ({
      title: t("detail.sections.notes"),
      columns: 1,
      fields: [
        {
          key: "notes",
          label: t("detail.sections.notes"),
          type: "textarea",
          gridSpan: 1,
        },
      ],
    }),
    [t]
  );

  // ── Handlers ──────────────────────────────────────────────────

  const handleChange = useCallback(
    (key: string, value: unknown): void => {
      setValues((prev) => ({ ...prev, [key]: value }));
      if (errors[key]) {
        setErrors((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      }
    },
    [errors]
  );

  const validate = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};

    if (!values.name || String(values.name).trim() === "") {
      newErrors.name = tCommon("validation.required");
    }
    if (!values.batchSizeL || Number(values.batchSizeL) <= 0) {
      newErrors.batchSizeL = tCommon("validation.required");
    }
    if (!values.shopId || String(values.shopId) === "__none__") {
      newErrors.shopId = tCommon("validation.required");
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [values, tCommon]);

  const handleSave = useCallback(async (): Promise<void> => {
    if (!validate()) {
      toast.error(tCommon("validationFailed"));
      return;
    }

    const payload = {
      name: String(values.name),
      description: values.description ? String(values.description) : null,
      isPrimary: values.isPrimary === true,
      batchSizeL: String(values.batchSizeL),
      efficiencyPct: String(values.efficiencyPct || "75"),
      shopId:
        values.shopId && String(values.shopId) !== "__none__"
          ? String(values.shopId)
          : null,
      kettleVolumeL: values.kettleVolumeL
        ? String(values.kettleVolumeL)
        : null,
      evaporationRatePctPerHour: values.evaporationRatePctPerHour
        ? String(values.evaporationRatePctPerHour)
        : null,
      kettleTrubLossL: values.kettleTrubLossL
        ? String(values.kettleTrubLossL)
        : null,
      whirlpoolLossPct: values.whirlpoolLossPct
        ? String(values.whirlpoolLossPct)
        : null,
      fermenterVolumeL: values.fermenterVolumeL
        ? String(values.fermenterVolumeL)
        : null,
      fermentationLossPct: values.fermentationLossPct
        ? String(values.fermentationLossPct)
        : null,
      extractEstimate: values.extractEstimate
        ? String(values.extractEstimate)
        : null,
      waterPerKgMalt: values.waterPerKgMalt
        ? String(values.waterPerKgMalt)
        : null,
      grainAbsorptionLPerKg: values.grainAbsorptionLPerKg
        ? String(values.grainAbsorptionLPerKg)
        : null,
      waterReserveL: values.waterReserveL
        ? String(values.waterReserveL)
        : null,
      timePreparation: values.timePreparation
        ? Number(values.timePreparation)
        : null,
      timeLautering: values.timeLautering
        ? Number(values.timeLautering)
        : null,
      timeWhirlpool: values.timeWhirlpool
        ? Number(values.timeWhirlpool)
        : null,
      timeTransfer: values.timeTransfer ? Number(values.timeTransfer) : null,
      timeCleanup: values.timeCleanup ? Number(values.timeCleanup) : null,
      notes: values.notes ? String(values.notes) : null,
      isActive: true,
    };

    try {
      if (isNew) {
        await createBrewingSystem(payload);
      } else {
        await updateBrewingSystem(id, payload);
      }

      toast.success(tCommon("saved"));
      router.push("/brewery/brewing-systems");
    } catch (error: unknown) {
      console.error("Failed to save brewing system:", error);
      toast.error(tCommon("saveFailed"));
    }
  }, [isNew, id, values, validate, router, tCommon]);

  const handleDelete = useCallback(async (): Promise<void> => {
    try {
      await deleteBrewingSystem(id);
      toast.success(tCommon("deleted"));
      router.push("/brewery/brewing-systems");
    } catch (error: unknown) {
      console.error("Failed to delete brewing system:", error);
      toast.error(tCommon("deleteFailed"));
    }
  }, [id, router, tCommon]);

  const handleCancel = useCallback((): void => {
    router.push("/brewery/brewing-systems");
  }, [router]);

  // Header actions
  const actions: DetailViewAction[] = useMemo(() => {
    if (isNew) return [];
    return [
      {
        key: "delete",
        label: t("detail.actions.delete"),
        icon: Trash2,
        variant: "destructive" as const,
        onClick: () => {
          void handleDelete();
        },
        confirm: {
          title: tCommon("confirmDelete"),
          description: tCommon("confirmDeleteDescription"),
        },
      },
    ];
  }, [isNew, t, tCommon, handleDelete]);

  const title = isNew
    ? t("detail.newTitle")
    : systemItem?.name ?? t("detail.title");

  // ── Derived vessel values ──────────────────────────────────

  const kettleVolumeL = Number(values.kettleVolumeL) || 0;
  const fermenterVolumeL = Number(values.fermenterVolumeL) || 0;
  const evaporationRatePctPerHour = Number(values.evaporationRatePctPerHour) || 0;
  const kettleTrubLossL = Number(values.kettleTrubLossL) || 0;
  const whirlpoolLossPct = Number(values.whirlpoolLossPct) || 0;
  const fermentationLossPct = Number(values.fermentationLossPct) || 0;

  // ── Render ──────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6 p-6">
      <DetailView
        title={title}
        backHref="/brewery/brewing-systems"
        actions={actions}
        isLoading={!isNew && isLoading}
        onSave={() => {
          void handleSave();
        }}
        onCancel={handleCancel}
        saveLabel={t("detail.actions.save")}
        cancelLabel={t("detail.actions.cancel")}
      >
        <div className="flex flex-col gap-6">
        {/* Section 1: Header */}
        <FormSection
          section={headerSection}
          values={values}
          errors={errors}
          mode={mode}
          onChange={handleChange}
        />

        {/* Section 2: Hot zone — visual blocks */}
        <Card>
          <CardHeader>
            <CardTitle>{t("detail.sections.hotZone")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {/* Kettle block */}
              <div className="flex flex-col gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">
                    {t("detail.fields.kettleVolumeL")}
                  </Label>
                  <Input
                    type="number"
                    value={String(values.kettleVolumeL ?? "")}
                    onChange={(e) =>
                      handleChange("kettleVolumeL", e.target.value)
                    }
                    className="h-8"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">
                    {t("detail.fields.evaporationRatePctPerHour")}
                  </Label>
                  <Input
                    type="number"
                    value={String(values.evaporationRatePctPerHour ?? "")}
                    onChange={(e) =>
                      handleChange("evaporationRatePctPerHour", e.target.value)
                    }
                    className="h-8"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">
                    {t("detail.fields.kettleTrubLossL")}
                  </Label>
                  <Input
                    type="number"
                    value={String(values.kettleTrubLossL ?? "")}
                    onChange={(e) =>
                      handleChange("kettleTrubLossL", e.target.value)
                    }
                    className="h-8"
                  />
                </div>
                <div className="flex-1">
                  <VesselBlock
                    title={t("detail.hotZoneBlocks.kettle")}
                    leftVessel={{
                      vesselVolumeL: kettleVolumeL,
                      liquidVolumeL: volumes.preboilVolumeL,
                      label: t("detail.volumeLabels.preboil"),
                      liquidColor: "bg-amber-500",
                    }}
                    rightVessel={{
                      vesselVolumeL: kettleVolumeL,
                      liquidVolumeL: volumes.postBoilVolumeL,
                      label: t("detail.volumeLabels.postBoil"),
                      liquidColor: "bg-yellow-400",
                    }}
                    lossLabel={t("detail.fields.evaporationRatePctPerHour")}
                    lossPct={evaporationRatePctPerHour}
                  />
                </div>
              </div>

              {/* Whirlpool block */}
              <div className="flex flex-col gap-3">
                {/* Spacer — aligns with the volume input in Kettle/Fermenter columns */}
                <div className="hidden md:block h-[3.25rem]" />
                <div className="space-y-1">
                  <Label className="text-xs">
                    {t("detail.fields.whirlpoolLossPct")}
                  </Label>
                  <Input
                    type="number"
                    value={String(values.whirlpoolLossPct ?? "")}
                    onChange={(e) =>
                      handleChange("whirlpoolLossPct", e.target.value)
                    }
                    className="h-8"
                  />
                </div>
                <div className="flex-1">
                  <WhirlpoolBlock
                    title={t("detail.hotZoneBlocks.whirlpool")}
                    lossLabel={t("detail.fields.whirlpoolLossPct")}
                    lossPct={whirlpoolLossPct}
                    description={t("detail.fields.whirlpoolDescription")}
                  />
                </div>
              </div>

              {/* Fermenter block */}
              <div className="flex flex-col gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">
                    {t("detail.fields.fermenterVolumeL")}
                  </Label>
                  <Input
                    type="number"
                    value={String(values.fermenterVolumeL ?? "")}
                    onChange={(e) =>
                      handleChange("fermenterVolumeL", e.target.value)
                    }
                    className="h-8"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">
                    {t("detail.fields.fermentationLossPct")}
                  </Label>
                  <Input
                    type="number"
                    value={String(values.fermentationLossPct ?? "")}
                    onChange={(e) =>
                      handleChange("fermentationLossPct", e.target.value)
                    }
                    className="h-8"
                  />
                </div>
                <div className="flex-1">
                  <VesselBlock
                    title={t("detail.hotZoneBlocks.fermenter")}
                    leftVessel={{
                      vesselVolumeL: fermenterVolumeL,
                      liquidVolumeL: volumes.intoFermenterL,
                      label: t("detail.volumeLabels.intoFermenter"),
                      liquidColor: "bg-yellow-400",
                    }}
                    rightVessel={{
                      vesselVolumeL: fermenterVolumeL,
                      liquidVolumeL: volumes.finishedBeerL,
                      label: t("detail.volumeLabels.finishedBeer"),
                      liquidColor: "bg-yellow-200",
                    }}
                    lossLabel={t("detail.fields.fermentationLossPct")}
                    lossPct={fermentationLossPct}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section 3: Constants */}
        <FormSection
          section={constantsSection}
          values={values}
          errors={errors}
          mode={mode}
          onChange={handleChange}
        />

        {/* Section 4: Step times */}
        <Card>
          <CardHeader>
            <CardTitle>{t("detail.sections.stepTimes")}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableBody>
                <TableRow>
                  <TableCell className="font-medium">
                    {t("detail.fields.timePreparation")}
                  </TableCell>
                  <TableCell className="w-40">
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        value={String(values.timePreparation ?? "")}
                        onChange={(e) =>
                          handleChange(
                            "timePreparation",
                            e.target.value ? Number(e.target.value) : null
                          )
                        }
                        className="h-8"
                      />
                      <span className="text-xs text-muted-foreground">min</span>
                    </div>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium text-muted-foreground">
                    {t("detail.fields.timeMashing")}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground italic">
                    {t("detail.stepTimesNote")}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">
                    {t("detail.fields.timeLautering")}
                  </TableCell>
                  <TableCell className="w-40">
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        value={String(values.timeLautering ?? "")}
                        onChange={(e) =>
                          handleChange(
                            "timeLautering",
                            e.target.value ? Number(e.target.value) : null
                          )
                        }
                        className="h-8"
                      />
                      <span className="text-xs text-muted-foreground">min</span>
                    </div>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium text-muted-foreground">
                    {t("detail.fields.timeBoiling")}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground italic">
                    {t("detail.stepTimesNote")}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">
                    {t("detail.fields.timeWhirlpool")}
                  </TableCell>
                  <TableCell className="w-40">
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        value={String(values.timeWhirlpool ?? "")}
                        onChange={(e) =>
                          handleChange(
                            "timeWhirlpool",
                            e.target.value ? Number(e.target.value) : null
                          )
                        }
                        className="h-8"
                      />
                      <span className="text-xs text-muted-foreground">min</span>
                    </div>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">
                    {t("detail.fields.timeTransfer")}
                  </TableCell>
                  <TableCell className="w-40">
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        value={String(values.timeTransfer ?? "")}
                        onChange={(e) =>
                          handleChange(
                            "timeTransfer",
                            e.target.value ? Number(e.target.value) : null
                          )
                        }
                        className="h-8"
                      />
                      <span className="text-xs text-muted-foreground">min</span>
                    </div>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="font-medium">
                    {t("detail.fields.timeCleanup")}
                  </TableCell>
                  <TableCell className="w-40">
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        value={String(values.timeCleanup ?? "")}
                        onChange={(e) =>
                          handleChange(
                            "timeCleanup",
                            e.target.value ? Number(e.target.value) : null
                          )
                        }
                        className="h-8"
                      />
                      <span className="text-xs text-muted-foreground">min</span>
                    </div>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Section 5: Notes */}
        <FormSection
          section={notesSection}
          values={values}
          errors={errors}
          mode={mode}
          onChange={handleChange}
        />
        </div>
      </DetailView>
    </div>
  );
}
