import { redirect } from "next/navigation";
import { loadTenantForUser } from "@/lib/db/tenant-loader";
import { TenantProvider } from "@/components/providers/TenantProvider";
import { SidebarProvider } from "@/components/layout/sidebar-context";
import { TopBar } from "@/components/layout/TopBar";
import { Sidebar } from "@/components/layout/Sidebar";

interface DashboardLayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}

export default async function DashboardLayout({
  children,
  params,
}: DashboardLayoutProps): Promise<React.ReactNode> {
  const { locale } = await params;
  const tenantData = await loadTenantForUser();

  if (!tenantData) {
    redirect(`/${locale}/login`);
  }

  return (
    <TenantProvider value={tenantData}>
      <SidebarProvider>
        <div className="flex h-screen flex-col">
          <TopBar />
          <div className="flex flex-1 overflow-hidden">
            <Sidebar />
            <main className="flex-1 overflow-y-auto p-6">
              {children}
            </main>
          </div>
        </div>
      </SidebarProvider>
    </TenantProvider>
  );
}
