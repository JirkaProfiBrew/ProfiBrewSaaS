"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Play, CheckCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

import { startBatchStep, completeBatchStep } from "../actions";
import type { BatchStep } from "../types";

// ── Phase color mapping ───────────────────────────────────────

const PHASE_CLASS_MAP: Record<string, string> = {
  mashing: "bg-amber-100 text-amber-800 border-amber-300",
  boiling: "bg-red-100 text-red-800 border-red-300",
  post_boil: "bg-cyan-100 text-cyan-800 border-cyan-300",
  fermentation: "bg-yellow-100 text-yellow-800 border-yellow-300",
  conditioning: "bg-blue-100 text-blue-800 border-blue-300",
  other: "bg-gray-100 text-gray-800 border-gray-300",
};

function getStepRowClass(step: BatchStep): string {
  if (step.endTimeReal) return "bg-green-50";
  if (step.startTimeReal) return "bg-yellow-50";
  return "";
}

function formatDate(date: Date | null): string {
  if (!date) return "-";
  return new Date(date).toLocaleString("cs-CZ", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Component ──────────────────────────────────────────────────

interface BatchStepsTabProps {
  batchId: string;
  steps: BatchStep[];
  onMutate: () => void;
}

export function BatchStepsTab({
  batchId,
  steps,
  onMutate,
}: BatchStepsTabProps): React.ReactNode {
  const t = useTranslations("batches");
  const [loadingStepId, setLoadingStepId] = useState<string | null>(null);

  const handleStart = useCallback(
    async (stepId: string): Promise<void> => {
      setLoadingStepId(stepId);
      try {
        await startBatchStep(stepId);
        toast.success(t("steps.started"));
        onMutate();
      } catch (error: unknown) {
        console.error("Failed to start step:", error);
        toast.error(t("steps.startError"));
      } finally {
        setLoadingStepId(null);
      }
    },
    [onMutate, t]
  );

  const handleComplete = useCallback(
    async (stepId: string): Promise<void> => {
      setLoadingStepId(stepId);
      try {
        await completeBatchStep(stepId);
        toast.success(t("steps.completed"));
        onMutate();
      } catch (error: unknown) {
        console.error("Failed to complete step:", error);
        toast.error(t("steps.completeError"));
      } finally {
        setLoadingStepId(null);
      }
    },
    [onMutate, t]
  );

  if (steps.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        {t("steps.empty")}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("steps.columns.phase")}</TableHead>
            <TableHead>{t("steps.columns.name")}</TableHead>
            <TableHead>{t("steps.columns.temperature")}</TableHead>
            <TableHead>{t("steps.columns.time")}</TableHead>
            <TableHead>{t("steps.columns.startPlan")}</TableHead>
            <TableHead>{t("steps.columns.startReal")}</TableHead>
            <TableHead>{t("steps.columns.endReal")}</TableHead>
            <TableHead className="w-[120px]">{t("steps.columns.actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {steps.map((step) => {
            const phaseClass =
              PHASE_CLASS_MAP[step.brewPhase ?? "other"] ??
              PHASE_CLASS_MAP.other;
            const isLoading = loadingStepId === step.id;
            const canStart = !step.startTimeReal;
            const canComplete = !!step.startTimeReal && !step.endTimeReal;

            return (
              <TableRow
                key={step.id}
                className={cn(getStepRowClass(step))}
              >
                <TableCell>
                  <Badge variant="outline" className={cn(phaseClass)}>
                    {t(`steps.phase.${step.brewPhase ?? "other"}` as Parameters<typeof t>[0])}
                  </Badge>
                </TableCell>
                <TableCell className="font-medium">{step.name}</TableCell>
                <TableCell>
                  {step.temperatureC ? `${step.temperatureC} °C` : "-"}
                </TableCell>
                <TableCell>
                  {step.timeMin ? `${step.timeMin} min` : "-"}
                </TableCell>
                <TableCell>{formatDate(step.startTimePlan)}</TableCell>
                <TableCell>{formatDate(step.startTimeReal)}</TableCell>
                <TableCell>{formatDate(step.endTimeReal)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    {canStart && (
                      <Button
                        size="icon-xs"
                        variant="outline"
                        disabled={isLoading}
                        onClick={() => {
                          void handleStart(step.id);
                        }}
                        title={t("steps.startAction")}
                      >
                        <Play className="size-3" />
                      </Button>
                    )}
                    {canComplete && (
                      <Button
                        size="icon-xs"
                        variant="outline"
                        disabled={isLoading}
                        onClick={() => {
                          void handleComplete(step.id);
                        }}
                        title={t("steps.completeAction")}
                      >
                        <CheckCircle className="size-3" />
                      </Button>
                    )}
                    {step.endTimeReal && (
                      <CheckCircle className="size-4 text-green-600" />
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
