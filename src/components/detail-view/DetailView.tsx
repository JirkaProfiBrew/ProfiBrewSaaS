"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";

import type { DetailViewProps } from "./types";

function DetailViewSkeleton(): React.ReactElement {
  return (
    <div className="flex flex-col gap-6">
      {/* Header skeleton */}
      <div className="flex items-center gap-4">
        <Skeleton className="h-9 w-9 rounded-md" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      {/* Content skeleton */}
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    </div>
  );
}

export function DetailView({
  title,
  subtitle,
  backHref,
  backLabel,
  tabs,
  actions,
  isLoading = false,
  children,
  onSave,
  onCancel,
  saveLabel,
  cancelLabel,
}: DetailViewProps): React.ReactElement {
  const t = useTranslations("common");

  if (isLoading) {
    return <DetailViewSkeleton />;
  }

  const resolvedTabs = tabs ?? [];
  const hasTabs = resolvedTabs.length > 0;
  const hasFooter = onSave !== undefined || onCancel !== undefined;
  const defaultTabKey = resolvedTabs[0]?.key ?? "";

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link href={backHref} aria-label={backLabel ?? t("back")}>
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <div className="flex flex-col gap-0.5">
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            {subtitle !== undefined && (
              <p className="text-sm text-muted-foreground">{subtitle}</p>
            )}
          </div>
        </div>

        {actions !== undefined && actions.length > 0 && (
          <div className="flex items-center gap-2">
            {actions.map((action) => {
              const Icon = action.icon;
              return (
                <Button
                  key={action.key}
                  variant={action.variant ?? "outline"}
                  onClick={action.onClick}
                >
                  {Icon !== undefined && <Icon className="size-4" />}
                  {action.label}
                </Button>
              );
            })}
          </div>
        )}
      </div>

      {/* Tabs or children content */}
      {hasTabs ? (
        <Tabs defaultValue={defaultTabKey} className="flex flex-col gap-4">
          <TabsList>
            {resolvedTabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <TabsTrigger key={tab.key} value={tab.key}>
                  {Icon !== undefined && <Icon className="size-4" />}
                  {tab.label}
                </TabsTrigger>
              );
            })}
          </TabsList>
          {resolvedTabs.map((tab) => (
            <TabsContent key={tab.key} value={tab.key}>
              {tab.content}
            </TabsContent>
          ))}
        </Tabs>
      ) : (
        children !== undefined && <div>{children}</div>
      )}

      {/* Footer */}
      {hasFooter && (
        <div
          className={cn(
            "flex items-center justify-end gap-2 border-t pt-4"
          )}
        >
          {onCancel !== undefined && (
            <Button variant="outline" onClick={onCancel}>
              {cancelLabel ?? t("cancel")}
            </Button>
          )}
          {onSave !== undefined && (
            <Button variant="default" onClick={onSave}>
              {saveLabel ?? t("save")}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
