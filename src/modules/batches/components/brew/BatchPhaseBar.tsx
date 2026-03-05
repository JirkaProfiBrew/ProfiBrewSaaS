"use client";

import { useTranslations } from "next-intl";
import { useRouter, useParams, usePathname } from "next/navigation";
import {
  ClipboardList,
  Package,
  Flame,
  Droplets,
  Beer,
  GlassWater,
  CheckCircle2,
  Skull,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import type { BatchPhase, PhaseHistory } from "../../types";

// Phase order
const PHASES: Array<{
  key: BatchPhase;
  icon: React.ComponentType<{ className?: string }>;
  route: string;
}> = [
  { key: "plan",          icon: ClipboardList, route: "plan" },
  { key: "preparation",   icon: Package,       route: "prep" },
  { key: "brewing",       icon: Flame,         route: "brewing" },
  { key: "fermentation",  icon: Droplets,      route: "ferm" },
  { key: "conditioning",  icon: Beer,          route: "cond" },
  { key: "packaging",     icon: GlassWater,    route: "pack" },
  { key: "completed",     icon: CheckCircle2,  route: "done" },
  { key: "dumped",        icon: Skull,         route: "done" },
];

// Phase index for ordering
const PHASE_INDEX: Record<BatchPhase, number> = {
  plan: 0,
  preparation: 1,
  brewing: 2,
  fermentation: 3,
  conditioning: 4,
  packaging: 5,
  completed: 6,
  dumped: 7,
};

function getStepState(
  phaseKey: BatchPhase,
  currentPhase: BatchPhase,
  _phaseHistory: PhaseHistory
): "completed" | "current" | "locked" | "dumped" {
  if (currentPhase === "dumped") {
    if (phaseKey === "dumped") return "dumped";
    // All phases before dumped are "completed" (they happened before the dump)
    if (phaseKey === "completed") return "locked";
    return "completed";
  }
  if (phaseKey === "dumped") return "locked";
  if (phaseKey === currentPhase) return "current";
  if (PHASE_INDEX[phaseKey] < PHASE_INDEX[currentPhase]) return "completed";
  return "locked";
}

interface BatchPhaseBarProps {
  batchId: string;
  currentPhase: BatchPhase;
  phaseHistory: PhaseHistory;
}

export function BatchPhaseBar({
  batchId,
  currentPhase,
  phaseHistory,
}: BatchPhaseBarProps): React.ReactNode {
  const t = useTranslations("batches");
  const router = useRouter();
  const params = useParams();
  const pathname = usePathname();
  const locale = params.locale as string;

  const handleClick = (phase: { key: BatchPhase; route: string }, state: string): void => {
    if (state === "locked") {
      toast.info(t("brew.phaseLocked"));
      return;
    }
    const href = `/${locale}/brewery/batches/${batchId}/brew/${phase.route}`;
    if (pathname !== href) {
      if (state === "completed") {
        toast.info(t("brew.viewingHistorical"));
      }
      router.push(href);
    }
  };

  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex items-center gap-1 py-2 overflow-x-auto">
        {PHASES.filter((phase) => {
          // Hide "dumped" when batch is not dumped; hide "completed" when batch is dumped
          if (phase.key === "dumped" && currentPhase !== "dumped") return false;
          if (phase.key === "completed" && currentPhase === "dumped") return false;
          return true;
        }).map((phase, idx) => {
          const state = getStepState(phase.key, currentPhase, phaseHistory);
          const Icon = phase.icon;
          const isActive = pathname.includes(`/brew/${phase.route}`);

          return (
            <div key={phase.key} className="flex items-center">
              {idx > 0 && (
                <div
                  className={cn(
                    "h-px w-6 mx-1",
                    state === "locked" ? "bg-muted" : "bg-primary/30"
                  )}
                />
              )}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => handleClick(phase, state)}
                    className={cn(
                      "flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap",
                      state === "completed" &&
                        (isActive
                          ? "bg-green-100 text-green-800 ring-2 ring-green-500 cursor-pointer"
                          : "bg-green-50 text-green-700 hover:bg-green-100 cursor-pointer"),
                      state === "current" &&
                        (isActive
                          ? "bg-primary text-primary-foreground"
                          : "bg-primary/10 text-primary hover:bg-primary/20 cursor-pointer"),
                      state === "dumped" &&
                        "bg-red-100 text-red-700 cursor-default",
                      state === "locked" &&
                        "bg-muted text-muted-foreground cursor-not-allowed opacity-50"
                    )}
                  >
                    <Icon className="size-3.5" />
                    <span className="hidden sm:inline">{t(`brew.phases.${phase.key}`)}</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  {t(`brew.phases.${phase.key}`)}
                  {state === "locked" && ` — ${t("brew.phaseLocked")}`}
                </TooltipContent>
              </Tooltip>
            </div>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
