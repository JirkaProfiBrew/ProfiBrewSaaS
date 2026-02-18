"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { modules, settingsAgenda, type AgendaConfig } from "@/config/navigation";

export function Sidebar(): React.ReactNode {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  // Determine active module from URL
  const pathSegments = pathname.split("/");
  const activeModuleSlug = pathSegments[2] ?? "";

  const activeModule = modules.find((m) => m.basePath === activeModuleSlug);
  const agendas: AgendaConfig[] = activeModule?.agendas ?? [];

  function isAgendaActive(agenda: AgendaConfig): boolean {
    if (!activeModule) return false;
    const agendaPath = `/${activeModule.basePath}/${agenda.path}`;
    // pathname is /cs/brewery/partners → check if it contains the agenda path
    return pathname.includes(agendaPath);
  }

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        className={cn(
          "flex flex-col border-r bg-muted/30 transition-all duration-200",
          collapsed ? "w-16" : "w-60"
        )}
      >
        {/* Agenda list */}
        <ScrollArea className="flex-1 py-2">
          <nav className="flex flex-col gap-0.5 px-2">
            {agendas.map((agenda) => {
              const active = isAgendaActive(agenda);
              const href = `/${activeModule?.basePath}/${agenda.path}`;

              if (collapsed) {
                return (
                  <Tooltip key={agenda.slug}>
                    <TooltipTrigger asChild>
                      <Link
                        href={href}
                        className={cn(
                          "flex h-10 w-10 mx-auto items-center justify-center rounded-md transition-colors",
                          active
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                        )}
                      >
                        <agenda.icon className="h-5 w-5" />
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      {t(`agendas.${agenda.labelKey}`)}
                    </TooltipContent>
                  </Tooltip>
                );
              }

              return (
                <Link
                  key={agenda.slug}
                  href={href}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  )}
                >
                  <agenda.icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">
                    {t(`agendas.${agenda.labelKey}`)}
                  </span>
                </Link>
              );
            })}
          </nav>
        </ScrollArea>

        {/* Settings + collapse button */}
        <div className="border-t px-2 py-2 flex flex-col gap-0.5">
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href="/settings"
                  className="flex h-10 w-10 mx-auto items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  <settingsAgenda.icon className="h-5 w-5" />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">
                {t(`agendas.${settingsAgenda.labelKey}`)}
              </TooltipContent>
            </Tooltip>
          ) : (
            <Link
              href="/settings"
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
            >
              <settingsAgenda.icon className="h-4 w-4 shrink-0" />
              <span>{t(`agendas.${settingsAgenda.labelKey}`)}</span>
            </Link>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCollapsed(!collapsed)}
            className={cn("w-full", collapsed && "px-0")}
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <>
                <ChevronLeft className="h-4 w-4 mr-2" />
                <span className="text-xs text-muted-foreground">
                  {/* Collapse label not needed — icon is self-explanatory */}
                </span>
              </>
            )}
          </Button>
        </div>
      </aside>
    </TooltipProvider>
  );
}
