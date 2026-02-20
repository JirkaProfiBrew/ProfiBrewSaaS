"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { getCashFlowSummary } from "../actions";
import type { CashFlowSummary } from "../types";

// ── Helpers ──────────────────────────────────────────────────

function formatCZK(value: string): string {
  const num = parseFloat(value) || 0;
  return num.toLocaleString("cs-CZ", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

function currentMonth(): number {
  return new Date().getMonth() + 1;
}

function currentYear(): number {
  return new Date().getFullYear();
}

// ── Component ──────────────────────────────────────────────────

export function CashFlowSummaryPanel(): React.ReactNode {
  const t = useTranslations("cashflows");

  const [month, setMonth] = useState<number>(currentMonth());
  const [year, setYear] = useState<number>(currentYear());
  const [summary, setSummary] = useState<CashFlowSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    try {
      const result = await getCashFlowSummary(month, year);
      if ("error" in result) {
        setSummary(null);
      } else {
        setSummary(result);
      }
    } catch {
      setSummary(null);
    } finally {
      setIsLoading(false);
    }
  }, [month, year]);

  useEffect(() => {
    void load();
  }, [load]);

  const yearOptions = Array.from(
    { length: 5 },
    (_, i) => currentYear() - 2 + i
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{t("summary.title")}</CardTitle>
          <div className="flex items-center gap-2">
            <Select
              value={String(month)}
              onValueChange={(v) => setMonth(Number(v))}
            >
              <SelectTrigger className="w-[100px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((m) => (
                  <SelectItem key={m} value={String(m)}>
                    {String(m).padStart(2, "0")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={String(year)}
              onValueChange={(v) => setYear(Number(v))}
            >
              <SelectTrigger className="w-[90px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {yearOptions.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="grid grid-cols-3 gap-4">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        ) : summary ? (
          <div className="grid grid-cols-3 gap-4">
            {/* Income */}
            <div className="rounded-lg border border-green-200 bg-green-50 p-3">
              <p className="text-xs font-medium text-green-700">
                {t("summary.income")}
              </p>
              <p className="mt-1 text-lg font-bold tabular-nums text-green-800">
                {formatCZK(summary.totalIncome)} Kč
              </p>
              <p className="text-xs text-green-600">
                {t("summary.paidLabel")}: {formatCZK(summary.paidIncome)} Kč
              </p>
            </div>

            {/* Expenses */}
            <div className="rounded-lg border border-red-200 bg-red-50 p-3">
              <p className="text-xs font-medium text-red-700">
                {t("summary.expense")}
              </p>
              <p className="mt-1 text-lg font-bold tabular-nums text-red-800">
                {formatCZK(summary.totalExpense)} Kč
              </p>
              <p className="text-xs text-red-600">
                {t("summary.paidLabel")}: {formatCZK(summary.paidExpense)} Kč
              </p>
            </div>

            {/* Balance */}
            <div
              className={cn(
                "rounded-lg border p-3",
                parseFloat(summary.balance) >= 0
                  ? "border-blue-200 bg-blue-50"
                  : "border-orange-200 bg-orange-50"
              )}
            >
              <p
                className={cn(
                  "text-xs font-medium",
                  parseFloat(summary.balance) >= 0
                    ? "text-blue-700"
                    : "text-orange-700"
                )}
              >
                {t("summary.balance")}
              </p>
              <p
                className={cn(
                  "mt-1 text-lg font-bold tabular-nums",
                  parseFloat(summary.balance) >= 0
                    ? "text-blue-800"
                    : "text-orange-800"
                )}
              >
                {formatCZK(summary.balance)} Kč
              </p>
              <p
                className={cn(
                  "text-xs",
                  parseFloat(summary.paidBalance) >= 0
                    ? "text-blue-600"
                    : "text-orange-600"
                )}
              >
                {t("summary.paidLabel")}: {formatCZK(summary.paidBalance)} Kč
              </p>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
