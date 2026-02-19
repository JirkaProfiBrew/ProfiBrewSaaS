"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { getLotBatchUsage } from "../actions";
import type { LotBatchUsage } from "../types";

// ── Props ──────────────────────────────────────────────────────

interface LotTraceabilityViewProps {
  lotId: string;
}

// ── Component ──────────────────────────────────────────────────

export function LotTraceabilityView({
  lotId,
}: LotTraceabilityViewProps): React.ReactNode {
  const t = useTranslations("materialLots");
  const router = useRouter();
  const [data, setData] = useState<LotBatchUsage[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!lotId) return;
    setIsLoading(true);
    void getLotBatchUsage(lotId)
      .then(setData)
      .finally(() => setIsLoading(false));
  }, [lotId]);

  if (isLoading) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {t("traceability.title")}...
      </p>
    );
  }

  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {t("traceability.noBatches")}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium">{t("traceability.title")}</h3>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("traceability.batch")}</TableHead>
            <TableHead>{t("traceability.recipe")}</TableHead>
            <TableHead>{t("traceability.brewDate")}</TableHead>
            <TableHead className="text-right">
              {t("traceability.quantityUsed")}
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row) => (
            <TableRow
              key={row.batchId}
              className="cursor-pointer hover:bg-muted/50"
              onClick={() => router.push(`/brewery/batches/${row.batchId}`)}
            >
              <TableCell className="font-medium text-blue-600">
                {row.batchNumber}
              </TableCell>
              <TableCell>{row.recipeName ?? "—"}</TableCell>
              <TableCell>
                {row.brewDate
                  ? new Date(row.brewDate).toLocaleDateString("cs-CZ")
                  : "—"}
              </TableCell>
              <TableCell className="text-right">
                {row.quantityUsed
                  ? `${parseFloat(row.quantityUsed).toLocaleString("cs-CZ")} g`
                  : "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
