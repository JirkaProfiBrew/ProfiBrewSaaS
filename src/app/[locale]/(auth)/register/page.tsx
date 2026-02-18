import { getTranslations } from "next-intl/server";
import { RegisterForm } from "./RegisterForm";

export default async function RegisterPage(): Promise<React.ReactNode> {
  const t = await getTranslations("auth");

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30">
      <div className="w-full max-w-md space-y-6 px-4">
        <div className="text-center">
          <h1 className="text-3xl font-bold">ProfiBrew</h1>
          <p className="mt-2 text-muted-foreground">{t("register")}</p>
        </div>
        <RegisterForm />
      </div>
    </div>
  );
}
