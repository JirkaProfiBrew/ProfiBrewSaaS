"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { ExternalLink } from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import type { ExciseMovement } from "../types";

// ── Props ──────────────────────────────────────────────────────

interface ExciseBatchCardProps {
  batchId: string;
}

// ── Component ──────────────────────────────────────────────────

export function ExciseBatchCard({
  batchId,
}: ExciseBatchCardProps): React.ReactNode {
  const t = useTranslations("excise");
  const [movements, setMovements] = useState<ExciseMovement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    import("../actions")
      .then((mod) => mod.getExciseMovementsForBatch(batchId))
      .then((data) => {
        if (!cancelled) setMovements(data);
      })
      .catch((err: unknown) => {
        console.error("Failed to load excise movements for batch:", err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return (): void => {
      cancelled = true;
    };
  }, [batchId]);

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">
            {t("batch.exciseTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-16 animate-pulse rounded bg-muted" />
        </CardContent>
      </Card>
    );
  }

  if (movements.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">
            {t("batch.exciseTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {t("batch.exciseStatus.none")}
          </p>
        </CardContent>
      </Card>
    );
  }

  // Aggregate totals: in adds, out subtracts
  const totalVolumeHl = movements.reduce((sum, m) => {
    const vol = Number(m.volumeHl || 0);
    return m.direction === "out" ? sum - vol : sum + vol;
  }, 0);
  const totalTax = movements.reduce((sum, m) => {
    const tax = Number(m.taxAmount || 0);
    return m.direction === "out" ? sum - tax : sum + tax;
  }, 0);
  // Use plato and rate from the first movement (they should be consistent)
  const firstMovement = movements[0]!;
  const plato = firstMovement.plato ? Number(firstMovement.plato) : null;
  const taxRate = firstMovement.taxRate ? Number(firstMovement.taxRate) : null;

  const statusVariant: "default" | "secondary" | "outline" =
    firstMovement.status === "reported"
      ? "default"
      : firstMovement.status === "confirmed"
        ? "secondary"
        : "outline";

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">
          {t("batch.exciseTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <Row
          label={t("batch.volume")}
          value={`${totalVolumeHl.toFixed(2)} hl`}
        />
        {plato !== null && (
          <Row
            label={t("batch.plato")}
            value={`${plato.toFixed(1)} °P`}
          />
        )}
        {taxRate !== null && (
          <Row
            label={t("batch.rate")}
            value={`${taxRate.toLocaleString("cs-CZ")} Kč/°P/hl`}
          />
        )}
        <Row
          label={t("batch.tax")}
          value={
            totalTax > 0
              ? `${totalTax.toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Kč`
              : "---"
          }
          bold={totalTax > 0}
        />
        <div className="flex justify-between items-center text-sm">
          <span className="text-muted-foreground">Status</span>
          <Badge variant={statusVariant}>
            {t(
              `movements.status.${firstMovement.status}` as Parameters<
                typeof t
              >[0]
            )}
          </Badge>
        </div>

        {/* Links to individual movements */}
        {movements.length > 0 && (
          <div className="pt-1 border-t space-y-1">
            {movements.map((m) => (
              <Link
                key={m.id}
                href={`/stock/excise/${m.id}`}
                className="flex items-center justify-between text-xs text-primary hover:underline"
              >
                <span>
                  {t(
                    `movements.movementType.${m.movementType}` as Parameters<
                      typeof t
                    >[0]
                  )}
                  {" — "}
                  {Number(m.volumeHl).toFixed(2)} hl
                </span>
                <ExternalLink className="size-3 shrink-0" />
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Helper ───────────────────────────────────────────────────────

function Row({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}): React.ReactNode {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={bold ? "font-medium" : ""}>{value}</span>
    </div>
  );
}
