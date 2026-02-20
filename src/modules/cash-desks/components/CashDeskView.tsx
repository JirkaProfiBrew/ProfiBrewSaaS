"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Settings, ArrowDownCircle, ArrowUpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

import {
  useCashDeskList,
  useCashDeskDetail,
  useCashDeskTransactions,
  useCashDeskDailySummary,
} from "../hooks";
import { CashDeskTransactionDialog } from "./CashDeskTransactionDialog";
import type { CashDeskDailySummary } from "../types";

function isSummaryError(
  data: CashDeskDailySummary | { error: string } | undefined
): data is { error: string } {
  return !!data && "error" in data;
}

export function CashDeskView(): React.ReactNode {
  const t = useTranslations("cashDesks");
  const [selectedDeskId, setSelectedDeskId] = useState<string | null>(null);
  const [transactionDialogOpen, setTransactionDialogOpen] = useState(false);
  const [transactionType, setTransactionType] = useState<"income" | "expense">("income");

  const { data: desks, isLoading: desksLoading } = useCashDeskList();
  const { data: currentDesk, mutate: mutateDesk } = useCashDeskDetail(selectedDeskId);
  const { data: transactions, mutate: mutateTransactions } = useCashDeskTransactions(selectedDeskId);
  const { data: summaryData, mutate: mutateSummary } = useCashDeskDailySummary(selectedDeskId);

  // Auto-select first desk on load
  useEffect(() => {
    if (!selectedDeskId && desks && desks.length > 0) {
      const first = desks[0];
      if (first) {
        setSelectedDeskId(first.id);
      }
    }
  }, [desks, selectedDeskId]);

  const handleOpenIncome = useCallback((): void => {
    setTransactionType("income");
    setTransactionDialogOpen(true);
  }, []);

  const handleOpenExpense = useCallback((): void => {
    setTransactionType("expense");
    setTransactionDialogOpen(true);
  }, []);

  const handleTransactionCreated = useCallback((): void => {
    void mutateDesk();
    void mutateTransactions();
    void mutateSummary();
  }, [mutateDesk, mutateTransactions, mutateSummary]);

  const summary: CashDeskDailySummary | null =
    summaryData && !isSummaryError(summaryData) ? summaryData : null;

  const formatCurrency = useCallback((value: string | number): string => {
    return Number(value).toLocaleString("cs-CZ", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }, []);

  const formatTime = useCallback((date: Date | null): string => {
    if (!date) return "-";
    const d = new Date(date);
    return d.toLocaleTimeString("cs-CZ", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }, []);

  if (desksLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // No desks — show empty state
  if (!desks || desks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-12">
        <p className="text-lg text-muted-foreground">{t("view.noDesks")}</p>
        <Button asChild variant="outline">
          <Link href="/settings/cash-desks">
            <Settings className="mr-2 h-4 w-4" />
            {t("view.goToSettings")}
          </Link>
        </Button>
      </div>
    );
  }

  const sortedTransactions = transactions
    ? [...transactions].sort(
        (a, b) =>
          new Date(b.createdAt ?? 0).getTime() -
          new Date(a.createdAt ?? 0).getTime()
      )
    : [];

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header row: title + desk selector */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">
          {t("view.title")}
        </h1>
        <Select
          value={selectedDeskId ?? ""}
          onValueChange={(value) => setSelectedDeskId(value)}
        >
          <SelectTrigger className="w-[240px]">
            <SelectValue placeholder={t("view.selectDesk")} />
          </SelectTrigger>
          <SelectContent>
            {desks.map((desk) => (
              <SelectItem key={desk.id} value={desk.id}>
                {desk.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Balance card */}
      {currentDesk && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("view.balance")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-bold">
              {formatCurrency(currentDesk.currentBalance)} Kč
            </p>
          </CardContent>
        </Card>
      )}

      {/* Quick action buttons */}
      {selectedDeskId && (
        <div className="grid grid-cols-2 gap-4">
          <Button
            size="lg"
            className="h-16 bg-green-600 text-lg hover:bg-green-700"
            onClick={handleOpenIncome}
          >
            <ArrowDownCircle className="mr-2 h-6 w-6" />
            {t("view.income")}
          </Button>
          <Button
            size="lg"
            variant="destructive"
            className="h-16 text-lg"
            onClick={handleOpenExpense}
          >
            <ArrowUpCircle className="mr-2 h-6 w-6" />
            {t("view.expense")}
          </Button>
        </div>
      )}

      {/* Daily summary cards */}
      {summary && (
        <div>
          <h2 className="mb-3 text-lg font-semibold">{t("view.dailySummary")}</h2>
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t("view.dailyIncome")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-green-600">
                  +{formatCurrency(summary.income)} Kč
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t("view.dailyExpense")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-red-600">
                  -{formatCurrency(summary.expense)} Kč
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t("view.dailyNet")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p
                  className={cn(
                    "text-2xl font-bold",
                    Number(summary.net) >= 0
                      ? "text-green-600"
                      : "text-red-600"
                  )}
                >
                  {Number(summary.net) >= 0 ? "+" : ""}
                  {formatCurrency(summary.net)} Kč
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {/* Today's transactions */}
      {selectedDeskId && (
        <div>
          <h2 className="mb-3 text-lg font-semibold">
            {t("view.todayTransactions")}
          </h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("view.transactionColumns.time")}</TableHead>
                <TableHead>{t("view.transactionColumns.type")}</TableHead>
                <TableHead>{t("view.transactionColumns.amount")}</TableHead>
                <TableHead>{t("view.transactionColumns.description")}</TableHead>
                <TableHead>{t("view.transactionColumns.category")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedTransactions.map((tx) => (
                <TableRow key={tx.id}>
                  <TableCell>{formatTime(tx.createdAt)}</TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        tx.cashflowType === "income" ? "default" : "destructive"
                      }
                      className={cn(
                        tx.cashflowType === "income" &&
                          "bg-green-100 text-green-800 hover:bg-green-100 dark:bg-green-900 dark:text-green-200"
                      )}
                    >
                      {tx.cashflowType === "income"
                        ? t("view.income")
                        : t("view.expense")}
                    </Badge>
                  </TableCell>
                  <TableCell
                    className={cn(
                      "font-medium",
                      tx.cashflowType === "income"
                        ? "text-green-600"
                        : "text-red-600"
                    )}
                  >
                    {tx.cashflowType === "income" ? "+" : "-"}
                    {formatCurrency(tx.amount)} Kč
                  </TableCell>
                  <TableCell>{tx.description ?? "-"}</TableCell>
                  <TableCell>{tx.categoryName ?? "-"}</TableCell>
                </TableRow>
              ))}
              {sortedTransactions.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-center text-muted-foreground"
                  >
                    {t("view.noTransactions")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Transaction dialog */}
      {selectedDeskId && (
        <CashDeskTransactionDialog
          cashDeskId={selectedDeskId}
          type={transactionType}
          open={transactionDialogOpen}
          onOpenChange={setTransactionDialogOpen}
          onCreated={handleTransactionCreated}
        />
      )}
    </div>
  );
}
