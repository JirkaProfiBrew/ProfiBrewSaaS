"use client";

import { useTranslations } from "next-intl";

interface Props {
  batchId: string;
}

export function FermentationPhase({ batchId: _batchId }: Props): React.ReactNode {
  const t = useTranslations("batches");
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold">{t("brew.phases.fermentation")}</h2>
      <p className="text-muted-foreground">Phase content coming in Phase C/D/E/F</p>
    </div>
  );
}
