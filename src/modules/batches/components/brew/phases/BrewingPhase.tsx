"use client";

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  useTransition,
} from "react";
import { useTranslations } from "next-intl";
import { useRouter, useParams } from "next/navigation";
import { toast } from "sonner";
import { Play, Pause, Square, ArrowRight, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

import type {
  Batch,
  BatchStep,
  HopAddition,
  BatchPhase,
  BrewStepPreviewItem,
  BrewStepPreviewResult,
} from "../../../types";
import {
  getBatchBrewData,
  updateBatchStep,
  updateBatch,
  advanceBatchPhase,
  getBrewStepPreview,
  updateBatchPlanData,
} from "../../../actions";

// ── Phase colors (matching BrewStepTimeline) ───────────────────

const PHASE_COLORS: Record<string, { border: string; bg: string }> = {
  preparation: { border: "border-l-gray-400", bg: "bg-gray-50" },
  mashing: { border: "border-l-amber-500", bg: "bg-amber-50/50" },
  boiling: { border: "border-l-orange-500", bg: "bg-orange-50/50" },
  post_boil: { border: "border-l-blue-500", bg: "bg-blue-50/50" },
};

function getPhaseColor(brewPhase: string): { border: string; bg: string } {
  return PHASE_COLORS[brewPhase] ?? { border: "border-l-gray-300", bg: "" };
}

const BREW_PHASE_LABEL_KEYS: Record<string, string> = {
  preparation: "brew.brewing.phasePreparation",
  mashing: "brew.brewing.phaseMashing",
  lautering: "brew.brewing.phaseLautering",
  boiling: "brew.brewing.phaseBoiling",
  post_boil: "brew.brewing.phasePostBoil",
};

// ── Helpers ─────────────────────────────────────────────────────

function fmtTime(d: Date | null | undefined): string {
  if (!d) return "—";
  const date = new Date(d);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString("cs-CZ", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function calcActualMin(step: BatchStep): number | null {
  if (step.startTimeReal && step.endTimeReal) {
    const start = new Date(step.startTimeReal).getTime();
    const end = new Date(step.endTimeReal).getTime();
    if (!isNaN(start) && !isNaN(end) && end > start) {
      return Math.round((end - start) / 60000);
    }
  }
  if (step.actualDurationMin !== null) return step.actualDurationMin;
  return null;
}

function fmtAmount(hop: HopAddition): string {
  if (hop.unitSymbol) return `${hop.amountG} ${hop.unitSymbol}`;
  if (hop.amountG >= 1000) return `${(hop.amountG / 1000).toFixed(1)} kg`;
  return `${Math.round(hop.amountG)} g`;
}

// ── BrewTimer sub-component ────────────────────────────────────

function BrewTimer({ label }: { label: string }): React.ReactNode {
  const [running, setRunning] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    return (): void => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running]);

  const fmt = (s: number): string => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="icon"
        className="size-7"
        onClick={(): void => setRunning(!running)}
      >
        {running ? (
          <Pause className="size-3.5" />
        ) : (
          <Play className="size-3.5" />
        )}
      </Button>
      <span className="font-mono text-sm w-20">{fmt(seconds)}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

// ── Boil Countdown Timer sub-component ─────────────────────────

interface BoilCountdownProps {
  totalSeconds: number;
  onElapsed: (elapsedSeconds: number) => void;
}

function BoilCountdown({
  totalSeconds,
  onElapsed,
}: BoilCountdownProps): React.ReactNode {
  const t = useTranslations("batches");
  const [state, setState] = useState<"idle" | "running" | "paused" | "done">(
    "idle"
  );
  const [remaining, setRemaining] = useState(totalSeconds);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef(0);

  useEffect(() => {
    if (state === "running") {
      intervalRef.current = setInterval(() => {
        setRemaining((prev) => {
          if (prev <= 1) {
            setState("done");
            return 0;
          }
          elapsedRef.current += 1;
          return prev - 1;
        });
      }, 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    return (): void => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [state]);

  useEffect(() => {
    if (state === "done") {
      onElapsed(elapsedRef.current);
    }
  }, [state, onElapsed]);

  const fmt = (s: number): string => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex items-center gap-3">
      <span className="font-mono text-2xl font-bold tabular-nums">
        {fmt(remaining)}
      </span>
      <div className="flex gap-1">
        {state === "idle" && (
          <Button
            size="sm"
            onClick={(): void => setState("running")}
          >
            <Play className="mr-1 size-3.5" />
            {t("brew.brewing.hopTimerStart")}
          </Button>
        )}
        {state === "running" && (
          <Button
            size="sm"
            variant="outline"
            onClick={(): void => setState("paused")}
          >
            <Pause className="mr-1 size-3.5" />
            {t("brew.brewing.hopTimerPause")}
          </Button>
        )}
        {state === "paused" && (
          <>
            <Button
              size="sm"
              onClick={(): void => setState("running")}
            >
              <Play className="mr-1 size-3.5" />
              {t("brew.brewing.hopTimerResume")}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={(): void => {
                setState("done");
              }}
            >
              <Square className="mr-1 size-3.5" />
              {t("brew.brewing.hopTimerStop")}
            </Button>
          </>
        )}
        {state === "done" && (
          <span className="text-sm font-medium text-green-600">
            {t("steps.completed")}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Main BrewingPhase component ────────────────────────────────

interface Props {
  batchId: string;
}

export function BrewingPhase({ batchId }: Props): React.ReactNode {
  const t = useTranslations("batches");
  const router = useRouter();
  const params = useParams();
  const locale = params.locale as string;
  const [isPending, startTransition] = useTransition();

  // ── State ──────────────────────────────────────────────────
  const [batch, setBatch] = useState<Batch | null>(null);
  const [steps, setSteps] = useState<BatchStep[]>([]);
  const [brewPreview, setBrewPreview] = useState<BrewStepPreviewResult | null>(null);
  const [brewStartInput, setBrewStartInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [localNotes, setLocalNotes] = useState<Record<string, string>>({});
  const [finishOg, setFinishOg] = useState("");
  const [finishVolume, setFinishVolume] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  // Debounce refs
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // ── Load data ──────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      try {
        const [data, preview] = await Promise.all([
          getBatchBrewData(batchId),
          getBrewStepPreview(batchId),
        ]);
        if (cancelled || !data) return;
        setBatch(data.batch);
        setSteps(data.steps);
        setBrewPreview(preview);

        // Init brew start input from batch plannedDate (local time for datetime-local)
        if (data.batch.plannedDate) {
          const d = new Date(data.batch.plannedDate);
          const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
          setBrewStartInput(local.toISOString().slice(0, 16));
        }

        const notes: Record<string, string> = {};
        for (const step of data.steps) {
          if (step.notes) {
            notes[step.id] = step.notes;
          }
        }
        setLocalNotes(notes);
      } catch {
        toast.error("Failed to load brew data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return (): void => {
      cancelled = true;
    };
  }, [batchId]);

  // ── Map batch_steps by name for tracking data overlay ─────
  const stepTrackingMap = useMemo(() => {
    const map = new Map<string, BatchStep>();
    for (const step of steps) {
      map.set(step.name, step);
    }
    return map;
  }, [steps]);

  // ── Preview steps (display source) ────────────────────────
  const previewSteps = brewPreview?.steps ?? [];

  // ── Boil time (from preview for hop timer) ────────────────
  const boilTimeMin = useMemo(() => {
    return previewSteps
      .filter((s) => s.brewPhase === "boiling" && s.stepType === "boil")
      .reduce((sum, s) => sum + s.timeMin, 0);
  }, [previewSteps]);

  // ── Boil step with hops (for hop timer section) ───────────
  const boilPreviewStep = useMemo(
    () =>
      previewSteps.find(
        (s) =>
          s.brewPhase === "boiling" &&
          s.stepType === "boil" &&
          s.hopAdditions &&
          s.hopAdditions.length > 0
      ),
    [previewSteps]
  );

  // ── Totals (plan from preview, actual from batch_steps) ───
  const totalPlanMin = brewPreview?.totalMinutes ?? 0;

  const totalActualMin = useMemo(() => {
    let sum = 0;
    let hasAny = false;
    for (const step of steps) {
      const actual = calcActualMin(step);
      if (actual !== null) {
        sum += actual;
        hasAny = true;
      }
    }
    return hasAny ? sum : null;
  }, [steps]);

  // ── Recalculate brew steps with new start time ────────────
  const handleRecalculate = useCallback((): void => {
    startTransition(async () => {
      try {
        await updateBatchPlanData(batchId, {
          plannedDate: brewStartInput || null,
        });
        const preview = await getBrewStepPreview(batchId);
        setBrewPreview(preview);
        router.refresh();
      } catch {
        toast.error("Failed to recalculate");
      }
    });
  }, [batchId, brewStartInput, router, startTransition]);

  // ── Auto-save notes ────────────────────────────────────────
  const saveNotes = useCallback((stepId: string, value: string): void => {
    if (saveTimers.current[`notes_${stepId}`]) {
      clearTimeout(saveTimers.current[`notes_${stepId}`]);
    }
    saveTimers.current[`notes_${stepId}`] = setTimeout(async () => {
      try {
        await updateBatchStep(stepId, { notes: value });
      } catch {
        toast.error("Failed to save notes");
      }
    }, 500);
  }, []);

  // ── Hop confirmation (saves to batch_step by matching name) ─
  const handleHopConfirm = useCallback(
    async (stepName: string, hopIndex: number): Promise<void> => {
      const dbStep = stepTrackingMap.get(stepName);
      if (!dbStep || !dbStep.hopAdditions) return;

      const updatedHops: HopAddition[] = dbStep.hopAdditions.map((h, i) => {
        if (i === hopIndex) {
          return {
            ...h,
            confirmed: true,
            actualTime: new Date().toISOString(),
          };
        }
        return h;
      });

      try {
        const updated = await updateBatchStep(dbStep.id, {
          hopAdditions: updatedHops,
        });
        setSteps((prev) =>
          prev.map((s) => (s.id === dbStep.id ? updated : s))
        );
      } catch {
        toast.error("Failed to confirm hop addition");
      }
    },
    [stepTrackingMap]
  );

  // ── Phase transition ───────────────────────────────────────
  const handleFinishBrewing = useCallback(async (): Promise<void> => {
    if (!finishOg || !finishVolume) {
      toast.error(t("brew.brewing.confirmFinish"));
      return;
    }

    startTransition(async () => {
      try {
        await updateBatch(batchId, {
          ogActual: finishOg,
          actualVolumeL: finishVolume,
        });

        await advanceBatchPhase(batchId, "fermentation" as BatchPhase);

        toast.success(t("brew.phaseAdvanced"));
        router.push(`/${locale}/brewery/batches/${batchId}/brew/ferm`);
        router.refresh();
      } catch {
        toast.error("Failed to finish brewing phase");
      }
    });
  }, [
    batchId,
    finishOg,
    finishVolume,
    t,
    router,
    locale,
    startTransition,
  ]);

  // ── Loading state ──────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold">{t("brew.phases.brewing")}</h2>
        <div className="animate-pulse space-y-3">
          <div className="h-8 w-1/3 rounded bg-muted" />
          <div className="h-48 rounded bg-muted" />
        </div>
      </div>
    );
  }

  // ── Total delta ────────────────────────────────────────────
  const totalDelta =
    totalActualMin !== null ? totalActualMin - totalPlanMin : null;

  // Track phase changes for separators
  let currentPhase = "";

  return (
    <div className="space-y-8">
      {/* ── Section 1: Brew Steps Timeline ──────────────────── */}
      <section>
        <h3 className="mb-3 text-lg font-semibold">
          {t("brew.brewing.steps")}
        </h3>

        {/* Brew start datetime + recalculate + end time */}
        <div className="flex items-center gap-2 mb-3">
          <Input
            type="datetime-local"
            value={brewStartInput}
            onChange={(e): void => setBrewStartInput(e.target.value)}
            className="h-8 text-sm w-auto"
          />
          <Button
            variant="outline"
            size="sm"
            className="h-8 shrink-0"
            onClick={handleRecalculate}
            disabled={isPending}
          >
            <RefreshCw className={`size-3.5 mr-1.5 ${isPending ? "animate-spin" : ""}`} />
            {t("brew.prep.recalculate")}
          </Button>
          {(() => {
            const end = brewPreview?.brewEnd
              ? new Date(brewPreview.brewEnd)
              : null;
            return (
              <span className="text-sm text-muted-foreground ml-auto whitespace-nowrap">
                {"\u2192 "}
                {end ? fmtTime(end) : "\u2014"}
                {" "}({totalPlanMin >= 60
                  ? `${Math.floor(totalPlanMin / 60)}h ${totalPlanMin % 60}min`
                  : `${totalPlanMin} min`})
              </span>
            );
          })()}
        </div>

        {/* Column headers */}
        <div className="flex items-center gap-1 px-2 pb-1.5 text-xs font-medium text-muted-foreground border-b">
          <span className="w-12 shrink-0">{t("brew.brewing.planTime")}</span>
          <span className="flex-1 min-w-0">{t("brew.brewing.stepName")}</span>
          <span className="w-11 shrink-0 text-right">{t("brew.brewing.targetTemp")}</span>
          <span className="w-12 shrink-0 text-right">{t("brew.brewing.actualStart")}</span>
          <span className="w-12 shrink-0 text-right">{t("brew.brewing.actualEnd")}</span>
          <span className="w-14 shrink-0 text-right">{t("brew.brewing.planCalcMin")}</span>
          <span className="w-14 shrink-0 text-right">{t("brew.brewing.actualCalcMin")}</span>
          <span className="w-10 shrink-0 text-right">{t("brew.brewing.delta")}</span>
          <span className="w-36 shrink-0">{t("brew.brewing.note")}</span>
        </div>

        {/* Step rows — from preview (same as PrepPhase detailed view) */}
        <div className="space-y-0">
          {previewSteps.map((pStep, idx) => {
            const phaseChanged = pStep.brewPhase !== currentPhase;
            if (phaseChanged) currentPhase = pStep.brewPhase;
            const colors = getPhaseColor(pStep.brewPhase);

            // Overlay tracking data from batch_steps by matching name
            const dbStep = stepTrackingMap.get(pStep.name);
            const actualMin = dbStep ? calcActualMin(dbStep) : null;
            const delta = actualMin !== null ? actualMin - pStep.timeMin : null;

            // Hop confirmation state comes from batch_step's hopAdditions
            const dbHops = dbStep?.hopAdditions ?? null;

            return (
              <React.Fragment key={idx}>
                {/* Phase separator */}
                {phaseChanged && idx > 0 && (
                  <div className="h-px bg-border my-1" />
                )}
                {phaseChanged && (
                  <div className="px-2 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground bg-muted/50">
                    {t(
                      BREW_PHASE_LABEL_KEYS[pStep.brewPhase] ??
                        `steps.phase.${pStep.brewPhase}`
                    )}
                  </div>
                )}

                {/* Step row */}
                <div
                  className={cn(
                    "flex items-center gap-1 py-1.5 px-2 border-l-2 text-sm",
                    colors.border,
                    pStep.stepType === "heat" && "opacity-70"
                  )}
                >
                  {/* Plan time */}
                  <span className="w-12 shrink-0 text-muted-foreground tabular-nums text-xs">
                    {fmtTime(pStep.startTimePlan)}
                  </span>

                  {/* Name */}
                  <span className="flex-1 min-w-0 font-medium truncate">
                    {pStep.name}
                    {pStep.autoSwitch && (
                      <span className="text-xs text-muted-foreground ml-1.5">
                        {t("brew.prep.autoStep")}
                      </span>
                    )}
                  </span>

                  {/* Temp */}
                  <span className="w-11 shrink-0 text-right text-muted-foreground tabular-nums">
                    {pStep.temperatureC
                      ? `${Number(pStep.temperatureC).toFixed(0)}°C`
                      : ""}
                  </span>

                  {/* Actual start */}
                  <span className="w-12 shrink-0 text-right tabular-nums text-xs">
                    {fmtTime(dbStep?.startTimeReal)}
                  </span>

                  {/* Actual end */}
                  <span className="w-12 shrink-0 text-right tabular-nums text-xs">
                    {fmtTime(dbStep?.endTimeReal)}
                  </span>

                  {/* Plan min */}
                  <span className="w-14 shrink-0 text-right tabular-nums">
                    {pStep.timeMin > 0 ? `${pStep.timeMin}` : "—"}
                  </span>

                  {/* Actual min (calculated) */}
                  <span className="w-14 shrink-0 text-right tabular-nums">
                    {actualMin !== null ? `${actualMin}` : "—"}
                  </span>

                  {/* Delta */}
                  <span
                    className={cn(
                      "w-10 shrink-0 text-right font-mono tabular-nums text-xs",
                      delta !== null && delta < 0 && "text-green-600",
                      delta !== null && delta > 0 && "text-red-600"
                    )}
                  >
                    {delta !== null
                      ? `${delta > 0 ? "+" : ""}${delta}`
                      : "—"}
                  </span>

                  {/* Notes */}
                  {dbStep ? (
                    <Input
                      type="text"
                      className="h-6 w-36 shrink-0 text-xs"
                      placeholder="..."
                      value={localNotes[dbStep.id] ?? ""}
                      onChange={(e): void => {
                        const val = e.target.value;
                        const id = dbStep.id;
                        setLocalNotes((prev) => ({
                          ...prev,
                          [id]: val,
                        }));
                      }}
                      onBlur={(e): void => {
                        saveNotes(dbStep.id, e.target.value);
                      }}
                    />
                  ) : (
                    <span className="w-36 shrink-0" />
                  )}
                </div>

                {/* Hop / ingredient additions (sub-rows from preview) */}
                {pStep.hopAdditions && pStep.hopAdditions.length > 0 && (
                  <div className={cn("ml-14 border-l-2 pl-2 pb-1", colors.border)}>
                    {pStep.hopAdditions.map((hop, hi) => {
                      // Confirmation state from DB hop at same index
                      const dbHop = dbHops && hi < dbHops.length ? dbHops[hi] : null;
                      const confirmed = dbHop?.confirmed ?? false;
                      const actualTime = dbHop?.actualTime ?? null;

                      return (
                        <div
                          key={hi}
                          className="flex items-center gap-2 text-xs text-muted-foreground py-0.5"
                        >
                          <Checkbox
                            className="size-3.5"
                            checked={confirmed}
                            disabled={confirmed || !dbStep}
                            onCheckedChange={(): void => {
                              void handleHopConfirm(pStep.name, hi);
                            }}
                          />
                          {pStep.stepType === "boil" && (
                            <span className="tabular-nums w-14 shrink-0">
                              {hop.addAtMin} min
                            </span>
                          )}
                          <span>
                            {hop.itemName}{" "}
                            <span className="font-medium">
                              {fmtAmount(hop)}
                            </span>
                          </span>
                          {confirmed && actualTime && (
                            <span className="ml-auto text-green-600 tabular-nums">
                              {fmtTime(new Date(actualTime))}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>

        {/* Footer totals */}
        <Separator className="my-1" />
        <div className="flex items-center gap-1 px-2 py-1.5 text-sm font-semibold">
          <span className="w-12 shrink-0" />
          <span className="flex-1 min-w-0">{t("brew.brewing.totalTime")}</span>
          <span className="w-11 shrink-0" />
          <span className="w-12 shrink-0" />
          <span className="w-12 shrink-0" />
          <span className="w-14 shrink-0 text-right tabular-nums">
            {totalPlanMin}
          </span>
          <span className="w-14 shrink-0 text-right tabular-nums">
            {totalActualMin !== null ? totalActualMin : "—"}
          </span>
          <span
            className={cn(
              "w-10 shrink-0 text-right font-mono tabular-nums text-xs",
              totalDelta !== null && totalDelta < 0 && "text-green-600",
              totalDelta !== null && totalDelta > 0 && "text-red-600"
            )}
          >
            {totalDelta !== null
              ? `${totalDelta > 0 ? "+" : ""}${totalDelta}`
              : "—"}
          </span>
          <span className="w-36 shrink-0" />
        </div>
      </section>

      {/* ── Section 2: Hop Timer ────────────────────────────── */}
      {boilPreviewStep && boilPreviewStep.hopAdditions && boilPreviewStep.hopAdditions.length > 0 && (
        <section>
          <h3 className="mb-3 text-lg font-semibold">
            {t("brew.brewing.hopTimer")}
          </h3>
          <div className="rounded-md border p-4">
            <BoilCountdown
              totalSeconds={boilTimeMin * 60}
              onElapsed={(): void => {
                /* timer completed */
              }}
            />
          </div>
        </section>
      )}

      {/* ── Section 3: Stopwatch Timers ─────────────────────── */}
      <section>
        <h3 className="mb-3 text-lg font-semibold">
          {t("brew.brewing.timers")}
        </h3>
        <div className="flex flex-wrap gap-6 rounded-md border p-4">
          <BrewTimer label={t("brew.brewing.timerTotal")} />
          <BrewTimer label={t("brew.brewing.timerRest")} />
          <BrewTimer label={t("brew.brewing.timerBoil")} />
        </div>
      </section>

      {/* ── Footer: Phase Transition Button ─────────────────── */}
      <div className="flex justify-end border-t pt-4">
        <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <AlertDialogTrigger asChild>
            <Button size="lg">
              {t("brew.brewing.finishBrewing")}
              <ArrowRight className="ml-2 size-4" />
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t("brew.brewing.finishBrewing")}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t("brew.brewing.confirmFinish")}
              </AlertDialogDescription>
            </AlertDialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  {t("brew.brewing.ogMeasured")}
                  <span className="text-destructive"> *</span>
                </label>
                <Input
                  type="number"
                  step="0.1"
                  min={0}
                  value={finishOg}
                  onChange={(e): void => setFinishOg(e.target.value)}
                  placeholder="e.g. 12.5"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  {t("brew.brewing.fermenterVolume")}
                  <span className="text-destructive"> *</span>
                </label>
                <Input
                  type="number"
                  step="1"
                  min={0}
                  value={finishVolume}
                  onChange={(e): void => setFinishVolume(e.target.value)}
                  placeholder="e.g. 100"
                />
              </div>
            </div>

            <AlertDialogFooter>
              <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
              <AlertDialogAction
                disabled={!finishOg || !finishVolume || isPending}
                onClick={(e): void => {
                  e.preventDefault();
                  void handleFinishBrewing();
                }}
              >
                {isPending ? "..." : t("brew.brewing.finishBrewing")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
