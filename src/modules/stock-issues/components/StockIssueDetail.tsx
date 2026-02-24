"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Trash2, CheckCircle, XCircle, FlaskConical } from "lucide-react";
import { toast } from "sonner";

import { DetailView } from "@/components/detail-view";
import { FormSection } from "@/components/forms";
import type { FormSectionDef, FormMode } from "@/components/forms";
import type { DetailViewAction } from "@/components/detail-view";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  getBatchOptionsForIssue,
  prefillIssueFromBatch,
} from "@/modules/batches/actions";

import { useStockIssueDetail } from "../hooks";
import {
  createStockIssue,
  updateStockIssue,
  deleteStockIssue,
  getWarehouseOptions,
  getPartnerOptions,
  getItemOptions,
  getStockIssueMovements,
} from "../actions";
import type { MovementType, MovementPurpose } from "../types";
import { StockIssueLineTable } from "./StockIssueLineTable";
import { StockIssueConfirmDialog } from "./StockIssueConfirmDialog";
import { StockIssueCancelDialog } from "./StockIssueCancelDialog";

// ── Status Badge ────────────────────────────────────────────────

function StatusBadge({
  status,
  t,
}: {
  status: string;
  t: ReturnType<typeof useTranslations>;
}): React.ReactNode {
  const variants: Record<string, string> = {
    draft: "bg-gray-100 text-gray-700",
    confirmed: "bg-green-100 text-green-700",
    cancelled: "bg-red-100 text-red-700",
  };
  const className = variants[status] ?? "bg-gray-100 text-gray-700";
  return (
    <Badge variant="outline" className={className}>
      {t(`status.${status}` as Parameters<typeof t>[0])}
    </Badge>
  );
}

function MovementTypeBadge({
  type,
  t,
}: {
  type: string;
  t: ReturnType<typeof useTranslations>;
}): React.ReactNode {
  const className =
    type === "receipt"
      ? "bg-blue-100 text-blue-700"
      : "bg-orange-100 text-orange-700";
  return (
    <Badge variant="outline" className={className}>
      {t(`movementType.${type}` as Parameters<typeof t>[0])}
    </Badge>
  );
}

// ── Movement type → valid purposes ──────────────────────────────

const RECEIPT_PURPOSES: MovementPurpose[] = [
  "purchase",
  "production_in",
  "transfer",
  "inventory",
  "other",
];

const ISSUE_PURPOSES: MovementPurpose[] = [
  "production_out",
  "sale",
  "transfer",
  "inventory",
  "waste",
  "other",
];

// ── Props ───────────────────────────────────────────────────────

interface StockIssueDetailProps {
  id: string;
}

// ── Component ───────────────────────────────────────────────────

export function StockIssueDetail({
  id,
}: StockIssueDetailProps): React.ReactNode {
  const t = useTranslations("stockIssues");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const searchParams = useSearchParams();

  const isNew = id === "new";
  const newType = (searchParams.get("type") ?? "receipt") as MovementType;
  const paramPurpose = searchParams.get("purpose") as MovementPurpose | null;
  const paramBatchId = searchParams.get("batchId");
  const paramBatchNumber = searchParams.get("batchNumber");
  const fromBatch = Boolean(paramBatchId && paramBatchNumber);
  const batchBackHref = fromBatch ? `/brewery/batches/${paramBatchId}?tab=ingredients` : null;

  const { data: issueDetail, isLoading, error: loadError, mutate } = useStockIssueDetail(
    isNew ? "" : id
  );

  // Select options
  const [warehouseOptions, setWarehouseOptions] = useState<
    Array<{ value: string; label: string }>
  >([]);
  const [partnerOptions, setPartnerOptions] = useState<
    Array<{ value: string; label: string }>
  >([]);
  const [itemOptions, setItemOptions] = useState<
    Array<{
      value: string;
      label: string;
      code: string;
      isBrewMaterial: boolean;
      materialType: string | null;
      issueMode: string;
    }>
  >([]);

  const [batchOptions, setBatchOptions] = useState<
    Array<{ value: string; label: string }>
  >([]);

  // Movements (loaded on demand)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle inferred types are complex
  const [movements, setMovements] = useState<any[]>([]);

  // Dialog states
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [prefillConfirmOpen, setPrefillConfirmOpen] = useState(false);
  const [pendingBatchId, setPendingBatchId] = useState<string>("");

  // Active tab
  const [activeTab, setActiveTab] = useState("header");

  // Form values — use searchParams for initial purpose + batchId if provided
  const [values, setValues] = useState<Record<string, unknown>>({
    movementPurpose:
      paramPurpose ?? (newType === "receipt" ? "purchase" : "sale"),
    date: new Date().toISOString().split("T")[0],
    warehouseId: "",
    partnerId: "__none__",
    batchId: paramBatchId ?? "",
    season: "",
    additionalCost: "0",
    notes: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Load select options
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getWarehouseOptions(),
      getPartnerOptions(),
      getItemOptions(),
      getBatchOptionsForIssue(),
    ])
      .then(([whOpts, pOpts, iOpts, bOpts]) => {
        if (!cancelled) {
          setWarehouseOptions(whOpts);
          setPartnerOptions(pOpts);
          setItemOptions(iOpts);
          setBatchOptions(bOpts);
        }
      })
      .catch((error: unknown) => {
        console.error("Failed to load options:", error);
      });
    return (): void => {
      cancelled = true;
    };
  }, []);

  // Populate form when data loads
  useEffect(() => {
    if (issueDetail) {
      setValues({
        movementPurpose: issueDetail.movementPurpose,
        date: issueDetail.date,
        warehouseId: issueDetail.warehouseId,
        partnerId: issueDetail.partnerId ?? "__none__",
        batchId: issueDetail.batchId ?? "",
        season: issueDetail.season ?? "",
        additionalCost: issueDetail.additionalCost ?? "0",
        notes: issueDetail.notes ?? "",
      });
    }
  }, [issueDetail]);

  // Load movements when tab switches
  useEffect(() => {
    if (!issueDetail || issueDetail.status === "draft") return;

    if (activeTab === "movements" && movements.length === 0) {
      getStockIssueMovements(id)
        .then(setMovements)
        .catch((error: unknown) => {
          console.error("Failed to load movements:", error);
        });
    }
  }, [activeTab, issueDetail, id, movements.length]);

  // When data hasn't loaded yet (not new, no issueDetail, no error) assume draft
  // so the form renders in edit mode instead of incorrectly showing readonly.
  const dataNotYetLoaded = !isNew && !issueDetail && !loadError;
  const isDraft = isNew || dataNotYetLoaded || issueDetail?.status === "draft";
  const isConfirmed = issueDetail?.status === "confirmed";
  const movementType = isNew ? newType : issueDetail?.movementType ?? newType;
  const mode: FormMode = isDraft ? (isNew ? "create" : "edit") : "readonly";

  // Purpose options based on movement type
  const purposeOptions = useMemo(() => {
    const purposes =
      movementType === "receipt" ? RECEIPT_PURPOSES : ISSUE_PURPOSES;
    return purposes.map((p) => ({
      value: p,
      label: t(`movementPurpose.${p}` as Parameters<typeof t>[0]),
    }));
  }, [movementType, t]);

  // Partner options with "none" sentinel
  const partnerSelectOptions = useMemo(
    () => [
      { value: "__none__", label: t("form.noPartner") },
      ...partnerOptions,
    ],
    [partnerOptions, t]
  );

  // Batch options with "none" sentinel
  const batchSelectOptions = useMemo(
    () => [
      { value: "__none__", label: t("form.noBatch") },
      ...batchOptions,
    ],
    [batchOptions, t]
  );

  // Should we show the batch select?
  const showBatchSelect = String(values.movementPurpose) === "production_out";

  // ── Form Section ────────────────────────────────────────────

  const headerSection: FormSectionDef = useMemo(
    () => ({
      columns: 2,
      fields: [
        ...(isNew
          ? []
          : [
              {
                key: "code",
                label: t("form.code"),
                type: "text" as const,
                disabled: true,
              },
            ]),
        {
          key: "movementPurpose",
          label: t("form.movementPurpose"),
          type: "select" as const,
          options: purposeOptions,
          required: true,
          disabled: !isDraft,
        },
        {
          key: "date",
          label: t("form.date"),
          type: "date" as const,
          required: true,
          disabled: !isDraft,
        },
        {
          key: "warehouseId",
          label: t("form.warehouseId"),
          type: "select" as const,
          options: warehouseOptions,
          required: true,
          disabled: !isDraft,
          placeholder: t("form.selectWarehouse"),
        },
        {
          key: "partnerId",
          label: t("form.partnerId"),
          type: "select" as const,
          options: partnerSelectOptions,
          disabled: !isDraft,
        },
        ...(showBatchSelect
          ? [
              {
                key: "batchId",
                label: t("form.batchId"),
                type: "select" as const,
                options: batchSelectOptions,
                disabled: !isDraft,
              },
            ]
          : []),
        {
          key: "season",
          label: t("form.season"),
          type: "text" as const,
          disabled: !isDraft,
        },
        {
          key: "additionalCost",
          label: t("form.additionalCost"),
          type: "decimal" as const,
          disabled: !isDraft,
        },
        {
          key: "notes",
          label: t("form.notes"),
          type: "textarea" as const,
          gridSpan: 2,
          disabled: !isDraft,
        },
      ],
    }),
    [t, isNew, isDraft, purposeOptions, warehouseOptions, partnerSelectOptions, showBatchSelect, batchSelectOptions]
  );

  // ── Handlers ────────────────────────────────────────────────

  // Prefill lines from batch (for existing draft issues)
  const doPrefillFromBatch = useCallback(
    async (batchId: string): Promise<void> => {
      if (isNew || !batchId || batchId === "__none__") return;
      try {
        const result = await prefillIssueFromBatch(id, batchId);
        if (result && typeof result === "object" && "error" in result) {
          toast.error(t("form.prefillError"));
        } else {
          toast.success(t("form.prefillSuccess"));
          mutate();
        }
      } catch {
        toast.error(t("form.prefillError"));
      }
    },
    [isNew, id, t, mutate]
  );

  const handleChange = useCallback(
    (key: string, value: unknown): void => {
      // When purpose changes away from production_out → clear batchId
      if (key === "movementPurpose" && String(value) !== "production_out") {
        setValues((prev) => ({ ...prev, [key]: value, batchId: "__none__" }));
      } else if (key === "batchId" && !isNew) {
        // Batch changed on existing draft → trigger prefill
        const newBatch = String(value);
        setValues((prev) => ({ ...prev, [key]: value }));
        if (newBatch && newBatch !== "__none__") {
          const hasLines = (issueDetail?.lines ?? []).length > 0;
          if (hasLines) {
            // Ask user to confirm overwrite
            setPendingBatchId(newBatch);
            setPrefillConfirmOpen(true);
          } else {
            void doPrefillFromBatch(newBatch);
          }
        }
      } else {
        setValues((prev) => ({ ...prev, [key]: value }));
      }
      if (errors[key]) {
        setErrors((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      }
    },
    [errors, isNew, issueDetail, doPrefillFromBatch]
  );

  // Confirm prefill from pending batch change
  const handlePrefillConfirm = useCallback((): void => {
    setPrefillConfirmOpen(false);
    void doPrefillFromBatch(pendingBatchId);
    setPendingBatchId("");
  }, [pendingBatchId, doPrefillFromBatch]);

  const handlePrefillCancel = useCallback((): void => {
    // Revert batchId to previous value
    setPrefillConfirmOpen(false);
    setValues((prev) => ({
      ...prev,
      batchId: issueDetail?.batchId ?? "__none__",
    }));
    setPendingBatchId("");
  }, [issueDetail]);

  const handleSave = useCallback(async (): Promise<void> => {
    // Validate required fields
    const newErrors: Record<string, string> = {};
    if (!values.warehouseId) {
      newErrors.warehouseId = tCommon("validation.required");
    }
    if (!values.date) {
      newErrors.date = tCommon("validation.required");
    }
    if (!values.movementPurpose) {
      newErrors.movementPurpose = tCommon("validation.required");
    }
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    try {
      const partnerId =
        String(values.partnerId) !== "__none__"
          ? String(values.partnerId)
          : null;

      const batchId =
        String(values.batchId) !== "__none__" && String(values.batchId)
          ? String(values.batchId)
          : null;

      if (isNew) {
        const result = await createStockIssue({
          movementType: newType,
          movementPurpose: String(values.movementPurpose) as MovementPurpose,
          date: String(values.date),
          warehouseId: String(values.warehouseId),
          partnerId,
          batchId,
          season: values.season ? String(values.season) : null,
          additionalCost: values.additionalCost
            ? String(values.additionalCost)
            : "0",
          notes: values.notes ? String(values.notes) : null,
        });
        // If batch selected on new issue → prefill lines after creation
        if (batchId) {
          await prefillIssueFromBatch(result.id, batchId).catch(() => {
            // Non-critical — issue was created, prefill failed
            console.error("Failed to prefill lines from batch");
          });
        }
        toast.success(t("detail.saved"));
        router.push(`/stock/movements/${result.id}`);
      } else {
        await updateStockIssue(id, {
          movementPurpose: String(values.movementPurpose) as MovementPurpose,
          date: String(values.date),
          warehouseId: String(values.warehouseId),
          partnerId,
          batchId,
          season: values.season ? String(values.season) : null,
          additionalCost: values.additionalCost
            ? String(values.additionalCost)
            : "0",
          notes: values.notes ? String(values.notes) : null,
        });
        toast.success(t("detail.saved"));
        mutate();
      }
    } catch (error) {
      console.error("Failed to save stock issue:", error);
      toast.error(t("detail.saveError"));
    }
  }, [isNew, id, values, newType, router, t, tCommon, mutate]);

  const handleDelete = useCallback(async (): Promise<void> => {
    try {
      await deleteStockIssue(id);
      toast.success(t("detail.deleted"));
      router.push(batchBackHref ?? "/stock/movements");
    } catch (error) {
      console.error("Failed to delete stock issue:", error);
      toast.error(t("detail.deleteError"));
    }
  }, [id, router, t, batchBackHref]);

  const handleCancel = useCallback((): void => {
    router.push(batchBackHref ?? "/stock/movements");
  }, [router, batchBackHref]);

  const handleConfirmed = useCallback((): void => {
    mutate();
    // Reset movements to force reload
    setMovements([]);
  }, [mutate]);

  const handleCancelled = useCallback((): void => {
    mutate();
  }, [mutate]);

  // ── Actions ─────────────────────────────────────────────────

  const actions: DetailViewAction[] = useMemo(() => {
    if (isNew) return [];

    const result: DetailViewAction[] = [];

    if (isDraft) {
      result.push({
        key: "confirm",
        label: t("detail.actions.confirm"),
        icon: CheckCircle,
        variant: "default",
        onClick: () => {
          setConfirmOpen(true);
        },
      });
      result.push({
        key: "delete",
        label: t("detail.actions.delete"),
        icon: Trash2,
        variant: "destructive",
        confirm: {
          title: tCommon("confirmDelete"),
          description: tCommon("confirmDeleteDescription"),
        },
        onClick: () => {
          void handleDelete();
        },
      });
    }

    if (isConfirmed) {
      result.push({
        key: "cancelDocument",
        label: t("detail.actions.cancelDocument"),
        icon: XCircle,
        variant: "destructive",
        onClick: () => {
          setCancelOpen(true);
        },
      });
    }

    return result;
  }, [isNew, isDraft, isConfirmed, t, handleDelete]);

  // ── NEW mode ──────────────────────────────────────────────

  if (isNew) {
    const newTitle =
      newType === "receipt"
        ? t("detail.newReceiptTitle")
        : t("detail.newIssueTitle");

    return (
      <div className="flex flex-col gap-6 p-6">
        <DetailView
          title={newTitle}
          backHref={batchBackHref ?? "/stock/movements"}
          isLoading={false}
          onSave={() => {
            void handleSave();
          }}
          onCancel={handleCancel}
          saveLabel={t("detail.actions.save")}
          cancelLabel={t("detail.actions.cancel")}
        >
          <div className="mb-4">
            <MovementTypeBadge type={newType} t={t} />
          </div>
          {fromBatch && paramBatchNumber && (
            <div className="mb-4 flex items-center gap-2 rounded-md border border-yellow-300 bg-yellow-50 px-4 py-2 text-sm text-yellow-800">
              <FlaskConical className="h-4 w-4 shrink-0" />
              {t("detail.batchBanner", { batchNumber: paramBatchNumber })}
            </div>
          )}
          <FormSection
            section={headerSection}
            values={values}
            errors={errors}
            mode="create"
            onChange={handleChange}
          />
        </DetailView>
      </div>
    );
  }

  // ── EDIT / VIEW mode ──────────────────────────────────────

  const title = issueDetail
    ? `${issueDetail.code}`
    : t("detail.title");

  return (
    <div className="flex flex-col gap-6 p-6">
      <DetailView
        title={title}
        backHref={batchBackHref ?? "/stock/movements"}
        actions={actions}
        isLoading={isLoading}
        onSave={
          isDraft
            ? () => {
                void handleSave();
              }
            : undefined
        }
        onCancel={handleCancel}
        saveLabel={t("detail.actions.save")}
        cancelLabel={t("detail.actions.cancel")}
      >
        {/* Status + type badges */}
        {issueDetail && (
          <div className="flex items-center gap-3 mb-4">
            <MovementTypeBadge type={issueDetail.movementType} t={t} />
            <StatusBadge status={issueDetail.status} t={t} />
          </div>
        )}

        {fromBatch && paramBatchNumber && (
          <div className="mb-4 flex items-center gap-2 rounded-md border border-yellow-300 bg-yellow-50 px-4 py-2 text-sm text-yellow-800">
            <FlaskConical className="h-4 w-4 shrink-0" />
            {t("detail.batchBanner", { batchNumber: paramBatchNumber })}
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList>
            <TabsTrigger value="header">{t("tabs.header")}</TabsTrigger>
            <TabsTrigger value="lines">{t("tabs.lines")}</TabsTrigger>
            {!isDraft && (
              <TabsTrigger value="movements">{t("tabs.movements")}</TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="header" className="mt-4">
            <FormSection
              section={headerSection}
              values={{
                ...values,
                code: issueDetail?.code ?? "",
              }}
              errors={errors}
              mode={mode}
              onChange={handleChange}
            />
          </TabsContent>

          <TabsContent value="lines" className="mt-4">
            <StockIssueLineTable
              issueId={id}
              lines={issueDetail?.lines ?? []}
              movementType={movementType}
              status={issueDetail?.status ?? "draft"}
              isDraft={isDraft}
              onMutate={mutate}
              itemOptions={itemOptions}
              additionalCost={String(values.additionalCost ?? "0")}
              warehouseId={String(values.warehouseId ?? "")}
            />
          </TabsContent>

          {!isDraft && (
            <TabsContent value="movements" className="mt-4">
              <MovementsTable movements={movements} t={t} />
            </TabsContent>
          )}
        </Tabs>
      </DetailView>

      {/* Dialogs */}
      <StockIssueConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        issueId={id}
        code={issueDetail?.code ?? ""}
        movementType={movementType}
        onConfirmed={handleConfirmed}
      />
      <StockIssueCancelDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        issueId={id}
        code={issueDetail?.code ?? ""}
        isIssueType={movementType === "issue"}
        onCancelled={handleCancelled}
      />

      {/* Prefill confirm dialog */}
      <AlertDialog open={prefillConfirmOpen} onOpenChange={setPrefillConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("form.prefillConfirmTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("form.prefillConfirmDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handlePrefillCancel}>
              {tCommon("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction onClick={handlePrefillConfirm}>
              {tCommon("confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Movements Tab (readonly) ──────────────────────────────────

function MovementsTable({
  movements,
  t,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle inferred types
  movements: any[];
  t: ReturnType<typeof useTranslations>;
}): React.ReactNode {
  if (movements.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        {t("movementsTab.noMovements")}
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("movementsTab.date")}</TableHead>
          <TableHead>{t("movementsTab.item")}</TableHead>
          <TableHead>{t("movementsTab.direction")}</TableHead>
          <TableHead className="text-right">
            {t("movementsTab.quantity")}
          </TableHead>
          <TableHead className="text-right">
            {t("movementsTab.unitPrice")}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {movements.map(
          (
            m: {
              id: string;
              date: string;
              itemId: string;
              movementType: string;
              quantity: string;
              unitPrice: string | null;
            },
            idx: number
          ) => {
            const qty = Number(m.quantity);
            const isIn = m.movementType === "in";
            const isStorno = qty < 0;
            return (
              <TableRow key={m.id ?? idx}>
                <TableCell>{m.date}</TableCell>
                <TableCell className="font-mono text-xs">
                  {m.itemId}
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={
                      isIn
                        ? "bg-green-100 text-green-700"
                        : "bg-red-100 text-red-700"
                    }
                  >
                    {isIn ? t("movementsTab.in") : t("movementsTab.out")}
                  </Badge>
                </TableCell>
                <TableCell className={`text-right font-mono${isStorno ? " text-red-600" : ""}`}>
                  {isStorno ? "- " : ""}{Math.abs(qty).toLocaleString("cs-CZ")}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {m.unitPrice
                    ? Number(m.unitPrice).toLocaleString("cs-CZ")
                    : "—"}
                </TableCell>
              </TableRow>
            );
          }
        )}
      </TableBody>
    </Table>
  );
}

