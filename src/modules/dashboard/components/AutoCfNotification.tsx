"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { Banknote } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getTodayAutoGenerationInfo } from "@/modules/cashflows/actions";
import type { AutoGenerationInfo } from "@/modules/cashflows/actions";

function formatCZK(value: string): string {
  const num = parseFloat(value) || 0;
  return num.toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function AutoCfNotification(): React.ReactNode {
  const t = useTranslations("cashflows");
  const [info, setInfo] = useState<AutoGenerationInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    getTodayAutoGenerationInfo()
      .then((data) => { if (!cancelled) setInfo(data); })
      .catch((err: unknown) => { console.error("Failed to load auto-gen info:", err); });
    return (): void => { cancelled = true; };
  }, []);

  if (!info) return null;

  return (
    <Alert>
      <Banknote className="h-4 w-4" />
      <AlertTitle>
        {t("autoGenerate.todayTitle", { count: info.generated })}
      </AlertTitle>
      <AlertDescription>
        <ul className="mt-1 text-sm">
          {info.details.map((d, i) => (
            <li key={i}>
              {d.templateName}: {d.code} — {d.date} — {formatCZK(d.amount)} Kč
            </li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
