import { useTranslations } from "next-intl";

export default function PartnersPage(): React.ReactNode {
  const t = useTranslations("partners");

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="mt-2 text-muted-foreground">Coming Soon</p>
      </div>
    </div>
  );
}
