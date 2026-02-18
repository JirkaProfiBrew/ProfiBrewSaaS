"use client";

import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { Lock, LogOut, Settings, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useTenantContext } from "@/components/providers/TenantProvider";
import { modules } from "@/config/navigation";
import { signOut } from "@/lib/auth/actions";

export function TopBar(): React.ReactNode {
  const t = useTranslations("nav");
  const tAuth = useTranslations("auth");
  const pathname = usePathname();
  const { tenantName, hasModule } = useTenantContext();

  // Determine active module from URL
  const pathSegments = pathname.split("/");
  // pathname is like /cs/brewery/partners → segments: ['', 'cs', 'brewery', 'partners']
  const activeModuleSlug = pathSegments[2] ?? "";

  return (
    <header className="sticky top-0 z-50 flex h-14 items-center border-b bg-background px-4">
      {/* Left: Tenant name */}
      <div className="mr-6 font-semibold text-lg shrink-0">
        {tenantName}
      </div>

      {/* Center: Module tabs */}
      <nav className="hidden md:flex items-center gap-1">
        {modules.map((mod) => {
          const isActive = activeModuleSlug === mod.basePath;
          const hasAccess = hasModule(mod.slug);

          return (
            <Link
              key={mod.slug}
              href={hasAccess ? `/${mod.basePath}` : `/upgrade?module=${mod.slug}`}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : hasAccess
                    ? "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    : "text-muted-foreground/50 cursor-not-allowed"
              )}
            >
              <mod.icon className="h-4 w-4" />
              <span>{t(`modules.${mod.labelKey}`)}</span>
              {!hasAccess && <Lock className="h-3 w-3" />}
            </Link>
          );
        })}
      </nav>

      {/* Right: User menu */}
      <div className="ml-auto flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="relative h-8 w-8 rounded-full">
              <Avatar className="h-8 w-8">
                <AvatarFallback>
                  <User className="h-4 w-4" />
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem asChild>
              <Link href="/settings" className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                {t("agendas.settings")}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => void signOut()}
              className="flex items-center gap-2"
            >
              <LogOut className="h-4 w-4" />
              {tAuth("logout")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
