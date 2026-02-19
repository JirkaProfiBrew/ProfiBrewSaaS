"use client";

import { useTranslations } from "next-intl";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ── Status color mapping ──────────────────────────────────────

const STATUS_CLASS_MAP: Record<string, string> = {
  planned: "bg-gray-100 text-gray-800 border-gray-300",
  brewing: "bg-orange-100 text-orange-800 border-orange-300",
  fermenting: "bg-yellow-100 text-yellow-800 border-yellow-300",
  conditioning: "bg-blue-100 text-blue-800 border-blue-300",
  carbonating: "bg-indigo-100 text-indigo-800 border-indigo-300",
  packaging: "bg-purple-100 text-purple-800 border-purple-300",
  completed: "bg-green-100 text-green-800 border-green-300",
  dumped: "bg-red-100 text-red-800 border-red-300",
};

// ── Component ──────────────────────────────────────────────────

interface BatchStatusBadgeProps {
  status: string;
  className?: string;
}

export function BatchStatusBadge({
  status,
  className,
}: BatchStatusBadgeProps): React.ReactNode {
  const t = useTranslations("batches");

  const colorClass = STATUS_CLASS_MAP[status] ?? "bg-gray-100 text-gray-800 border-gray-300";
  const label = t(`status.${status}` as Parameters<typeof t>[0]);

  return (
    <Badge
      variant="outline"
      className={cn(colorClass, className)}
    >
      {label}
    </Badge>
  );
}
