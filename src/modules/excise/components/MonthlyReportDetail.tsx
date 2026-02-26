"use client";

import { useMemo, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, RefreshCw, Send, Undo2 } from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

import { useMonthlyReport, useExciseMovements } from "../hooks";
import {
  generateMonthlyReport,
  submitMonthlyReport,
  revertMonthlyReport,
} from "../actions";
import type { ExciseMovement } from "../types";

// ── Props ──────────────────────────────────────────────────────

interface MonthlyReportDetailProps {
  id: string;
}

// ── Component ──────────────────────────────────────────────────

export function MonthlyReportDetail({
  id,
}: MonthlyReportDetailProps): React.ReactNode {
  const t = useTranslations("excise");
  const router = useRouter();

  const {
    data: report,
    isLoading: reportLoading,
    mutate: mutateReport,
  } = useMonthlyReport(id);

  // Load movements for this period
  const { data: movements, isLoading: movementsLoading } = useExciseMovements(
    report ? { period: report.period } : undefined
  );

  // Status badge
  const statusBadge = useMemo(() => {
    if (!report) return null;
    const variants: Record<string, string> = {
      draft: "bg-gray-100 text-gray-700",
      submitted: "bg-blue-100 text-blue-700",
      accepted: "bg-green-100 text-green-700",
    };
    return (
      <Badge
        variant="outline"
        className={variants[report.status] ?? ""}
      >
        {t(`reports.status.${report.status}` as Parameters<typeof t>[0])}
      </Badge>
    );
  }, [report, t]);

  // Balance lines
  const balanceLines = useMemo(() => {
    if (!report) return [];
    return [
      {
        label: t("reports.detail.balance.opening"),
        value: Number(report.openingBalanceHl),
        sign: "",
      },
      {
        label: t("reports.detail.balance.production"),
        value: Number(report.productionHl),
        sign: "+",
      },
      {
        label: t("reports.detail.balance.transferIn"),
        value: Number(report.transferInHl),
        sign: "+",
      },
      {
        label: t("reports.detail.balance.release"),
        value: Number(report.releaseHl),
        sign: "-",
      },
      {
        label: t("reports.detail.balance.transferOut"),
        value: Number(report.transferOutHl),
        sign: "-",
      },
      {
        label: t("reports.detail.balance.loss"),
        value: Number(report.lossHl),
        sign: "-",
      },
      {
        label: t("reports.detail.balance.destruction"),
        value: Number(report.destructionHl),
        sign: "-",
      },
      {
        label: t("reports.detail.balance.adjustment"),
        value: Number(report.adjustmentHl),
        sign: Number(report.adjustmentHl) >= 0 ? "+" : "-",
      },
    ];
  }, [report, t]);

  // ── Handlers ─────────────────────────────────────────────────

  const handleRegenerate = useCallback(async (): Promise<void> => {
    if (!report) return;
    try {
      await generateMonthlyReport(report.period);
      toast.success(t("reports.regenerate"));
      mutateReport();
    } catch (error) {
      console.error("Failed to regenerate report:", error);
      toast.error(String(error));
    }
  }, [report, t, mutateReport]);

  const handleSubmit = useCallback(async (): Promise<void> => {
    try {
      await submitMonthlyReport(id);
      toast.success(t("reports.submit"));
      mutateReport();
    } catch (error) {
      console.error("Failed to submit report:", error);
      toast.error(String(error));
    }
  }, [id, t, mutateReport]);

  const handleRevert = useCallback(async (): Promise<void> => {
    try {
      await revertMonthlyReport(id);
      toast.success(t("reports.backToDraft"));
      mutateReport();
    } catch (error) {
      console.error("Failed to revert report:", error);
      toast.error(String(error));
    }
  }, [id, t, mutateReport]);

  // ── Loading ──────────────────────────────────────────────────

  if (reportLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 rounded bg-muted" />
          <div className="h-64 rounded bg-muted" />
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <p className="text-muted-foreground">
          {t("reports.noResults")}
        </p>
      </div>
    );
  }

  const isDraft = report.status === "draft";
  const isSubmitted = report.status === "submitted";

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            router.push("/stock/monthly-report");
          }}
        >
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="text-2xl font-bold tracking-tight">
          {t("reports.detail.title")} --- {report.period}
        </h1>
        {statusBadge}
      </div>

      {/* Section 1: Balance card */}
      <Card>
        <CardHeader>
          <CardTitle>
            {t("reports.detail.balance.title")} --- {report.period}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {balanceLines.map((line) => (
            <div
              key={line.label}
              className="flex items-center justify-between text-sm"
            >
              <span className="text-muted-foreground">
                {line.sign === "+"
                  ? `+ ${line.label}`
                  : line.sign === "-"
                    ? `- ${line.label}`
                    : line.label}
              </span>
              <span
                className={cn(
                  "font-mono",
                  line.sign === "+"
                    ? "text-green-600"
                    : line.sign === "-"
                      ? "text-red-600"
                      : ""
                )}
              >
                {line.value.toFixed(2)} hl
              </span>
            </div>
          ))}

          <Separator />

          {/* Closing balance */}
          <div className="flex items-center justify-between text-sm font-bold">
            <span>{t("reports.detail.balance.closing")}</span>
            <span className="font-mono">
              {Number(report.closingBalanceHl).toFixed(2)} hl
            </span>
          </div>

          <Separator />

          {/* Tax due */}
          <div className="flex items-center justify-between text-base font-bold text-red-700">
            <span>{t("reports.detail.balance.taxDue")}</span>
            <span className="font-mono">
              {Number(report.totalTax).toLocaleString("cs-CZ", {
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
              })}{" "}
              Kc
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Section 2: Tax breakdown table */}
      <Card>
        <CardHeader>
          <CardTitle>
            {t("reports.detail.taxBreakdown.title")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {report.taxDetails && report.taxDetails.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    {t("reports.detail.taxBreakdown.plato")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("reports.detail.taxBreakdown.volume")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("reports.detail.taxBreakdown.rate")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("reports.detail.taxBreakdown.tax")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.taxDetails.map((detail, idx) => (
                  <TableRow key={idx}>
                    <TableCell>{detail.plato} °P</TableCell>
                    <TableCell className="text-right font-mono">
                      {detail.volume_hl.toFixed(2)} hl
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      ---
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {detail.tax.toLocaleString("cs-CZ", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{" "}
                      Kc
                    </TableCell>
                  </TableRow>
                ))}
                {/* Total row */}
                <TableRow className="font-bold">
                  <TableCell>
                    {t("reports.detail.taxBreakdown.total")}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {report.taxDetails
                      .reduce((sum, d) => sum + d.volume_hl, 0)
                      .toFixed(2)}{" "}
                    hl
                  </TableCell>
                  <TableCell />
                  <TableCell className="text-right font-mono">
                    {Number(report.totalTax).toLocaleString("cs-CZ", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}{" "}
                    Kc
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("reports.noResults")}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Section 3: Movements in period */}
      <Card>
        <CardHeader>
          <CardTitle>
            {t("reports.detail.movements.title")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {movementsLoading ? (
            <div className="animate-pulse h-32 rounded bg-muted" />
          ) : movements.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("movements.columns.date")}</TableHead>
                  <TableHead>
                    {t("movements.columns.movementType")}
                  </TableHead>
                  <TableHead>
                    {t("movements.columns.direction")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("movements.columns.volumeHl")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("movements.columns.plato")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("movements.columns.taxAmount")}
                  </TableHead>
                  <TableHead>
                    {t("movements.columns.status")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movements.map((mov: ExciseMovement) => (
                  <TableRow
                    key={mov.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => {
                      router.push(`/stock/excise/${mov.id}`);
                    }}
                  >
                    <TableCell>{mov.date}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {t(
                          `movements.movementType.${mov.movementType}` as Parameters<
                            typeof t
                          >[0]
                        )}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          mov.direction === "in"
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }
                      >
                        {t(
                          `movements.direction.${mov.direction}` as Parameters<
                            typeof t
                          >[0]
                        )}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {Number(mov.volumeHl).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {mov.plato ? Number(mov.plato).toFixed(1) : "---"}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {mov.taxAmount
                        ? Number(mov.taxAmount).toLocaleString("cs-CZ", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })
                        : "---"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {t(
                          `movements.status.${mov.status}` as Parameters<
                            typeof t
                          >[0]
                        )}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t("movements.noResults")}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Action buttons */}
      <Separator />
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          onClick={() => {
            router.push("/stock/monthly-report");
          }}
        >
          {t("movements.detail.back")}
        </Button>

        {isDraft && (
          <>
            <Button
              variant="outline"
              onClick={() => void handleRegenerate()}
            >
              <RefreshCw className="mr-1 size-4" />
              {t("reports.regenerate")}
            </Button>
            <Button onClick={() => void handleSubmit()}>
              <Send className="mr-1 size-4" />
              {t("reports.submit")}
            </Button>
          </>
        )}

        {isSubmitted && (
          <Button
            variant="outline"
            onClick={() => void handleRevert()}
          >
            <Undo2 className="mr-1 size-4" />
            {t("reports.backToDraft")}
          </Button>
        )}
      </div>
    </div>
  );
}
