import { getLocale } from "next-intl/server";

interface OnboardingLayoutProps {
  children: React.ReactNode;
}

export default async function OnboardingLayout({
  children,
}: OnboardingLayoutProps): Promise<React.ReactNode> {
  const locale = await getLocale();

  return (
    <div className="flex min-h-screen flex-col bg-muted/30">
      {/* Header — ProfiBrew branding only */}
      <header className="border-b bg-background px-6 py-4">
        <div className="mx-auto max-w-3xl">
          <span className="text-xl font-bold tracking-tight">
            Profi<span className="text-primary">Brew</span>
          </span>
        </div>
      </header>

      {/* Content */}
      <main className="flex flex-1 items-start justify-center px-4 py-8">
        <div className="w-full max-w-3xl">{children}</div>
      </main>
    </div>
  );
}
