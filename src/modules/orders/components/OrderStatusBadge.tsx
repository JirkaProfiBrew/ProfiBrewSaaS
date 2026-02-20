"use client";

import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ── Status color mapping ──────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-gray-100 text-gray-800 border-gray-300",
  confirmed: "bg-blue-100 text-blue-800 border-blue-300",
  in_preparation: "bg-yellow-100 text-yellow-800 border-yellow-300",
  shipped: "bg-orange-100 text-orange-800 border-orange-300",
  delivered: "bg-green-100 text-green-800 border-green-300",
  invoiced: "bg-emerald-100 text-emerald-800 border-emerald-300",
  cancelled: "bg-red-100 text-red-800 border-red-300",
};

// ── Component ──────────────────────────────────────────────────

interface OrderStatusBadgeProps {
  status: string;
  className?: string;
}

export function OrderStatusBadge({
  status,
  className,
}: OrderStatusBadgeProps): React.ReactNode {
  const t = useTranslations("orders");

  const colorClass =
    STATUS_STYLES[status] ?? "bg-gray-100 text-gray-800 border-gray-300";
  const label = t(`status.${status}` as Parameters<typeof t>[0]);

  return (
    <Badge variant="outline" className={cn(colorClass, className)}>
      {label}
    </Badge>
  );
}
