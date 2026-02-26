import { useTranslations } from "next-intl";
import { AutoCfNotification } from "@/modules/dashboard/components/AutoCfNotification";

export default function DashboardPage(): React.ReactNode {
  const t = useTranslations("common");

  return (
    <div className="flex flex-col gap-6 p-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <AutoCfNotification />
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-muted-foreground">{t("comingSoon")}</p>
      </div>
    </div>
  );
}
