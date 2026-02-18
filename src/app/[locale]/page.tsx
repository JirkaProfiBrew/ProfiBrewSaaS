import { useTranslations } from "next-intl";

export default function HomePage(): React.ReactNode {
  const t = useTranslations("common");

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold">ProfiBrew</h1>
        <p className="mt-2 text-muted-foreground">{t("comingSoon")}</p>
      </div>
    </div>
  );
}
