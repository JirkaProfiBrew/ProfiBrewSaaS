"use client";

import { useTranslations } from "next-intl";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// ── Props ──────────────────────────────────────────────────────

interface ExciseBatchCardProps {
  exciseRelevantHl: string | null;
  exciseStatus: string | null;
  plato: string | null;
}

// ── Component ──────────────────────────────────────────────────

export function ExciseBatchCard({
  exciseRelevantHl,
  exciseStatus,
  plato,
}: ExciseBatchCardProps): React.ReactNode {
  const t = useTranslations("excise");

  const statusLabel = exciseStatus
    ? t(
        `batch.exciseStatus.${exciseStatus}` as Parameters<typeof t>[0]
      )
    : t("batch.exciseStatus.none");

  const statusVariant: "default" | "secondary" | "outline" =
    exciseStatus === "reported"
      ? "default"
      : exciseStatus === "recorded"
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
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">
            {t("batch.volume")}
          </span>
          <span>
            {exciseRelevantHl
              ? `${Number(exciseRelevantHl).toFixed(2)} hl`
              : "---"}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">
            {t("batch.plato")}
          </span>
          <span>
            {plato ? `${Number(plato).toFixed(1)} °P` : "---"}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Status</span>
          <Badge variant={statusVariant}>{statusLabel}</Badge>
        </div>
      </CardContent>
    </Card>
  );
}
