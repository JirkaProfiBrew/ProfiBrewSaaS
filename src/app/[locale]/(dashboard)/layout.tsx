// TODO: Phase 0F — DashboardLayout (TopBar + Sidebar + ModuleGuard)
export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>): React.ReactNode {
  return (
    <div className="min-h-screen">
      {children}
    </div>
  );
}
