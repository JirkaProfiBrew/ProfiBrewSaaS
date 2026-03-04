"use client";

import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { ArrowLeft, ScrollText } from "lucide-react";
import Link from "next/link";

import { BeerGlass } from "@/components/ui/beer-glass";

import type { Batch, BatchStep, BatchMeasurement, BatchNote, BatchPhase, PhaseHistory } from "../../types";
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
  const locale = params.locale as string;

  const ebc = batch.recipeEbc ? Number(batch.recipeEbc) : 0;
  const recipeName = batch.recipeName ?? "";
  const beerStyleName = batch.recipeBeerStyleName ?? "";

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
                {beerStyleName}
                {batch.recipeOg && ` · OG ${Number(batch.recipeOg).toFixed(1)}°P`}
                {batch.recipeIbu && ` · IBU ${Number(batch.recipeIbu).toFixed(0)}`}
                {batch.recipeEbc && ` · EBC ${Number(batch.recipeEbc).toFixed(0)}`}
                {batch.recipeBatchSizeL && ` · ${Number(batch.recipeBatchSizeL).toFixed(0)} L`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {batch.recipeId && (
              <Link
                href={`/${locale}/brewery/recipes/${batch.recipeId}`}
                target={currentPhase === "plan" ? undefined : "_blank"}
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
        />
      </div>
    </div>
  );
}
