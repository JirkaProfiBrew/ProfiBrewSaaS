"use client";

import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { skipOnboarding } from "@/modules/onboarding/actions";
import { Warehouse, Landmark, FolderKanban, Hash } from "lucide-react";

interface WelcomeStepProps {
  onNext: () => Promise<void>;
  locale: string;
}

export function WelcomeStep({ onNext, locale }: WelcomeStepProps): React.ReactNode {
  const t = useTranslations("onboarding");
  const [isPending, startTransition] = useTransition();

  function handleSkip(): void {
    startTransition(async () => {
      await skipOnboarding();
    });
  }

  function handleStart(): void {
    startTransition(async () => {
      await onNext();
    });
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">{t("welcome.title")}</CardTitle>
        <CardDescription className="text-base">
          {t("welcome.subtitle")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-3">
          <p className="text-sm font-medium text-muted-foreground">
            {t("welcome.created")}
          </p>
          <ul className="space-y-2">
            <li className="flex items-center gap-3 text-sm">
              <Warehouse className="h-4 w-4 text-primary" />
              {t("welcome.warehouses")}
            </li>
            <li className="flex items-center gap-3 text-sm">
              <Landmark className="h-4 w-4 text-primary" />
              {t("welcome.cashDesk")}
            </li>
            <li className="flex items-center gap-3 text-sm">
              <FolderKanban className="h-4 w-4 text-primary" />
              {t("welcome.cashflowCategories")}
            </li>
            <li className="flex items-center gap-3 text-sm">
              <Hash className="h-4 w-4 text-primary" />
              {t("welcome.counters")}
            </li>
          </ul>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Button onClick={handleStart} disabled={isPending} size="lg">
            {t("welcome.start")}
          </Button>
          <Button
            variant="ghost"
            onClick={handleSkip}
            disabled={isPending}
            size="lg"
          >
            {t("skip")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
