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
import { Play, Pause, Square, ArrowRight, RefreshCw, Timer } from "lucide-react";

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
import { Progress } from "@/components/ui/progress";
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
  regenBrewSteps,
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

function toTimeInputValue(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = new Date(d);
  if (isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("cs-CZ", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function nowTimeStr(): string {
  const d = new Date();
  return d.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit", hour12: false });
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
  const [localTimes, setLocalTimes] = useState<Record<string, string>>({});
  const [finishOg, setFinishOg] = useState("");
  const [finishVolume, setFinishVolume] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  // ── Countdown timer state ─────────────────────────────────
  const [timerStep, setTimerStep] = useState<{
    previewIdx: number;
    dbStepId: string;
    name: string;
    tempC: string | null;
    targetSec: number;
    remainingSec: number;       // derived from timestamps each tick
    startedAt: number;          // Date.now() when last started, 0 when paused
    pausedElapsed: number;      // accumulated seconds from previous runs
    status: "running" | "paused";
  } | null>(null);
  const [timerDoneOpen, setTimerDoneOpen] = useState(false);
  const [timerStopOpen, setTimerStopOpen] = useState(false);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Boil hop timer state ────────────────────────────────────
  interface BoilTimerGroup {
    addAtMin: number;
    hops: { itemName: string; amountG: number; unitSymbol?: string | null }[];
    waitSec: number;            // (totalBoilMin - addAtMin) * 60
    hopIndices: number[];       // indices into hopAdditions array
    confirmed: boolean;
    confirmedAt: string | null;
  }
  const [boilTimer, setBoilTimer] = useState<{
    dbStepId: string;
    previewIdx: number;
    totalSec: number;
    elapsedSec: number;         // derived from timestamps each tick
    startedAt: number;          // Date.now() when last started, 0 when paused
    pausedElapsed: number;      // accumulated seconds from previous runs
    status: "running" | "paused";
    groups: BoilTimerGroup[];
  } | null>(null);
  const [boilTimerDoneOpen, setBoilTimerDoneOpen] = useState(false);
  const [boilTimerStopOpen, setBoilTimerStopOpen] = useState(false);
  const boilTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── localStorage persistence for timers ───────────────────────
  const mashKey = `pb_mash_timer_${batchId}`;
  const boilKey = `pb_boil_timer_${batchId}`;
  const timerRestoredRef = useRef(false);

  // Restore from localStorage on mount (MUST run before save effects)
  useEffect(() => {
    try {
      const savedMash = localStorage.getItem(mashKey);
      if (savedMash) {
        const parsed = JSON.parse(savedMash) as typeof timerStep;
        if (parsed && parsed.targetSec > 0) {
          if (parsed.status === "running" && parsed.startedAt) {
            const elapsed = parsed.pausedElapsed + (Date.now() - parsed.startedAt) / 1000;
            const remaining = Math.max(0, Math.ceil(parsed.targetSec - elapsed));
            if (remaining > 0) {
              setTimerStep({ ...parsed, remainingSec: remaining });
            } else {
              setTimerStep({ ...parsed, remainingSec: 0, pausedElapsed: parsed.targetSec, startedAt: 0, status: "paused" });
              setTimerDoneOpen(true);
            }
          } else {
            setTimerStep(parsed);
          }
        }
      }
    } catch { /* ignore corrupt data */ }

    try {
      const savedBoil = localStorage.getItem(boilKey);
      if (savedBoil) {
        const parsed = JSON.parse(savedBoil) as typeof boilTimer;
        if (parsed && parsed.totalSec > 0) {
          if (parsed.status === "running" && parsed.startedAt) {
            const elapsed = Math.floor(parsed.pausedElapsed + (Date.now() - parsed.startedAt) / 1000);
            if (elapsed >= parsed.totalSec) {
              setBoilTimer({ ...parsed, elapsedSec: parsed.totalSec, pausedElapsed: parsed.totalSec, startedAt: 0, status: "paused" });
              if (parsed.groups.every((g) => g.confirmed)) {
                setBoilTimerDoneOpen(true);
              }
            } else {
              setBoilTimer({ ...parsed, elapsedSec: elapsed });
            }
          } else {
            setBoilTimer(parsed);
          }
        }
      }
    } catch { /* ignore corrupt data */ }

    // Mark as restored so save effects can start persisting
    timerRestoredRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save to localStorage on changes (only after restore)
  useEffect(() => {
    if (!timerRestoredRef.current) return;
    if (timerStep) {
      localStorage.setItem(mashKey, JSON.stringify(timerStep));
    } else {
      localStorage.removeItem(mashKey);
    }
  }, [timerStep, mashKey]);

  useEffect(() => {
    if (!timerRestoredRef.current) return;
    if (boilTimer) {
      localStorage.setItem(boilKey, JSON.stringify(boilTimer));
    } else {
      localStorage.removeItem(boilKey);
    }
  }, [boilTimer, boilKey]);

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
        const times: Record<string, string> = {};
        for (const step of data.steps) {
          if (step.notes) {
            notes[step.id] = step.notes;
          }
          times[`start_${step.id}`] = toTimeInputValue(step.startTimeReal);
          times[`end_${step.id}`] = toTimeInputValue(step.endTimeReal);
        }
        setLocalNotes(notes);
        setLocalTimes(times);
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
        // Regenerate DB steps (preserves tracking data) + refresh preview
        await regenBrewSteps(batchId);
        const [data, preview] = await Promise.all([
          getBatchBrewData(batchId),
          getBrewStepPreview(batchId),
        ]);
        if (data) {
          setSteps(data.steps);
          const notes: Record<string, string> = {};
          const times: Record<string, string> = {};
          for (const step of data.steps) {
            if (step.notes) notes[step.id] = step.notes;
            times[`start_${step.id}`] = toTimeInputValue(step.startTimeReal);
            times[`end_${step.id}`] = toTimeInputValue(step.endTimeReal);
          }
          setLocalNotes(notes);
          setLocalTimes(times);
        }
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

  // ── Auto-save actual times ──────────────────────────────────
  const saveTime = useCallback(
    (stepId: string, field: "startTimeReal" | "endTimeReal", timeStr: string): void => {
      const timerKey = `${field}_${stepId}`;
      if (saveTimers.current[timerKey]) {
        clearTimeout(saveTimers.current[timerKey]);
      }
      saveTimers.current[timerKey] = setTimeout(async () => {
        try {
          // Build full ISO string from batch planned date + entered time
          let isoValue: string | null = null;
          if (timeStr && batch?.plannedDate) {
            const base = new Date(batch.plannedDate);
            const [hh, mm] = timeStr.split(":").map(Number);
            if (!isNaN(hh!) && !isNaN(mm!)) {
              base.setHours(hh!, mm!, 0, 0);
              isoValue = base.toISOString();
            }
          }
          const updated = await updateBatchStep(stepId, { [field]: isoValue });
          setSteps((prev) => prev.map((s) => (s.id === stepId ? updated : s)));
        } catch {
          toast.error("Failed to save time");
        }
      }, 500);
    },
    [batch?.plannedDate]
  );

  // ── Stamp Start: record current time as actual start ────────
  const handleStampStart = useCallback(
    (dbStepId: string): void => {
      const timeStr = nowTimeStr();
      setLocalTimes((prev) => ({ ...prev, [`start_${dbStepId}`]: timeStr }));
      saveTime(dbStepId, "startTimeReal", timeStr);
    },
    [saveTime]
  );

  // ── Stamp Stop: record current time as actual end (only current step)
  const handleStampStop = useCallback(
    (dbStepId: string): void => {
      const timeStr = nowTimeStr();
      setLocalTimes((prev) => ({ ...prev, [`end_${dbStepId}`]: timeStr }));
      saveTime(dbStepId, "endTimeReal", timeStr);
    },
    [saveTime]
  );

  // ── Countdown timer effect (timestamp-based) ─────────────────
  useEffect(() => {
    if (timerStep?.status === "running") {
      timerIntervalRef.current = setInterval(() => {
        setTimerStep((prev) => {
          if (!prev || !prev.startedAt) return prev;
          const elapsed = prev.pausedElapsed + (Date.now() - prev.startedAt) / 1000;
          const remaining = Math.max(0, Math.ceil(prev.targetSec - elapsed));
          if (remaining <= 0) {
            setTimerDoneOpen(true);
            return { ...prev, remainingSec: 0, pausedElapsed: prev.targetSec, startedAt: 0, status: "paused" as const };
          }
          return { ...prev, remainingSec: remaining };
        });
      }, 1000);
    } else if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    return (): void => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    };
  }, [timerStep?.status]);

  // ── Start countdown timer for a mashing step ──────────────────
  const handleTimerStart = useCallback(
    (previewIdx: number, dbStepId: string, pStep: BrewStepPreviewItem): void => {
      // Stamp actual start
      handleStampStart(dbStepId);
      // Start countdown
      setTimerStep({
        previewIdx,
        dbStepId,
        name: pStep.name,
        tempC: pStep.temperatureC,
        targetSec: pStep.timeMin * 60,
        remainingSec: pStep.timeMin * 60,
        startedAt: Date.now(),
        pausedElapsed: 0,
        status: "running",
      });
    },
    [handleStampStart]
  );

  // ── Timer done/stop → stamp end time + close ──────────────────
  const handleTimerFinish = useCallback((): void => {
    if (timerStep) {
      handleStampStop(timerStep.dbStepId);
    }
    setTimerStep(null);
    setTimerDoneOpen(false);
    setTimerStopOpen(false);
  }, [timerStep, handleStampStop]);

  // ── Boil timer countdown effect (timestamp-based) ────────────────
  useEffect(() => {
    if (boilTimer?.status === "running") {
      boilTimerRef.current = setInterval(() => {
        setBoilTimer((prev) => {
          if (!prev || !prev.startedAt) return prev;
          const elapsed = Math.floor(prev.pausedElapsed + (Date.now() - prev.startedAt) / 1000);
          if (elapsed >= prev.totalSec) {
            const allConfirmed = prev.groups.every((g) => g.confirmed);
            if (allConfirmed) {
              setBoilTimerDoneOpen(true);
            }
            return { ...prev, elapsedSec: prev.totalSec, pausedElapsed: prev.totalSec, startedAt: 0, status: "paused" as const };
          }
          return { ...prev, elapsedSec: elapsed };
        });
      }, 1000);
    } else if (boilTimerRef.current) {
      clearInterval(boilTimerRef.current);
      boilTimerRef.current = null;
    }
    return (): void => {
      if (boilTimerRef.current) {
        clearInterval(boilTimerRef.current);
        boilTimerRef.current = null;
      }
    };
  }, [boilTimer?.status]);

  // ── Start boil timer ────────────────────────────────────────────
  const handleBoilTimerStart = useCallback(
    (previewIdx: number, dbStepId: string, pStep: BrewStepPreviewItem): void => {
      if (!pStep.hopAdditions || pStep.hopAdditions.length === 0) return;
      const totalSec = pStep.timeMin * 60;

      // Group hops by addAtMin
      const groupMap = new Map<number, { hops: { itemName: string; amountG: number; unitSymbol?: string | null }[]; hopIndices: number[] }>();
      pStep.hopAdditions.forEach((hop, i) => {
        const key = hop.addAtMin;
        const existing = groupMap.get(key);
        if (existing) {
          existing.hops.push({ itemName: hop.itemName, amountG: hop.amountG, unitSymbol: hop.unitSymbol });
          existing.hopIndices.push(i);
        } else {
          groupMap.set(key, {
            hops: [{ itemName: hop.itemName, amountG: hop.amountG, unitSymbol: hop.unitSymbol }],
            hopIndices: [i],
          });
        }
      });

      // Build groups sorted by waitSec ascending (first to add first)
      const groups: BoilTimerGroup[] = Array.from(groupMap.entries())
        .map(([addAtMin, data]) => ({
          addAtMin,
          hops: data.hops,
          waitSec: (pStep.timeMin - addAtMin) * 60,
          hopIndices: data.hopIndices,
          confirmed: false,
          confirmedAt: null,
        }))
        .sort((a, b) => a.waitSec - b.waitSec);

      // Stamp actual start
      handleStampStart(dbStepId);
      setBoilTimer({ dbStepId, previewIdx, totalSec, elapsedSec: 0, startedAt: Date.now(), pausedElapsed: 0, status: "running", groups });
    },
    [handleStampStart]
  );

  // ── Confirm a boil timer hop group ──────────────────────────────
  const handleBoilTimerConfirmGroup = useCallback(
    async (groupIdx: number): Promise<void> => {
      if (!boilTimer) return;
      const group = boilTimer.groups[groupIdx];
      if (!group || group.confirmed) return;

      const now = new Date().toISOString();

      // Update local boil timer state
      setBoilTimer((prev) => {
        if (!prev) return null;
        const newGroups = prev.groups.map((g, i) =>
          i === groupIdx ? { ...g, confirmed: true, confirmedAt: now } : g
        );
        // If all groups confirmed and elapsed >= total, show done
        if (newGroups.every((g) => g.confirmed) && prev.elapsedSec >= prev.totalSec) {
          setBoilTimerDoneOpen(true);
        }
        return { ...prev, groups: newGroups };
      });

      // Update DB: confirm each hop in this group
      const dbStep = stepTrackingMap.get(
        previewSteps.find((_, i) => i === boilTimer.previewIdx)?.name ?? ""
      );
      if (!dbStep || !dbStep.hopAdditions) return;

      const updatedHops: HopAddition[] = dbStep.hopAdditions.map((h, i) => {
        if (group.hopIndices.includes(i)) {
          return { ...h, confirmed: true, actualTime: now };
        }
        return h;
      });

      try {
        const updated = await updateBatchStep(dbStep.id, { hopAdditions: updatedHops });
        setSteps((prev) => prev.map((s) => (s.id === dbStep.id ? updated : s)));
      } catch {
        toast.error("Failed to confirm hop addition");
      }
    },
    [boilTimer, stepTrackingMap, previewSteps]
  );

  // ── Boil timer finish (stop or done) ────────────────────────────
  const handleBoilTimerFinish = useCallback((): void => {
    if (boilTimer) {
      handleStampStop(boilTimer.dbStepId);
    }
    setBoilTimer(null);
    setBoilTimerDoneOpen(false);
    setBoilTimerStopOpen(false);
  }, [boilTimer, handleStampStop]);

  // ── Auto-fill heat step times from neighbours ──────────────────
  // Key by preview index (heat steps may have no DB step)
  const heatAutoTimes = useMemo(() => {
    const map = new Map<number, { autoStart: string; autoEnd: string }>();
    for (let i = 0; i < previewSteps.length; i++) {
      const pStep = previewSteps[i]!;
      if (pStep.stepType !== "heat") continue;

      let autoStart = "";
      let autoEnd = "";

      // start = previous step's actual end
      const prev = previewSteps[i - 1];
      if (prev) {
        const prevDb = stepTrackingMap.get(prev.name);
        if (prevDb) autoStart = localTimes[`end_${prevDb.id}`] ?? "";
      }

      // end = next step's actual start
      const next = previewSteps[i + 1];
      if (next) {
        const nextDb = stepTrackingMap.get(next.name);
        if (nextDb) autoEnd = localTimes[`start_${nextDb.id}`] ?? "";
      }

      map.set(i, { autoStart, autoEnd });
    }
    return map;
  }, [previewSteps, stepTrackingMap, localTimes]);

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

        {/* Countdown timer panel */}
        {timerStep && (
          <div className="rounded-lg border-2 border-amber-400 bg-amber-50 p-3 mb-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium flex items-center gap-1.5">
                <Timer className="size-4 text-amber-600" />
                {timerStep.name}
                {timerStep.tempC && (
                  <span className="text-muted-foreground">· {Number(timerStep.tempC).toFixed(0)}°C</span>
                )}
              </span>
              <span className="font-mono text-2xl font-bold tabular-nums">
                {Math.floor(timerStep.remainingSec / 60).toString().padStart(2, "0")}
                :{(timerStep.remainingSec % 60).toString().padStart(2, "0")}
                <span className="text-sm font-normal text-muted-foreground ml-1">
                  / {Math.floor(timerStep.targetSec / 60).toString().padStart(2, "0")}
                  :{(timerStep.targetSec % 60).toString().padStart(2, "0")}
                </span>
              </span>
            </div>
            <Progress
              value={((timerStep.targetSec - timerStep.remainingSec) / timerStep.targetSec) * 100}
              className={cn(
                "h-2",
                timerStep.remainingSec / timerStep.targetSec < 0.2 && timerStep.remainingSec > 0
                  ? "[&>div]:bg-amber-500"
                  : "[&>div]:bg-green-500"
              )}
            />
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={(): void => {
                  setTimerStep((prev) => {
                    if (!prev) return null;
                    if (prev.status === "running") {
                      // Pause: accumulate elapsed, clear startedAt
                      const elapsed = prev.startedAt ? (Date.now() - prev.startedAt) / 1000 : 0;
                      return { ...prev, pausedElapsed: prev.pausedElapsed + elapsed, startedAt: 0, status: "paused" as const };
                    }
                    // Resume: set new startedAt
                    return { ...prev, startedAt: Date.now(), status: "running" as const };
                  });
                }}
              >
                {timerStep.status === "running" ? (
                  <><Pause className="mr-1 size-3.5" />{t("brew.brewing.timerPause")}</>
                ) : (
                  <><Play className="mr-1 size-3.5" />{t("brew.brewing.timerResume")}</>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={(): void => setTimerStopOpen(true)}
              >
                <Square className="mr-1 size-3.5" />
                {t("brew.brewing.hopTimerStop")}
              </Button>
            </div>
          </div>
        )}

        {/* Timer stop confirmation dialog */}
        <AlertDialog open={timerStopOpen} onOpenChange={setTimerStopOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("brew.brewing.timerStopTitle")}</AlertDialogTitle>
              <AlertDialogDescription>{t("brew.brewing.timerStopMsg")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
              <AlertDialogAction onClick={handleTimerFinish}>{t("actions.confirm")}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Timer done dialog */}
        <AlertDialog open={timerDoneOpen} onOpenChange={setTimerDoneOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("brew.brewing.timerFinishedTitle")}</AlertDialogTitle>
              <AlertDialogDescription>{t("brew.brewing.timerFinishedMsg")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogAction onClick={handleTimerFinish}>{t("actions.confirm")}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Boil hop timer panel */}
        {boilTimer && (
          <div className="rounded-lg border-2 border-orange-400 bg-orange-50 p-3 mb-3 space-y-3">
            {/* Master header: title + elapsed / total + controls */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium flex items-center gap-1.5">
                <Timer className="size-4 text-orange-600" />
                {t("brew.brewing.boilTimerTitle")}
              </span>
              <span className="font-mono text-2xl font-bold tabular-nums">
                {Math.floor(boilTimer.elapsedSec / 60).toString().padStart(2, "0")}
                :{(boilTimer.elapsedSec % 60).toString().padStart(2, "0")}
                <span className="text-sm font-normal text-muted-foreground ml-1">
                  / {Math.floor(boilTimer.totalSec / 60).toString().padStart(2, "0")}
                  :{(boilTimer.totalSec % 60).toString().padStart(2, "0")}
                </span>
              </span>
            </div>
            <Progress
              value={(boilTimer.elapsedSec / boilTimer.totalSec) * 100}
              className="h-2 [&>div]:bg-orange-500"
            />

            {/* Hop groups */}
            <div className="space-y-2">
              {boilTimer.groups.map((group, gi) => {
                const remainingSec = Math.max(0, group.waitSec - boilTimer.elapsedSec);
                const isReady = boilTimer.elapsedSec >= group.waitSec && !group.confirmed;
                const isDone = group.confirmed;
                // Progress: 0% at start → 100% when waitSec reached
                const progressPct = group.waitSec > 0
                  ? Math.min(100, (boilTimer.elapsedSec / group.waitSec) * 100)
                  : 100;

                return (
                  <div
                    key={gi}
                    className={cn(
                      "relative rounded-md border px-3 py-2 text-sm overflow-hidden",
                      isDone && "border-green-300",
                      isReady && "border-amber-400 animate-pulse",
                      !isDone && !isReady && "border-orange-200"
                    )}
                  >
                    {/* Background fill — progressive coloring */}
                    <div
                      className={cn(
                        "absolute inset-y-0 left-0 transition-[width] duration-1000 ease-linear",
                        isDone && "bg-green-100",
                        isReady && "bg-amber-100",
                        !isDone && !isReady && "bg-orange-100/70"
                      )}
                      style={{ width: isDone ? "100%" : `${progressPct}%` }}
                    />
                    {/* Unfilled portion */}
                    {!isDone && (
                      <div className="absolute inset-y-0 right-0 bg-white/60" style={{ width: `${100 - progressPct}%` }} />
                    )}

                    <div className="relative flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <span className="font-medium">{group.addAtMin} min</span>
                        <span className="text-muted-foreground mx-1">—</span>
                        {group.hops.map((h, hi) => (
                          <span key={hi}>
                            {hi > 0 && ", "}
                            {h.itemName}{" "}
                            <span className="font-medium">{fmtAmount(h as HopAddition)}</span>
                          </span>
                        ))}
                      </div>
                      {isDone && group.confirmedAt && (
                        <span className="text-green-600 font-medium whitespace-nowrap flex items-center gap-1">
                          {t("brew.brewing.boilTimerAdded")} {fmtTime(new Date(group.confirmedAt))}
                        </span>
                      )}
                      {isReady && (
                        <Button
                          size="sm"
                          variant="default"
                          className="bg-amber-600 hover:bg-amber-700 shrink-0"
                          onClick={(): void => { void handleBoilTimerConfirmGroup(gi); }}
                        >
                          {t("brew.brewing.boilTimerConfirm")}
                        </Button>
                      )}
                      {!isDone && !isReady && (
                        <span className="font-mono tabular-nums text-muted-foreground whitespace-nowrap">
                          {Math.floor(remainingSec / 60).toString().padStart(2, "0")}
                          :{(remainingSec % 60).toString().padStart(2, "0")}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Controls */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={(): void => {
                  setBoilTimer((prev) => {
                    if (!prev) return null;
                    if (prev.status === "running") {
                      const elapsed = prev.startedAt ? (Date.now() - prev.startedAt) / 1000 : 0;
                      return { ...prev, pausedElapsed: prev.pausedElapsed + elapsed, startedAt: 0, status: "paused" as const };
                    }
                    return { ...prev, startedAt: Date.now(), status: "running" as const };
                  });
                }}
              >
                {boilTimer.status === "running" ? (
                  <><Pause className="mr-1 size-3.5" />{t("brew.brewing.hopTimerPause")}</>
                ) : (
                  <><Play className="mr-1 size-3.5" />{t("brew.brewing.hopTimerResume")}</>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={(): void => setBoilTimerStopOpen(true)}
              >
                <Square className="mr-1 size-3.5" />
                {t("brew.brewing.hopTimerStop")}
              </Button>
            </div>
          </div>
        )}

        {/* Boil timer stop confirmation */}
        <AlertDialog open={boilTimerStopOpen} onOpenChange={setBoilTimerStopOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("brew.brewing.boilTimerStopTitle")}</AlertDialogTitle>
              <AlertDialogDescription>{t("brew.brewing.boilTimerStopMsg")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
              <AlertDialogAction onClick={handleBoilTimerFinish}>{t("actions.confirm")}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Boil timer done dialog */}
        <AlertDialog open={boilTimerDoneOpen} onOpenChange={setBoilTimerDoneOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("brew.brewing.boilTimerDoneTitle")}</AlertDialogTitle>
              <AlertDialogDescription>{t("brew.brewing.boilTimerDoneMsg")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogAction onClick={handleBoilTimerFinish}>{t("actions.confirm")}</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Column headers */}
        <div className="flex items-center gap-1.5 px-2 pb-1.5 text-[11px] font-medium text-muted-foreground border-b">
          <span className="w-11 shrink-0">{t("brew.brewing.planTime")}</span>
          <span className="flex-1 min-w-0">{t("brew.brewing.stepName")}</span>
          <span className="w-8 shrink-0 text-right">°C</span>
          <span className="w-11 shrink-0" />
          <span className="w-11 shrink-0 text-right">{t("brew.brewing.actualStart")}</span>
          <span className="w-11 shrink-0 text-right">{t("brew.brewing.actualEnd")}</span>
          <span className="w-8 shrink-0 text-right">{t("brew.brewing.planCalcMin")}</span>
          <span className="w-8 shrink-0 text-right">{t("brew.brewing.actualCalcMin")}</span>
          <span className="w-7 shrink-0 text-right">&Delta;</span>
          <span className="min-w-20 flex-1">{t("brew.brewing.note")}</span>
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
                    "flex items-center gap-1.5 py-1 px-2 border-l-2 text-xs",
                    colors.border,
                    pStep.stepType === "heat" && "opacity-70"
                  )}
                >
                  {/* Plan time */}
                  <span className="w-11 shrink-0 text-muted-foreground tabular-nums">
                    {fmtTime(pStep.startTimePlan)}
                  </span>

                  {/* Name */}
                  <span className="flex-1 min-w-0 text-sm font-medium truncate">
                    {pStep.name}
                    {pStep.autoSwitch && (
                      <span className="text-xs text-muted-foreground ml-1">
                        {t("brew.prep.autoStep")}
                      </span>
                    )}
                  </span>

                  {/* Temp */}
                  <span className="w-8 shrink-0 text-right text-muted-foreground tabular-nums">
                    {pStep.temperatureC
                      ? `${Number(pStep.temperatureC).toFixed(0)}°`
                      : ""}
                  </span>

                  {/* Start / Stop stamp buttons + Timer */}
                  {dbStep ? (
                    <span className="w-11 shrink-0 flex items-center justify-center gap-0">
                      <button
                        type="button"
                        title={t("brew.brewing.stampStart")}
                        className="p-0.5 text-muted-foreground hover:text-green-600 transition-colors"
                        onClick={(): void => handleStampStart(dbStep.id)}
                      >
                        <Play className="size-3" />
                      </button>
                      <button
                        type="button"
                        title={t("brew.brewing.stampStop")}
                        className="p-0.5 text-muted-foreground hover:text-red-600 transition-colors"
                        onClick={(): void => handleStampStop(dbStep.id)}
                      >
                        <Square className="size-3" />
                      </button>
                      {pStep.brewPhase === "mashing" && pStep.stepType !== "heat" && pStep.timeMin > 0 && (
                        <button
                          type="button"
                          title={t("brew.brewing.startTimer")}
                          className={cn(
                            "p-0.5 transition-colors",
                            timerStep?.dbStepId === dbStep.id
                              ? "text-amber-600"
                              : "text-muted-foreground hover:text-amber-600"
                          )}
                          onClick={(): void => handleTimerStart(idx, dbStep.id, pStep)}
                        >
                          <Timer className="size-3" />
                        </button>
                      )}
                      {pStep.stepType === "boil" && pStep.hopAdditions && pStep.hopAdditions.length > 0 && (
                        <button
                          type="button"
                          title={t("brew.brewing.boilTimerStart")}
                          className={cn(
                            "p-0.5 transition-colors",
                            boilTimer?.dbStepId === dbStep.id
                              ? "text-orange-600"
                              : "text-muted-foreground hover:text-orange-600"
                          )}
                          onClick={(): void => handleBoilTimerStart(idx, dbStep.id, pStep)}
                        >
                          <Timer className="size-3" />
                        </button>
                      )}
                    </span>
                  ) : (
                    <span className="w-11 shrink-0" />
                  )}

                  {/* Actual start */}
                  {(() => {
                    const isHeat = pStep.stepType === "heat";
                    const heatAuto = isHeat ? heatAutoTimes.get(idx) : undefined;
                    if (dbStep) {
                      const ownVal = localTimes[`start_${dbStep.id}`] ?? "";
                      const autoVal = heatAuto?.autoStart ?? "";
                      const displayVal = ownVal || autoVal;
                      const isAuto = isHeat && !ownVal && autoVal !== "";
                      return (
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder="—"
                          maxLength={5}
                          className={cn(
                            "w-11 shrink-0 text-xs tabular-nums text-center bg-transparent border-b border-dashed border-muted-foreground/40 hover:border-foreground/60 focus:border-primary focus:outline-none py-0 px-0",
                            isAuto && "text-muted-foreground/60 italic"
                          )}
                          value={displayVal}
                          onChange={(e): void => {
                            const val = e.target.value;
                            const id = dbStep.id;
                            setLocalTimes((prev) => ({ ...prev, [`start_${id}`]: val }));
                          }}
                          onBlur={(e): void => {
                            const val = e.target.value.trim();
                            if (/^\d{1,2}:\d{2}$/.test(val) || val === "") {
                              saveTime(dbStep.id, "startTimeReal", val);
                            }
                          }}
                        />
                      );
                    }
                    // Heat step without DB record — show auto-derived value read-only
                    if (isHeat && heatAuto?.autoStart) {
                      return (
                        <span className="w-11 shrink-0 text-xs tabular-nums text-center text-muted-foreground/60 italic">
                          {heatAuto.autoStart}
                        </span>
                      );
                    }
                    return <span className="w-11 shrink-0 text-center text-muted-foreground">—</span>;
                  })()}

                  {/* Actual end */}
                  {(() => {
                    const isHeat = pStep.stepType === "heat";
                    const heatAuto = isHeat ? heatAutoTimes.get(idx) : undefined;
                    if (dbStep) {
                      const ownVal = localTimes[`end_${dbStep.id}`] ?? "";
                      const autoVal = heatAuto?.autoEnd ?? "";
                      const displayVal = ownVal || autoVal;
                      const isAuto = isHeat && !ownVal && autoVal !== "";
                      return (
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder="—"
                          maxLength={5}
                          className={cn(
                            "w-11 shrink-0 text-xs tabular-nums text-center bg-transparent border-b border-dashed border-muted-foreground/40 hover:border-foreground/60 focus:border-primary focus:outline-none py-0 px-0",
                            isAuto && "text-muted-foreground/60 italic"
                          )}
                          value={displayVal}
                          onChange={(e): void => {
                            const val = e.target.value;
                          const id = dbStep.id;
                          setLocalTimes((prev) => ({ ...prev, [`end_${id}`]: val }));
                        }}
                        onBlur={(e): void => {
                          const val = e.target.value.trim();
                          if (/^\d{1,2}:\d{2}$/.test(val) || val === "") {
                            saveTime(dbStep.id, "endTimeReal", val);
                          }
                        }}
                        />
                      );
                    }
                    // Heat step without DB record — show auto-derived value read-only
                    if (isHeat && heatAuto?.autoEnd) {
                      return (
                        <span className="w-11 shrink-0 text-xs tabular-nums text-center text-muted-foreground/60 italic">
                          {heatAuto.autoEnd}
                        </span>
                      );
                    }
                    return <span className="w-11 shrink-0 text-center text-muted-foreground">—</span>;
                  })()}

                  {/* Plan min */}
                  <span className="w-8 shrink-0 text-right tabular-nums">
                    {pStep.timeMin > 0 ? `${pStep.timeMin}` : "—"}
                  </span>

                  {/* Actual min (calculated) */}
                  <span className="w-8 shrink-0 text-right tabular-nums">
                    {actualMin !== null ? `${actualMin}` : "—"}
                  </span>

                  {/* Delta */}
                  <span
                    className={cn(
                      "w-7 shrink-0 text-right font-mono tabular-nums",
                      delta !== null && delta < 0 && "text-green-600",
                      delta !== null && delta > 0 && "text-red-600"
                    )}
                  >
                    {delta !== null
                      ? `${delta > 0 ? "+" : ""}${delta}`
                      : ""}
                  </span>

                  {/* Notes */}
                  {dbStep ? (
                    <Input
                      type="text"
                      className="h-5 min-w-20 flex-1 text-xs px-1"
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
                    <span className="min-w-20 flex-1" />
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
                            {hop.recipeNotes && (
                              <span className="italic ml-1">— {hop.recipeNotes}</span>
                            )}
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
        <div className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-semibold">
          <span className="w-11 shrink-0" />
          <span className="flex-1 min-w-0 text-sm">{t("brew.brewing.totalTime")}</span>
          <span className="w-8 shrink-0" />
          <span className="w-11 shrink-0" />
          <span className="w-11 shrink-0" />
          <span className="w-11 shrink-0" />
          <span className="w-8 shrink-0 text-right tabular-nums">
            {totalPlanMin}
          </span>
          <span className="w-8 shrink-0 text-right tabular-nums">
            {totalActualMin !== null ? totalActualMin : "—"}
          </span>
          <span
            className={cn(
              "w-7 shrink-0 text-right font-mono tabular-nums",
              totalDelta !== null && totalDelta < 0 && "text-green-600",
              totalDelta !== null && totalDelta > 0 && "text-red-600"
            )}
          >
            {totalDelta !== null
              ? `${totalDelta > 0 ? "+" : ""}${totalDelta}`
              : "—"}
          </span>
          <span className="min-w-20 flex-1" />
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
