"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { updateExciseSettings } from "@/modules/onboarding/actions";

interface ExciseStepProps {
  tenantSettings: Record<string, unknown>;
  onNext: () => Promise<void>;
  onBack: () => void;
}

export function ExciseStep({
  tenantSettings,
  onNext,
  onBack,
}: ExciseStepProps): React.ReactNode {
  const t = useTranslations("onboarding");
  const [isPending, startTransition] = useTransition();

  const [exciseEnabled, setExciseEnabled] = useState<boolean>(
    (tenantSettings.excise_enabled as boolean) ?? false
  );

  function handleSubmit(): void {
    startTransition(async () => {
      await updateExciseSettings(exciseEnabled);
      await onNext();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("excise.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center justify-between rounded-md border p-4">
          <Label htmlFor="excise-enabled" className="font-medium">
            {t("excise.enabledLabel")}
          </Label>
          <Switch
            id="excise-enabled"
            checked={exciseEnabled}
            onCheckedChange={setExciseEnabled}
          />
        </div>

        <p className="text-sm text-muted-foreground">{t("excise.info")}</p>

        <div className="flex justify-between pt-4">
          <Button variant="outline" onClick={onBack} disabled={isPending}>
            {t("back")}
          </Button>
          <Button onClick={handleSubmit} disabled={isPending}>
            {t("next")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
