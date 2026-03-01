import { redirect } from "next/navigation";
import Link from "next/link";
import { ShieldCheck, Thermometer, LayoutDashboard, ArrowLeft } from "lucide-react";
import { getCurrentSuperadmin } from "@/lib/auth/superadmin";

interface AdminLayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

export default async function AdminLayout({
  children,
  params,
}: AdminLayoutProps): Promise<React.ReactNode> {
  const { locale } = await params;

  // Superadmin gate — silently redirect non-superadmins to dashboard
  const superadminId = await getCurrentSuperadmin();
  if (!superadminId) {
    redirect(`/${locale}/dashboard`);
  }

  return (
    <div className="flex h-screen flex-col">
      {/* Admin header */}
      <header className="sticky top-0 z-50 flex h-14 items-center border-b bg-background px-4">
        <div className="flex items-center gap-2 font-semibold text-lg">
          <ShieldCheck className="h-5 w-5" />
          Admin Panel
        </div>
        <div className="ml-auto">
          <Link
            href={`/${locale}/dashboard`}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Dashboard
          </Link>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Admin sidebar */}
        <aside className="w-56 shrink-0 border-r bg-muted/30 p-4">
          <nav className="flex flex-col gap-1">
            <Link
              href={`/${locale}/admin`}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              <LayoutDashboard className="h-4 w-4" />
              SaaS Monitor
            </Link>

            <div className="mt-4 mb-1 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Systémové browsery
            </div>
            <Link
              href={`/${locale}/admin/mashing-profiles`}
              className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              <Thermometer className="h-4 w-4" />
              Rmutovací profily
            </Link>
          </nav>
        </aside>

        {/* Admin content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
