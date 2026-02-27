"use client";

import { useTranslations } from "next-intl";
import { ImageIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";

import type { CardViewConfig, CardViewProps, ColumnDef } from "./types";

// ── Helpers ─────────────────────────────────────────────────

function getFieldValue(
  row: Record<string, unknown>,
  key: string,
): unknown {
  return row[key];
}

function getStringValue(
  row: Record<string, unknown>,
  key: string,
): string {
  const value = getFieldValue(row, key);
  if (value === null || value === undefined) return "";
  return String(value);
}

/**
 * Evaluates a "field=value" condition against a row.
 * Returns true if no condition is specified (always show).
 */
function evaluateShowIf(
  row: Record<string, unknown>,
  showIf?: string,
): boolean {
  if (!showIf) return true;

  const separatorIndex = showIf.indexOf("=");
  if (separatorIndex === -1) return true;

  const field = showIf.slice(0, separatorIndex);
  const expectedValue = showIf.slice(separatorIndex + 1);
  const actualValue = getStringValue(row, field);

  return actualValue === expectedValue;
}

function getRowId(row: Record<string, unknown>): string {
  const id = row.id;
  if (id === null || id === undefined) return "";
  return String(id);
}

// ── Skeleton Cards (Loading State) ──────────────────────────

function SkeletonCard(): React.ReactNode {
  return (
    <Card className="overflow-hidden">
      <Skeleton className="h-36 w-full rounded-none" />
      <CardHeader>
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <div className="flex gap-2">
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-5 w-14 rounded-full" />
        </div>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </CardContent>
    </Card>
  );
}

function LoadingGrid(): React.ReactNode {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      {Array.from({ length: 6 }, (_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

// ── Empty State ─────────────────────────────────────────────

function EmptyState({ message }: { message: string }): React.ReactNode {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <ImageIcon className="text-muted-foreground mb-4 size-12" />
      <p className="text-muted-foreground text-sm">{message}</p>
    </div>
  );
}

// ── Single Card ─────────────────────────────────────────────

interface DataCardProps {
  row: Record<string, unknown>;
  cardConfig: CardViewConfig;
  columns: ColumnDef[];
  isSelected: boolean;
  onSelect: (id: string) => void;
  onClick?: (row: Record<string, unknown>) => void;
}

function DataCard({
  row,
  cardConfig,
  columns,
  isSelected,
  onSelect,
  onClick,
}: DataCardProps): React.ReactNode {
  const rowId = getRowId(row);
  const title = getStringValue(row, cardConfig.titleField);
  const subtitle = cardConfig.subtitleField
    ? getStringValue(row, cardConfig.subtitleField)
    : undefined;
  const imageUrl = cardConfig.imageField
    ? getStringValue(row, cardConfig.imageField)
    : undefined;
  const hasImage = cardConfig.imageField !== undefined || cardConfig.renderImage !== undefined;
  const customImage = cardConfig.renderImage ? cardConfig.renderImage(row) : null;

  function handleCardClick(): void {
    onClick?.(row);
  }

  function handleCheckboxChange(): void {
    onSelect(rowId);
  }

  function handleCheckboxClick(e: React.MouseEvent): void {
    e.stopPropagation();
  }

  return (
    <Card
      className={cn(
        "group relative overflow-hidden transition-shadow",
        onClick && "cursor-pointer hover:shadow-md",
        isSelected && "ring-primary ring-2",
      )}
      onClick={onClick ? handleCardClick : undefined}
    >
      {/* Selection checkbox — visible on hover or when selected */}
      <div
        className={cn(
          "absolute right-3 top-3 z-10 transition-opacity",
          isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100",
        )}
        onClick={handleCheckboxClick}
      >
        <Checkbox
          checked={isSelected}
          onCheckedChange={handleCheckboxChange}
          aria-label={`Select ${title}`}
        />
      </div>

      {/* Image area */}
      {hasImage && (
        <div className="bg-muted flex h-36 w-full items-center justify-center overflow-hidden">
          {customImage ? (
            customImage
          ) : imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt={title}
              className="size-full object-cover"
            />
          ) : (
            <ImageIcon className="text-muted-foreground size-10" />
          )}
        </div>
      )}

      {/* Title & Subtitle */}
      <CardHeader className="pb-0">
        <p className="truncate text-sm font-semibold leading-tight">{title}</p>
        {subtitle && (
          <p className="text-muted-foreground truncate text-xs">{subtitle}</p>
        )}
      </CardHeader>

      {/* Badges & Metrics */}
      <CardContent className="flex flex-col gap-3">
        {/* Badge fields */}
        {cardConfig.badgeFields && cardConfig.badgeFields.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {cardConfig.badgeFields.map((fieldKey) => {
              const rawValue = getStringValue(row, fieldKey);
              if (!rawValue) return null;
              const col = columns.find((c) => c.key === fieldKey);
              const displayValue = col?.valueLabels?.[rawValue] ?? rawValue;
              return (
                <Badge key={fieldKey} variant="secondary">
                  {displayValue}
                </Badge>
              );
            })}
          </div>
        )}

        {/* Metric fields */}
        {cardConfig.metricFields && cardConfig.metricFields.length > 0 && (
          <div className="flex flex-col gap-1">
            {cardConfig.metricFields.map((metric) => {
              if (!evaluateShowIf(row, metric.showIf)) return null;

              const metricValue = getStringValue(row, metric.key);
              return (
                <div
                  key={metric.key}
                  className="flex items-center justify-between text-xs"
                >
                  <span className="text-muted-foreground">{metric.label}</span>
                  <span className="font-medium">{metricValue}</span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── CardView (main export) ──────────────────────────────────

export function CardView({
  config,
  data,
  isLoading,
  selectedRows,
  onSelectRow,
  onRowClick,
}: CardViewProps): React.ReactNode {
  const t = useTranslations("dataBrowser");

  if (isLoading) {
    return <LoadingGrid />;
  }

  if (data.length === 0) {
    return <EmptyState message={t("noData")} />;
  }

  const cardConfig = config.views.card;

  // If card view is disabled (false), render nothing
  if (cardConfig === false) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      {data.map((row) => {
        const rowId = getRowId(row);
        return (
          <DataCard
            key={rowId}
            row={row}
            cardConfig={cardConfig}
            columns={config.columns}
            isSelected={selectedRows.has(rowId)}
            onSelect={onSelectRow}
            onClick={onRowClick}
          />
        );
      })}
    </div>
  );
}
