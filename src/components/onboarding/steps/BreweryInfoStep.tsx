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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateBreweryInfo } from "@/modules/onboarding/actions";

interface BreweryInfoStepProps {
  tenantName: string;
  tenantSettings: Record<string, unknown>;
  onNext: () => Promise<void>;
  onBack: () => void;
  onSave?: (name: string) => void;
}

export function BreweryInfoStep({
  tenantName,
  tenantSettings,
  onNext,
  onBack,
  onSave,
}: BreweryInfoStepProps): React.ReactNode {
  const t = useTranslations("onboarding");
  const [isPending, startTransition] = useTransition();

  const address = (tenantSettings.address as Record<string, string>) ?? {};

  const [name, setName] = useState(tenantName);
  const [street, setStreet] = useState(address.street ?? "");
  const [city, setCity] = useState(address.city ?? "");
  const [zip, setZip] = useState(address.zip ?? "");
  const [ico, setIco] = useState(
    (tenantSettings.ico as string) ?? ""
  );
  const [dic, setDic] = useState(
    (tenantSettings.dic as string) ?? ""
  );

  function handleSubmit(): void {
    startTransition(async () => {
      await updateBreweryInfo({ name, street, city, zip, ico, dic });
      onSave?.(name);
      await onNext();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("brewery.title")}</CardTitle>
        <CardDescription>{t("brewery.info")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="brewery-name">{t("brewery.nameLabel")}</Label>
          <Input
            id="brewery-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label>{t("brewery.addressLabel")}</Label>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="street" className="text-xs text-muted-foreground">
                {t("brewery.streetLabel")}
              </Label>
              <Input
                id="street"
                value={street}
                onChange={(e) => setStreet(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="city" className="text-xs text-muted-foreground">
                {t("brewery.cityLabel")}
              </Label>
              <Input
                id="city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="zip" className="text-xs text-muted-foreground">
                {t("brewery.zipLabel")}
              </Label>
              <Input
                id="zip"
                value={zip}
                onChange={(e) => setZip(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="ico">{t("brewery.icoLabel")}</Label>
            <Input
              id="ico"
              value={ico}
              onChange={(e) => setIco(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="dic">{t("brewery.dicLabel")}</Label>
            <Input
              id="dic"
              value={dic}
              onChange={(e) => setDic(e.target.value)}
            />
          </div>
        </div>

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
