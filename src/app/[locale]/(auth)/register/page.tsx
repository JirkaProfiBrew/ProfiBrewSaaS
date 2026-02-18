import { useTranslations } from "next-intl";

export default function RegisterPage(): React.ReactNode {
  const t = useTranslations("auth");

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold">{t("register")}</h1>
        <p className="mt-2 text-muted-foreground">Coming Soon</p>
      </div>
    </div>
  );
}
