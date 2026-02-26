"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { DetailView } from "@/components/detail-view";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { generateMonthlyReport } from "../actions";

export function MonthlyReportNew(): React.ReactNode {
  const t = useTranslations("excise");
  const router = useRouter();

  const [period, setPeriod] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [saving, setSaving] = useState(false);

  const handleSave = useCallback(async (): Promise<void> => {
    if (!period) return;
    setSaving(true);
    try {
      const report = await generateMonthlyReport(period);
      toast.success(t("reports.generate"));
      router.push(`/stock/monthly-report/${report.id}`);
    } catch (error) {
      console.error("Failed to generate report:", error);
      toast.error(String(error));
    } finally {
      setSaving(false);
    }
  }, [period, t, router]);

  return (
    <div className="flex flex-col gap-6 p-6">
      <DetailView
        title={t("reports.generateDialog.title")}
        backHref="/stock/monthly-report"
        isLoading={false}
        onSave={() => { void handleSave(); }}
        onCancel={() => { router.push("/stock/monthly-report"); }}
        saveLabel={t("reports.generateDialog.confirm")}
        cancelLabel={t("reports.generateDialog.cancel")}
      >
        <div className="max-w-sm space-y-2">
          <Label>{t("reports.generateDialog.selectPeriod")}</Label>
          <Input
            type="month"
            value={period}
            onChange={(e) => { setPeriod(e.target.value); }}
            disabled={saving}
          />
        </div>
      </DetailView>
    </div>
  );
}
