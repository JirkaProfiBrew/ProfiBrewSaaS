"use client";

import { useState, useCallback, useTransition, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useParams, usePathname, useRouter } from "next/navigation";
import { ArrowLeft, ScrollText, StickyNote } from "lucide-react";
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import type { Batch, BatchStep, BatchMeasurement, BatchNote, BatchPhase, PhaseHistory } from "../../types";
import type { RecipeCalculationResult } from "@/modules/recipes/types";
import { getLatestRecipeCalculation } from "@/modules/recipes/actions";
import { addBatchNote } from "../../actions";
import { BatchPhaseBar } from "./BatchPhaseBar";
import { BrewSidebar } from "./BrewSidebar";

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

  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [noteText, setNoteText] = useState("");

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
