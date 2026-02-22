"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

// ── Types ────────────────────────────────────────────────────

interface OrderSummaryProps {
  totalExclVat: string;
  totalVat: string;
  totalInclVat: string;
  totalDeposit: string;
  totalDiscount: number;
}

// ── Helpers ──────────────────────────────────────────────────

function formatCZK(value: string): string {
  const num = parseFloat(value) || 0;
  return num.toLocaleString("cs-CZ", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// ── Component ────────────────────────────────────────────────

export function OrderSummary({
  totalExclVat,
  totalVat,
  totalInclVat,
  totalDeposit,
  totalDiscount,
}: OrderSummaryProps): React.ReactNode {
  const t = useTranslations("orders");

  const grandTotal = useMemo((): string => {
    const inclVat = parseFloat(totalInclVat) || 0;
    const deposit = parseFloat(totalDeposit) || 0;
    return (inclVat + deposit).toFixed(2);
  }, [totalInclVat, totalDeposit]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t("summary.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {/* Total excl. VAT */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {t("summary.totalExclVat")}
          </span>
          <span className="font-medium tabular-nums">
            {formatCZK(totalExclVat)} Kč
          </span>
        </div>

        {/* Discount */}
        {totalDiscount > 0 && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {t("summary.totalDiscount")}
            </span>
            <span className="font-medium tabular-nums text-green-600">
              −{formatCZK(totalDiscount.toFixed(2))} Kč
            </span>
          </div>
        )}

        {/* VAT */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {t("summary.totalVat")}
          </span>
          <span className="font-medium tabular-nums">
            {formatCZK(totalVat)} Kč
          </span>
        </div>

        <Separator />

        {/* Total incl. VAT */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {t("summary.totalInclVat")}
          </span>
          <span className="font-semibold tabular-nums">
            {formatCZK(totalInclVat)} Kč
          </span>
        </div>

        {/* Deposits */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {t("summary.totalDeposit")}
          </span>
          <span className="font-medium tabular-nums">
            {formatCZK(totalDeposit)} Kč
          </span>
        </div>

        <Separator className="border-double" />

        {/* Grand total */}
        <div className="flex items-center justify-between pt-1">
          <span className="font-semibold">{t("summary.grandTotal")}</span>
          <span className="text-lg font-bold tabular-nums">
            {formatCZK(grandTotal)} Kč
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
