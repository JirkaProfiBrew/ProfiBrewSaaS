"use client";

import { useTranslations, useLocale } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { Globe, Lock, LogOut, Settings, User } from "lucide-react";
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
import { routing } from "@/i18n/routing";
import { signOut } from "@/lib/auth/actions";

export function TopBar(): React.ReactNode {
  const t = useTranslations("nav");
  const tAuth = useTranslations("auth");
  const locale = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const { tenantName, hasModule } = useTenantContext();

  // Language switcher: cycle to the next locale
  const otherLocale = routing.locales.find((l) => l !== locale) ?? routing.locales[0];
  const handleSwitchLocale = (): void => {
    // Replace /cs/ with /en/ (or vice versa) in current pathname
    const newPath = pathname.replace(`/${locale}`, `/${otherLocale}`);
    router.push(newPath);
  };

  // pathname: /cs/brewery/partners → segments: ['', 'cs', 'brewery', 'partners']
  const pathSegments = pathname.split("/");
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
          const defaultAgenda = mod.agendas[0]?.path ?? "";
          const moduleHref = hasAccess
            ? `/${locale}/${mod.basePath}/${defaultAgenda}`
            : `/${locale}/upgrade?module=${mod.slug}`;

          return (
            <Link
              key={mod.slug}
              href={moduleHref}
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

      {/* Right: Language + User menu */}
      <div className="ml-auto flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleSwitchLocale}
          className="flex items-center gap-1.5 text-sm text-muted-foreground"
        >
          <Globe className="h-4 w-4" />
          <span className="uppercase">{otherLocale}</span>
        </Button>
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
              <Link href={`/${locale}/settings`} className="flex items-center gap-2">
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
