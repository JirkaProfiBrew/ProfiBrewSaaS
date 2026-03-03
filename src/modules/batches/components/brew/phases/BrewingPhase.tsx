"use client";

import {
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
import { Play, Pause, Square, Check, ArrowRight } from "lucide-react";

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
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

import type { Batch, BatchStep, HopAddition, BatchPhase } from "../../../types";
import {
  getBatchBrewData,
  getBrewingSystemForBatch,
  updateBatchStep,
  updateBatch,
  advanceBatchPhase,
  addBatchMeasurement,
} from "../../../actions";

// ── Constants ──────────────────────────────────────────────────

const BREW_PHASE_ORDER = ["preparation", "mashing", "boiling", "post_boil"] as const;

const BREW_PHASE_LABEL_KEYS: Record<string, string> = {
  preparation: "brew.brewing.phasePreparation",
  mashing: "brew.brewing.phaseMashing",
  lautering: "brew.brewing.phaseLautering",
  boiling: "brew.brewing.phaseBoiling",
  post_boil: "brew.brewing.phasePostBoil",
};

const MEASUREMENT_ROWS = [
  "mashWater",
  "spargeWater",
  "preBoilVolume",
  "postBoilVolume",
  "fermenterVolume",
  "ogMeasured",
] as const;

type MeasurementKey = (typeof MEASUREMENT_ROWS)[number];

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
  const [steps, setSteps] = useState<BatchStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [localActuals, setLocalActuals] = useState<Record<string, string>>({});
  const [localNotes, setLocalNotes] = useState<Record<string, string>>({});
  const [plannedValues, setPlannedValues] = useState<Record<MeasurementKey, string>>({
    mashWater: "",
    spargeWater: "",
    preBoilVolume: "",
    postBoilVolume: "",
    fermenterVolume: "",
    ogMeasured: "",
  });
  const [measurements, setMeasurements] = useState<Record<MeasurementKey, string>>({
    mashWater: "",
    spargeWater: "",
    preBoilVolume: "",
    postBoilVolume: "",
    fermenterVolume: "",
    ogMeasured: "",
  });
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
        const [data, sys] = await Promise.all([
          getBatchBrewData(batchId),
          getBrewingSystemForBatch(batchId),
        ]);
        if (cancelled || !data) return;
        setSteps(data.steps);

        // Initialize localActuals from loaded steps
        const actuals: Record<string, string> = {};
        const notes: Record<string, string> = {};
        for (const step of data.steps) {
          if (step.actualDurationMin !== null) {
            actuals[step.id] = String(step.actualDurationMin);
          }
          if (step.notes) {
            notes[step.id] = step.notes;
          }
        }
        setLocalActuals(actuals);
        setLocalNotes(notes);

        // Compute planned measurement values from batch + brewing system
        const batch = data.batch;
        const batchSizeL = batch.recipeBatchSizeL
          ? Number(batch.recipeBatchSizeL)
          : null;
        const recipeOg = batch.recipeOg ? Number(batch.recipeOg) : null;

        if (batchSizeL && sys) {
          const whirlpoolLossPct = Number(sys.whirlpoolLossPct ?? 10) / 100;
          const evapRatePctHr = Number(sys.evaporationRatePctPerHour ?? 8) / 100;
          // Get boil time from the boil steps
          const boilSteps = data.steps.filter((s) => s.brewPhase === "boiling");
          const boilTimeMin = boilSteps.reduce((sum, s) => sum + (s.timeMin ?? 0), 0) || 60;
          const boilTimeHr = boilTimeMin / 60;

          // fermenter = batch size
          const fermenterVol = batchSizeL;
          // post-boil = fermenter / (1 - whirlpool loss)
          const postBoilVol = fermenterVol / (1 - whirlpoolLossPct);
          // pre-boil = (post-boil + kettle trub) / (1 - evap * hours)
          const preBoilVol = postBoilVol / (1 - evapRatePctHr * boilTimeHr);


          setPlannedValues({
            mashWater: "",
            spargeWater: "",
            preBoilVolume: preBoilVol.toFixed(1),
            postBoilVolume: postBoilVol.toFixed(1),
            fermenterVolume: fermenterVol.toFixed(1),
            ogMeasured: recipeOg ? recipeOg.toFixed(1) : "",
          });
        } else if (batchSizeL) {
          setPlannedValues((prev) => ({
            ...prev,
            fermenterVolume: batchSizeL.toFixed(1),
            ogMeasured: recipeOg ? recipeOg.toFixed(1) : "",
          }));
        }
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

  // ── Grouped steps ──────────────────────────────────────────
  const groupedSteps = useMemo(() => {
    const groups: Array<{ phase: string; steps: BatchStep[] }> = [];
    const phaseMap = new Map<string, BatchStep[]>();

    for (const step of steps) {
      const phase = step.brewPhase ?? "other";
      if (!phaseMap.has(phase)) {
        phaseMap.set(phase, []);
      }
      phaseMap.get(phase)!.push(step);
    }

    // Order by BREW_PHASE_ORDER, then any remaining
    for (const phase of BREW_PHASE_ORDER) {
      const phaseSteps = phaseMap.get(phase);
      if (phaseSteps && phaseSteps.length > 0) {
        groups.push({ phase, steps: phaseSteps });
        phaseMap.delete(phase);
      }
    }
    // Remaining phases not in the predefined order
    for (const [phase, phaseSteps] of phaseMap) {
      if (phaseSteps.length > 0) {
        groups.push({ phase, steps: phaseSteps });
      }
    }

    return groups;
  }, [steps]);

  // ── Boil step with hop additions ───────────────────────────
  const boilStep = useMemo(
    () =>
      steps.find(
        (s) =>
          s.brewPhase === "boiling" &&
          s.hopAdditions &&
          s.hopAdditions.length > 0
      ),
    [steps]
  );

  const boilTimeMin = useMemo(() => {
    const boilSteps = steps.filter((s) => s.brewPhase === "boiling");
    return boilSteps.reduce((sum, s) => sum + (s.timeMin ?? 0), 0);
  }, [steps]);

  // ── Totals ─────────────────────────────────────────────────
  const totalPlanMin = useMemo(
    () =>
      steps.reduce(
        (sum, s) => sum + (s.rampTimeMin ?? 0) + (s.timeMin ?? 0),
        0
      ),
    [steps]
  );

  const totalActualMin = useMemo(() => {
    let sum = 0;
    let hasAny = false;
    for (const step of steps) {
      const localVal = localActuals[step.id];
      if (localVal !== undefined && localVal !== "") {
        sum += Number(localVal) || 0;
        hasAny = true;
      } else if (step.actualDurationMin !== null) {
        sum += step.actualDurationMin;
        hasAny = true;
      }
    }
    return hasAny ? sum : null;
  }, [steps, localActuals]);

  // ── Auto-save actual duration ──────────────────────────────
  const saveActualDuration = useCallback(
    (stepId: string, value: string): void => {
      // Clear previous timer
      if (saveTimers.current[stepId]) {
        clearTimeout(saveTimers.current[stepId]);
      }
      saveTimers.current[stepId] = setTimeout(async () => {
        const numVal = value === "" ? undefined : Number(value);
        if (numVal !== undefined && isNaN(numVal)) return;
        try {
          await updateBatchStep(stepId, {
            actualDurationMin: numVal ?? 0,
          });
        } catch {
          toast.error("Failed to save step duration");
        }
      }, 300);
    },
    []
  );

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

  // ── Hop confirmation ───────────────────────────────────────
  const handleHopConfirm = useCallback(
    async (hopIndex: number): Promise<void> => {
      if (!boilStep || !boilStep.hopAdditions) return;

      const updatedHops: HopAddition[] = boilStep.hopAdditions.map((h, i) => {
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
        const updated = await updateBatchStep(boilStep.id, {
          hopAdditions: updatedHops,
        });
        setSteps((prev) =>
          prev.map((s) => (s.id === boilStep.id ? updated : s))
        );
      } catch {
        toast.error("Failed to confirm hop addition");
      }
    },
    [boilStep]
  );

  // ── Measurement change ─────────────────────────────────────
  const handleMeasurementChange = useCallback(
    (key: MeasurementKey, value: string): void => {
      setMeasurements((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  // ── Phase transition ───────────────────────────────────────
  const handleFinishBrewing = useCallback(async (): Promise<void> => {
    if (!finishOg || !finishVolume) {
      toast.error(t("brew.brewing.confirmFinish"));
      return;
    }

    startTransition(async () => {
      try {
        // Save OG and fermenter volume on the batch
        await updateBatch(batchId, {
          ogActual: finishOg,
          actualVolumeL: finishVolume,
        });

        // Save measurements
        const measurementEntries = Object.entries(measurements).filter(
          ([, v]) => v !== ""
        );
        for (const [key, value] of measurementEntries) {
          await addBatchMeasurement(batchId, {
            measurementType: key === "ogMeasured" ? "gravity" : "volume",
            value: value,
            valuePlato: key === "ogMeasured" ? value : undefined,
            isStart: false,
            isEnd: false,
            notes: key,
          });
        }

        // Advance phase
        await advanceBatchPhase(batchId, "fermentation" as BatchPhase);

        toast.success(t("brew.phaseAdvanced"));
        router.push(`/${locale}/brewery/batches/${batchId}/brew/ferm`);
      } catch {
        toast.error("Failed to finish brewing phase");
      }
    });
  }, [
    batchId,
    finishOg,
    finishVolume,
    measurements,
    t,
    router,
    locale,
    startTransition,
  ]);

  // ── Render helpers ─────────────────────────────────────────
  const getPlanMin = (step: BatchStep): number =>
    (step.rampTimeMin ?? 0) + (step.timeMin ?? 0);

  const getDelta = (step: BatchStep): number | null => {
    const localVal = localActuals[step.id];
    const actual =
      localVal !== undefined && localVal !== ""
        ? Number(localVal)
        : step.actualDurationMin;
    if (actual === null || actual === undefined) return null;
    return actual - getPlanMin(step);
  };

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

  return (
    <div className="space-y-8">
      {/* ── Section 1: Brew Steps Table ─────────────────────── */}
      <section>
        <h3 className="mb-3 text-lg font-semibold">
          {t("brew.brewing.steps")}
        </h3>

        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">#</TableHead>
                <TableHead>{t("brew.brewing.stepName")}</TableHead>
                <TableHead className="w-24 text-right">
                  {t("brew.brewing.targetTemp")}
                </TableHead>
                <TableHead className="w-24 text-right">
                  {t("brew.brewing.plannedMin")}
                </TableHead>
                <TableHead className="w-28 text-right">
                  {t("brew.brewing.actualMin")}
                </TableHead>
                <TableHead className="w-16 text-right">
                  {t("brew.brewing.delta")}
                </TableHead>
                <TableHead className="min-w-[140px]">
                  {t("notes.add").replace("Přidat ", "").replace("Add ", "")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groupedSteps.map((group) => (
                <>
                  {/* Phase separator row */}
                  <TableRow
                    key={`phase-${group.phase}`}
                    className="bg-muted/50"
                  >
                    <TableCell
                      colSpan={7}
                      className="py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                    >
                      {t(
                        BREW_PHASE_LABEL_KEYS[group.phase] ??
                          `steps.phase.${group.phase}`
                      )}
                    </TableCell>
                  </TableRow>

                  {/* Step rows */}
                  {group.steps.map((step) => {
                    const planMin = getPlanMin(step);
                    const delta = getDelta(step);

                    return (
                      <TableRow key={step.id}>
                        <TableCell className="text-muted-foreground">
                          {step.sortOrder}
                        </TableCell>
                        <TableCell className="font-medium">
                          {step.name}
                        </TableCell>
                        <TableCell className="text-right">
                          {step.temperatureC
                            ? `${Number(step.temperatureC).toFixed(0)}°C`
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          {planMin > 0 ? planMin : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            min={0}
                            className="h-7 w-20 text-right ml-auto"
                            value={localActuals[step.id] ?? ""}
                            onChange={(e): void => {
                              const val = e.target.value;
                              setLocalActuals((prev) => ({
                                ...prev,
                                [step.id]: val,
                              }));
                            }}
                            onBlur={(e): void => {
                              saveActualDuration(step.id, e.target.value);
                            }}
                          />
                        </TableCell>
                        <TableCell
                          className={cn(
                            "text-right font-mono text-sm",
                            delta !== null && delta <= 0 && "text-green-600",
                            delta !== null && delta > 0 && "text-red-600"
                          )}
                        >
                          {delta !== null
                            ? `${delta > 0 ? "+" : ""}${delta}`
                            : "—"}
                        </TableCell>
                        <TableCell>
                          <Input
                            type="text"
                            className="h-7 text-sm"
                            placeholder="..."
                            value={localNotes[step.id] ?? ""}
                            onChange={(e): void => {
                              const val = e.target.value;
                              setLocalNotes((prev) => ({
                                ...prev,
                                [step.id]: val,
                              }));
                            }}
                            onBlur={(e): void => {
                              saveNotes(step.id, e.target.value);
                            }}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell colSpan={3} className="font-semibold">
                  {t("brew.brewing.totalTime")}
                </TableCell>
                <TableCell className="text-right font-semibold">
                  {totalPlanMin}
                </TableCell>
                <TableCell className="text-right font-semibold">
                  {totalActualMin !== null ? totalActualMin : "—"}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right font-mono font-semibold",
                    totalDelta !== null && totalDelta <= 0 && "text-green-600",
                    totalDelta !== null && totalDelta > 0 && "text-red-600"
                  )}
                >
                  {totalDelta !== null
                    ? `${totalDelta > 0 ? "+" : ""}${totalDelta}`
                    : "—"}
                </TableCell>
                <TableCell />
              </TableRow>
            </TableFooter>
          </Table>
        </div>
      </section>

      {/* ── Section 2: Hop Timer ────────────────────────────── */}
      {boilStep && boilStep.hopAdditions && boilStep.hopAdditions.length > 0 && (
        <section>
          <h3 className="mb-3 text-lg font-semibold">
            {t("brew.brewing.hopTimer")}
          </h3>

          <div className="mb-4">
            <BoilCountdown
              totalSeconds={boilTimeMin * 60}
              onElapsed={(): void => {
                /* timer completed */
              }}
            />
          </div>

          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("ingredients.columns.name")}</TableHead>
                  <TableHead className="text-right">
                    {t("ingredients.columns.amount")} (g)
                  </TableHead>
                  <TableHead className="text-right">
                    {t("brew.brewing.plannedMin")}
                  </TableHead>
                  <TableHead className="text-center">
                    <Check className="mx-auto size-4" />
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {boilStep.hopAdditions.map((hop, idx) => (
                  <TableRow key={`hop-${idx}`}>
                    <TableCell className="font-medium">
                      {hop.itemName}
                    </TableCell>
                    <TableCell className="text-right">
                      {hop.amountG}
                    </TableCell>
                    <TableCell className="text-right">
                      {hop.addAtMin} min
                    </TableCell>
                    <TableCell className="text-center">
                      <Checkbox
                        checked={hop.confirmed}
                        disabled={hop.confirmed}
                        onCheckedChange={(): void => {
                          void handleHopConfirm(idx);
                        }}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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

      {/* ── Section 4: Measurements ─────────────────────────── */}
      <section>
        <h3 className="mb-3 text-lg font-semibold">
          {t("brew.brewing.measurements")}
        </h3>

        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("brew.brewing.measurements")}</TableHead>
                <TableHead className="w-32 text-right">
                  {t("brew.brewing.planned")}
                </TableHead>
                <TableHead className="w-36 text-right">
                  {t("brew.brewing.actual")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {MEASUREMENT_ROWS.map((key) => (
                <TableRow key={key}>
                  <TableCell className="font-medium">
                    {t(`brew.brewing.${key}`)}
                    {key !== "ogMeasured" && (
                      <span className="ml-1 text-xs text-muted-foreground">
                        (L)
                      </span>
                    )}
                    {key === "ogMeasured" && (
                      <span className="ml-1 text-xs text-muted-foreground">
                        (°P)
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {plannedValues[key] || "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number"
                      step={key === "ogMeasured" ? "0.1" : "1"}
                      min={0}
                      className="h-7 w-28 text-right ml-auto"
                      value={measurements[key]}
                      onChange={(e): void =>
                        handleMeasurementChange(key, e.target.value)
                      }
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
