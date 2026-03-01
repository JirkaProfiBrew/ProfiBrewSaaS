"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  ScrollText,
  Droplets,
  Ruler,
  StickyNote,
  BarChart3,
  ArrowLeftRight,
  Landmark,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import type { Batch, BatchStep, BatchMeasurement, BatchNote } from "../../types";

const SIDEBAR_PANELS = [
  { key: "recipe",     icon: ScrollText,     labelKey: "sidebar.recipePreview" },
  { key: "volumes",    icon: Droplets,       labelKey: "sidebar.volumes" },
  { key: "measured",   icon: Ruler,          labelKey: "sidebar.measured" },
  { key: "notes",      icon: StickyNote,     labelKey: "sidebar.notes" },
  { key: "comparison", icon: BarChart3,      labelKey: "sidebar.comparison" },
  { key: "tracking",   icon: ArrowLeftRight, labelKey: "sidebar.tracking" },
  { key: "excise",     icon: Landmark,       labelKey: "sidebar.excise" },
] as const;

type PanelKey = (typeof SIDEBAR_PANELS)[number]["key"];

interface BrewSidebarProps {
  batch: Batch;
  steps: BatchStep[];
  measurements: BatchMeasurement[];
  notes: BatchNote[];
}

export function BrewSidebar({
  batch: _batch,
  steps: _steps,
  measurements: _measurements,
  notes,
}: BrewSidebarProps): React.ReactNode {
  const t = useTranslations("batches");
  const [openPanel, setOpenPanel] = useState<PanelKey | null>(null);

  return (
    <>
      {/* Icon strip */}
      <TooltipProvider delayDuration={0}>
        <div className="hidden md:flex shrink-0 w-12 flex-col items-center gap-1 border-l bg-muted/30 py-2">
          {SIDEBAR_PANELS.map(({ key, icon: Icon, labelKey }) => (
            <Tooltip key={key}>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "size-9",
                    openPanel === key && "bg-accent"
                  )}
                  onClick={() => setOpenPanel(openPanel === key ? null : key)}
                >
                  <Icon className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">
                {t(`brew.${labelKey}`)}
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
      </TooltipProvider>

      {/* Panel Sheet */}
      <Sheet open={openPanel !== null} onOpenChange={(open) => !open && setOpenPanel(null)}>
        <SheetContent side="right" className="w-96 p-0">
          <SheetHeader className="px-4 pt-4 pb-2">
            <SheetTitle>
              {openPanel && t(`brew.${SIDEBAR_PANELS.find(p => p.key === openPanel)?.labelKey ?? "sidebar.recipePreview"}`)}
            </SheetTitle>
          </SheetHeader>
          <div className="px-4 pb-4 overflow-y-auto h-[calc(100vh-5rem)]">
            {openPanel === "recipe" && (
              <SidebarPlaceholder label="Recipe preview" />
            )}
            {openPanel === "volumes" && (
              <SidebarPlaceholder label="Water & volumes" />
            )}
            {openPanel === "measured" && (
              <SidebarPlaceholder label="Measured values" />
            )}
            {openPanel === "notes" && (
              <SidebarPlaceholder label={`${notes.length} notes`} />
            )}
            {openPanel === "comparison" && (
              <SidebarPlaceholder label="Plan vs. actual comparison" />
            )}
            {openPanel === "tracking" && (
              <SidebarPlaceholder label="Lot tracking" />
            )}
            {openPanel === "excise" && (
              <SidebarPlaceholder label="Excise tax" />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function SidebarPlaceholder({ label }: { label: string }): React.ReactNode {
  return (
    <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
      {label}
    </div>
  );
}
