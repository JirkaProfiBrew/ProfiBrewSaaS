"use client";

import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ── Phase color mapping ──────────────────────────────────────

const PHASE_CLASS_MAP: Record<string, string> = {
  plan: "bg-gray-100 text-gray-800 border-gray-300",
  preparation: "bg-blue-50 text-blue-700 border-blue-200",
  brewing: "bg-orange-100 text-orange-800 border-orange-300",
  fermentation: "bg-yellow-100 text-yellow-800 border-yellow-300",
  conditioning: "bg-blue-100 text-blue-800 border-blue-300",
  packaging: "bg-purple-100 text-purple-800 border-purple-300",
  completed: "bg-green-100 text-green-800 border-green-300",
  dumped: "bg-red-100 text-red-800 border-red-300",
};

// ── Component ──────────────────────────────────────────────────

interface BatchStatusBadgeProps {
  phase: string;
  className?: string;
}

export function BatchStatusBadge({
  phase,
  className,
}: BatchStatusBadgeProps): React.ReactNode {
  const t = useTranslations("batches");

  const colorClass = PHASE_CLASS_MAP[phase] ?? "bg-gray-100 text-gray-800 border-gray-300";
  const label = t(`phase.${phase}` as Parameters<typeof t>[0]);

  return (
    <Badge
      variant="outline"
      className={cn(colorClass, className)}
    >
      {label}
    </Badge>
  );
}
