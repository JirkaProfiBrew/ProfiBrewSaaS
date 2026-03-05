"use client";

import { useState, useCallback, useTransition, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { useParams, usePathname, useRouter } from "next/navigation";
import { ArrowLeft, Play, Pause, Square, ScrollText, StickyNote, Timer, Volume2, VolumeX } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

import { BeerGlass } from "@/components/ui/beer-glass";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import type { Batch, BatchStep, BatchMeasurement, BatchNote, BatchPhase, PhaseHistory } from "../../types";
import type { RecipeCalculationResult } from "@/modules/recipes/types";
import { getLatestRecipeCalculation } from "@/modules/recipes/actions";
import { addBatchNote } from "../../actions";
import { BatchPhaseBar } from "./BatchPhaseBar";
import { BrewSidebar } from "./BrewSidebar";

// ── Timer sound ────────────────────────────────────────────────

const LS_TIMER_SOUND = "pb_timer_sound";

function getTimerSoundPref(): boolean {
  try { return localStorage.getItem(LS_TIMER_SOUND) !== "off"; } catch { return true; }
}

function setTimerSoundPref(on: boolean): void {
  try { localStorage.setItem(LS_TIMER_SOUND, on ? "on" : "off"); } catch { /* */ }
}

function playTimerBeep(repeat = 3): void {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    let t = ctx.currentTime;
    for (let i = 0; i < repeat; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.value = 0.3;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.15);
      t += 0.3;
    }
    setTimeout(() => ctx.close(), repeat * 300 + 200);
  } catch { /* AudioContext not available */ }
}

interface BatchBrewShellProps {
  batch: Batch;
  steps: BatchStep[];
  measurements: BatchMeasurement[];
  notes: BatchNote[];
  currentPhase: BatchPhase;
  phaseHistory: PhaseHistory;
  children: React.ReactNode;
}

export function BatchBrewShell({
  batch,
  steps,
  measurements,
  notes,
  currentPhase,
  phaseHistory,
  children,
}: BatchBrewShellProps): React.ReactNode {
  const t = useTranslations("batches");
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const locale = params.locale as string;

  // Extract current brew phase segment from URL (e.g. /brew/prep → prep)
  const brewPhaseSegment = pathname.match(/\/brew\/(\w+)/)?.[1] ?? "";
  const [isPending, startTransition] = useTransition();

  // Timer sound setting (shared with BrewingPhase via localStorage)
  const [timerSound, setTimerSound] = useState(true);
  useEffect(() => { setTimerSound(getTimerSoundPref()); }, []);
  const timerSoundRef = useRef(timerSound);
  timerSoundRef.current = timerSound;
  const toggleTimerSound = useCallback((): void => {
    setTimerSound((v) => { const next = !v; setTimerSoundPref(next); return next; });
  }, []);

  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [noteText, setNoteText] = useState("");

  // ── General timer state (timestamp-based + localStorage) ────
  const [genTimer, setGenTimer] = useState<{
    targetSec: number;
    remainingSec: number;        // derived from timestamps each tick
    startedAt: number;           // Date.now() when last started, 0 when paused/idle
    pausedElapsed: number;       // accumulated seconds from previous runs
    status: "idle" | "running" | "paused";
  } | null>(null);
  const [genTimerInput, setGenTimerInput] = useState("");
  const [genTimerDoneOpen, setGenTimerDoneOpen] = useState(false);
  const [genTimerStopOpen, setGenTimerStopOpen] = useState(false);
  const genTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const genTimerLsKey = `pb_gen_timer_${batch.id}`;

  // Countdown effect (timestamp-based)
  useEffect(() => {
    if (genTimer?.status === "running") {
      genTimerRef.current = setInterval(() => {
        setGenTimer((prev) => {
          if (!prev || !prev.startedAt) return prev;
          const elapsed = prev.pausedElapsed + (Date.now() - prev.startedAt) / 1000;
          const remaining = Math.max(0, Math.ceil(prev.targetSec - elapsed));
          if (remaining <= 0) {
            if (timerSoundRef.current) playTimerBeep();
            setGenTimerDoneOpen(true);
            return { ...prev, remainingSec: 0, pausedElapsed: prev.targetSec, startedAt: 0, status: "paused" as const };
          }
          return { ...prev, remainingSec: remaining };
        });
      }, 1000);
    } else if (genTimerRef.current) {
      clearInterval(genTimerRef.current);
      genTimerRef.current = null;
    }
    return (): void => {
      if (genTimerRef.current) {
        clearInterval(genTimerRef.current);
        genTimerRef.current = null;
      }
    };
  }, [genTimer?.status]);

  const genTimerRestoredRef = useRef(false);

  // Restore from localStorage on mount (MUST run before save effect)
  useEffect(() => {
    try {
      const saved = localStorage.getItem(genTimerLsKey);
      if (saved) {
        const parsed = JSON.parse(saved) as typeof genTimer;
        if (parsed && parsed.targetSec > 0 && parsed.status !== "idle") {
          if (parsed.status === "running" && parsed.startedAt) {
            const elapsed = parsed.pausedElapsed + (Date.now() - parsed.startedAt) / 1000;
            const remaining = Math.max(0, Math.ceil(parsed.targetSec - elapsed));
            if (remaining > 0) {
              setGenTimer({ ...parsed, remainingSec: remaining });
            } else {
              setGenTimer({ ...parsed, remainingSec: 0, pausedElapsed: parsed.targetSec, startedAt: 0, status: "paused" });
              setGenTimerDoneOpen(true);
            }
          } else {
            setGenTimer(parsed);
          }
        }
      }
    } catch { /* ignore */ }
    genTimerRestoredRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist to localStorage (only after restore)
  useEffect(() => {
    if (!genTimerRestoredRef.current) return;
    if (genTimer && genTimer.status !== "idle") {
      localStorage.setItem(genTimerLsKey, JSON.stringify(genTimer));
    } else {
      localStorage.removeItem(genTimerLsKey);
    }
  }, [genTimer, genTimerLsKey]);

  const handleGenTimerStart = useCallback((): void => {
    const mins = parseInt(genTimerInput, 10);
    if (!mins || mins <= 0) return;
    setGenTimer({ targetSec: mins * 60, remainingSec: mins * 60, startedAt: Date.now(), pausedElapsed: 0, status: "running" });
  }, [genTimerInput]);

  const handleGenTimerClose = useCallback((): void => {
    setGenTimer(null);
    setGenTimerInput("");
    setGenTimerDoneOpen(false);
    setGenTimerStopOpen(false);
  }, []);

  // Load recipe calculation for calculated values (OG, IBU, EBC, volumes...)
  const [calcResult, setCalcResult] = useState<RecipeCalculationResult | null>(null);
  useEffect(() => {
    if (batch.recipeId) {
      getLatestRecipeCalculation(batch.recipeId).then((r) => setCalcResult(r));
    }
  }, [batch.recipeId]);

  // Use calculated values with fallback to batch fields (design targets)
  const og = calcResult?.og ?? (batch.recipeOg ? Number(batch.recipeOg) : null);
  const ibu = calcResult?.ibu ?? (batch.recipeIbu ? Number(batch.recipeIbu) : null);
  const ebc = calcResult?.ebc ?? (batch.recipeEbc ? Number(batch.recipeEbc) : 0);
  const recipeName = batch.recipeName ?? "";
  const beerStyleName = batch.recipeBeerStyleName ?? "";

  const handleAddNote = useCallback((): void => {
    if (!noteText.trim()) return;
    startTransition(async () => {
      try {
        await addBatchNote(batch.id, noteText.trim());
        toast.success(t("notes.added"));
        setNoteText("");
        setNoteDialogOpen(false);
        router.refresh();
      } catch {
        toast.error(t("notes.addError"));
      }
    });
  }, [batch.id, noteText, t, router, startTransition]);

  return (
    <div className="flex h-full flex-col -m-6">
      {/* Header */}
      <div className="shrink-0 border-b px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href={`/${locale}/brewery/batches`}
              className="text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="size-5" />
            </Link>
            {ebc > 0 && <BeerGlass ebc={ebc} size="sm" />}
            <div>
              <h1 className="text-lg font-bold">
                {batch.batchNumber} — {batch.itemName ?? recipeName}
              </h1>
              <p className="text-sm text-muted-foreground">
                {batch.lotNumber && <>{t("brew.header.lot")}: {batch.lotNumber} · </>}
                {batch.shopName && <>{batch.shopName} · </>}
                {beerStyleName}
                {og != null && ` · OG ${og.toFixed(1)}°P`}
                {ibu != null && ` · IBU ${ibu.toFixed(0)}`}
                {ebc > 0 && ` · EBC ${ebc.toFixed(0)}`}
                {batch.recipeBatchSizeL && ` · ${Number(batch.recipeBatchSizeL).toFixed(0)} L`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <TooltipProvider delayDuration={0}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={() => setNoteDialogOpen(true)}
                  >
                    <StickyNote className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("notes.add")}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn("size-8", genTimer && "text-amber-600")}
                    onClick={() => {
                      if (!genTimer) {
                        setGenTimer({ targetSec: 0, remainingSec: 0, startedAt: 0, pausedElapsed: 0, status: "idle" });
                        setGenTimerInput("");
                      }
                    }}
                  >
                    <Timer className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("brew.generalTimer.tooltip")}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {batch.recipeId && (
              <Link
                href={`/${locale}/brewery/recipes/${batch.recipeId}?batchId=${batch.id}&batchNumber=${encodeURIComponent(batch.batchNumber)}&returnTo=brew&brewPhase=${brewPhaseSegment}`}
                className="text-sm text-primary hover:underline inline-flex items-center gap-1"
              >
                <ScrollText className="size-3.5" />
                {t("brew.viewRecipe")}
              </Link>
            )}
            <Link
              href={`/${locale}/brewery/batches/${batch.id}`}
              className="text-sm text-muted-foreground hover:underline"
            >
              {t("brew.classicView")}
            </Link>
          </div>
        </div>
      </div>

      {/* Phase Bar */}
      <div className="shrink-0 border-b px-4">
        <BatchPhaseBar
          batchId={batch.id}
          currentPhase={currentPhase}
          phaseHistory={phaseHistory}
        />
      </div>

      {/* General timer panel */}
      {genTimer && (
        <div className="shrink-0 border-b px-4 py-2">
          <div className="rounded-lg border-2 border-blue-400 bg-blue-50 p-3 space-y-2">
            {genTimer.status === "idle" ? (
              /* Setup mode: input + start */
              <div className="flex items-center gap-2">
                <Timer className="size-4 text-blue-600" />
                <span className="text-sm font-medium">{t("brew.generalTimer.tooltip")}</span>
                <Input
                  type="number"
                  min={1}
                  className="w-20 h-8 text-center"
                  placeholder={t("brew.generalTimer.placeholder")}
                  value={genTimerInput}
                  onChange={(e) => setGenTimerInput(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); handleGenTimerStart(); }
                  }}
                />
                <span className="text-sm text-muted-foreground">min</span>
                <Button size="sm" onClick={handleGenTimerStart} disabled={!genTimerInput || parseInt(genTimerInput, 10) <= 0}>
                  <Play className="mr-1 size-3.5" />
                  {t("brew.generalTimer.start")}
                </Button>
                <button type="button" onClick={toggleTimerSound} className="ml-auto text-blue-600 hover:text-blue-800" title={t("brew.timerSound")}>
                  {timerSound ? <Volume2 className="size-4" /> : <VolumeX className="size-4 opacity-50" />}
                </button>
                <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={handleGenTimerClose}>
                  ✕
                </Button>
              </div>
            ) : (
              /* Running / paused mode */
              <>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium flex items-center gap-1.5">
                    <Timer className="size-4 text-blue-600" />
                    {t("brew.generalTimer.tooltip")}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-2xl font-bold tabular-nums">
                      {Math.floor(genTimer.remainingSec / 60).toString().padStart(2, "0")}
                      :{(genTimer.remainingSec % 60).toString().padStart(2, "0")}
                      <span className="text-sm font-normal text-muted-foreground ml-1">
                        / {Math.floor(genTimer.targetSec / 60).toString().padStart(2, "0")}
                        :{(genTimer.targetSec % 60).toString().padStart(2, "0")}
                      </span>
                    </span>
                    <button type="button" onClick={toggleTimerSound} className="text-blue-600 hover:text-blue-800" title={t("brew.timerSound")}>
                      {timerSound ? <Volume2 className="size-4" /> : <VolumeX className="size-4 opacity-50" />}
                    </button>
                  </span>
                </div>
                <Progress
                  value={((genTimer.targetSec - genTimer.remainingSec) / genTimer.targetSec) * 100}
                  className={cn(
                    "h-2",
                    genTimer.remainingSec / genTimer.targetSec < 0.2 && genTimer.remainingSec > 0
                      ? "[&>div]:bg-amber-500"
                      : "[&>div]:bg-blue-500"
                  )}
                />
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setGenTimer((prev) => {
                        if (!prev) return null;
                        if (prev.status === "running") {
                          const elapsed = prev.startedAt ? (Date.now() - prev.startedAt) / 1000 : 0;
                          return { ...prev, pausedElapsed: prev.pausedElapsed + elapsed, startedAt: 0, status: "paused" as const };
                        }
                        return { ...prev, startedAt: Date.now(), status: "running" as const };
                      });
                    }}
                  >
                    {genTimer.status === "running" ? (
                      <><Pause className="mr-1 size-3.5" />{t("brew.generalTimer.pause")}</>
                    ) : (
                      <><Play className="mr-1 size-3.5" />{t("brew.generalTimer.resume")}</>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setGenTimerStopOpen(true)}
                  >
                    <Square className="mr-1 size-3.5" />
                    {t("brew.generalTimer.stop")}
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* General timer stop confirmation */}
      <AlertDialog open={genTimerStopOpen} onOpenChange={setGenTimerStopOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("brew.generalTimer.stopTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("brew.generalTimer.stopMsg")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleGenTimerClose}>{t("actions.confirm")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* General timer done dialog */}
      <AlertDialog open={genTimerDoneOpen} onOpenChange={setGenTimerDoneOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("brew.generalTimer.doneTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("brew.generalTimer.doneMsg")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={handleGenTimerClose}>{t("actions.confirm")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Content + Sidebar */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-6">
          {children}
        </div>
        <BrewSidebar
          batch={batch}
          steps={steps}
          measurements={measurements}
          notes={notes}
          calcResult={calcResult}
        />
      </div>

      {/* Add Note Dialog */}
      <Dialog open={noteDialogOpen} onOpenChange={setNoteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("notes.add")}</DialogTitle>
          </DialogHeader>
          <Textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder={t("notes.placeholder")}
            rows={4}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                handleAddNote();
              }
            }}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setNoteDialogOpen(false)}
            >
              {t("actions.cancel")}
            </Button>
            <Button
              onClick={handleAddNote}
              disabled={!noteText.trim() || isPending}
            >
              {isPending ? "..." : t("notes.add")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
