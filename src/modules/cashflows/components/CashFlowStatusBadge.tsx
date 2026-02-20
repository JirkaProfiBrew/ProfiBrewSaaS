"use client";

import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ── Status color mapping ──────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  planned: "bg-gray-100 text-gray-800 border-gray-300",
  pending: "bg-yellow-100 text-yellow-800 border-yellow-300",
  paid: "bg-green-100 text-green-800 border-green-300",
  cancelled: "bg-red-100 text-red-800 border-red-300",
};

// ── Component ──────────────────────────────────────────────────

interface CashFlowStatusBadgeProps {
  status: string;
  className?: string;
}

export function CashFlowStatusBadge({
  status,
  className,
}: CashFlowStatusBadgeProps): React.ReactNode {
  const t = useTranslations("cashflows");

  const colorClass =
    STATUS_STYLES[status] ?? "bg-gray-100 text-gray-800 border-gray-300";
  const label = t(`status.${status}` as Parameters<typeof t>[0]);

  return (
    <Badge variant="outline" className={cn(colorClass, className)}>
      {label}
    </Badge>
  );
}
