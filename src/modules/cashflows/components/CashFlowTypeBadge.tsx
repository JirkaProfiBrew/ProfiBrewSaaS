"use client";

import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ── Type color mapping ────────────────────────────────────────

const TYPE_STYLES: Record<string, string> = {
  income: "bg-green-100 text-green-800 border-green-300",
  expense: "bg-red-100 text-red-800 border-red-300",
};

// ── Component ──────────────────────────────────────────────────

interface CashFlowTypeBadgeProps {
  cashflowType: string;
  className?: string;
}

export function CashFlowTypeBadge({
  cashflowType,
  className,
}: CashFlowTypeBadgeProps): React.ReactNode {
  const t = useTranslations("cashflows");

  const colorClass =
    TYPE_STYLES[cashflowType] ?? "bg-gray-100 text-gray-800 border-gray-300";
  const label = t(`type.${cashflowType}` as Parameters<typeof t>[0]);

  return (
    <Badge variant="outline" className={cn(colorClass, className)}>
      {label}
    </Badge>
  );
}
