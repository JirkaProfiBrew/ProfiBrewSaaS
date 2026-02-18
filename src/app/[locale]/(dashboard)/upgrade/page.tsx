import { useTranslations } from "next-intl";

export default function UpgradePage(): React.ReactNode {
  const t = useTranslations("common");

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Upgrade</h1>
        <p className="mt-2 text-muted-foreground">{t("comingSoon")}</p>
      </div>
    </div>
  );
}
