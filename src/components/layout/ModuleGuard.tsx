import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { hasModuleAccess } from "@/lib/module-access/check";
import { moduleRoutes } from "@/config/module-routes";
import type { ReactNode } from "react";

interface ModuleGuardProps {
  children: ReactNode;
  tenantId: string;
  locale: string;
}

function getModuleFromPath(pathname: string): string | null {
  const pathWithoutLocale = pathname.replace(/^\/(cs|en)/, "") || "/";
  const firstSegment = "/" + (pathWithoutLocale.split("/")[1] ?? "");
  return moduleRoutes[firstSegment] ?? null;
}

export async function ModuleGuard({
  children,
  tenantId,
  locale,
}: ModuleGuardProps): Promise<ReactNode> {
  const headersList = await headers();
  const pathname = headersList.get("x-next-pathname") ?? "";
  const moduleSlug = getModuleFromPath(pathname);

  // No module mapping found or always-available module
  if (!moduleSlug || moduleSlug === "_always" || moduleSlug === "brewery") {
    return <>{children}</>;
  }

  const allowed = await hasModuleAccess(tenantId, moduleSlug);

  if (!allowed) {
    redirect(`/${locale}/upgrade?module=${moduleSlug}`);
  }

  return <>{children}</>;
}
