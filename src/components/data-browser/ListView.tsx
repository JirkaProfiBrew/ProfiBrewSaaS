"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Check,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

import type { ColumnDef, ListViewProps } from "./types";

// ── Constants ───────────────────────────────────────────────

const SKELETON_ROW_COUNT = 5;

// ── Cell Renderer ───────────────────────────────────────────

function renderCellValue(
  column: ColumnDef,
  value: unknown,
  row: Record<string, unknown>
): React.ReactNode {
  // Custom render function takes priority
  if (column.render) {
    return column.render(value, row);
  }

  // Null/undefined → empty
  if (value === null || value === undefined) {
    return null;
  }

  switch (column.type) {
    case "text":
      return String(value);

    case "number": {
      if (column.format) {
        return column.format.replace("{value}", String(value));
      }
      return String(value);
    }

    case "boolean":
      return value ? (
        <Check className="size-4 text-green-600" />
      ) : (
        <X className="size-4 text-muted-foreground" />
      );

    case "date": {
      const date = value instanceof Date ? value : new Date(String(value));
      if (isNaN(date.getTime())) {
        return String(value);
      }
      return date.toLocaleDateString();
    }

    case "link":
      return (
        <span className="underline text-primary">
          {String(value)}
        </span>
      );

    case "badge": {
      const badgeLabel = column.valueLabels?.[String(value)] ?? String(value);
      return (
        <Badge variant="secondary">
          {badgeLabel}
        </Badge>
      );
    }

    case "currency": {
      if (column.format) {
        return column.format.replace("{value}", String(value));
      }
      return `${String(value)} Kč`;
    }

    case "icon":
      return value ? (
        <Check className="size-4 text-green-600" />
      ) : null;

    default:
      return String(value);
  }
}

// ── Sort Icon ───────────────────────────────────────────────

function SortIcon({
  columnKey,
  currentSort,
  currentDirection,
}: {
  columnKey: string;
  currentSort: string;
  currentDirection: "asc" | "desc";
}): React.ReactElement {
  if (currentSort !== columnKey) {
    return <ArrowUpDown className="ml-1 inline size-3.5 text-muted-foreground" />;
  }
  if (currentDirection === "asc") {
    return <ArrowUp className="ml-1 inline size-3.5" />;
  }
  return <ArrowDown className="ml-1 inline size-3.5" />;
}

// ── Loading Skeleton ────────────────────────────────────────

function LoadingSkeleton({
  columnCount,
}: {
  columnCount: number;
}): React.ReactElement {
  return (
    <>
      {Array.from({ length: SKELETON_ROW_COUNT }, (_, rowIndex) => (
        <TableRow key={`skeleton-${rowIndex}`}>
          {/* Checkbox column skeleton */}
          <TableCell>
            <Skeleton className="h-4 w-4" />
          </TableCell>
          {Array.from({ length: columnCount }, (_, colIndex) => (
            <TableCell key={`skeleton-${rowIndex}-${colIndex}`}>
              <Skeleton className="h-4 w-24" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

// ── Empty State ─────────────────────────────────────────────

function EmptyState({
  columnCount,
  message,
}: {
  columnCount: number;
  message: string;
}): React.ReactElement {
  return (
    <TableRow>
      <TableCell
        colSpan={columnCount + 1}
        className="h-24 text-center text-muted-foreground"
      >
        {message}
      </TableCell>
    </TableRow>
  );
}

// ── Main Component ──────────────────────────────────────────

export function ListView({
  config,
  data,
  isLoading,
  params,
  selectedRows,
  onSelectRow,
  onSelectAll,
  onSort,
  onRowClick,
}: ListViewProps): React.ReactElement {
  const t = useTranslations("dataBrowser");

  const columns = config.columns;
  const allSelected = data.length > 0 && data.every(
    (row) => selectedRows.has(String(row["id"] ?? ""))
  );
  const someSelected = data.some(
    (row) => selectedRows.has(String(row["id"] ?? ""))
  ) && !allSelected;

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {/* Select-all checkbox */}
            <TableHead className="w-10">
              <Checkbox
                checked={allSelected ? true : someSelected ? "indeterminate" : false}
                onCheckedChange={onSelectAll}
                aria-label={t("selectAll")}
              />
            </TableHead>

            {/* Column headers */}
            {columns.map((column) => (
              <TableHead
                key={column.key}
                className={cn(
                  column.sortable && "cursor-pointer select-none",
                  (column.type === "number" || column.type === "currency") &&
                    "text-right"
                )}
                style={column.width ? { width: `${column.width}px` } : undefined}
                onClick={
                  column.sortable ? () => onSort(column.key) : undefined
                }
              >
                <span className="inline-flex items-center">
                  {column.label}
                  {column.sortable && (
                    <SortIcon
                      columnKey={column.key}
                      currentSort={params.sort}
                      currentDirection={params.sortDirection}
                    />
                  )}
                </span>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>

        <TableBody>
          {isLoading ? (
            <LoadingSkeleton columnCount={columns.length} />
          ) : data.length === 0 ? (
            <EmptyState
              columnCount={columns.length}
              message={t("noData")}
            />
          ) : (
            data.map((row) => {
              const rowId = String(row["id"] ?? "");
              const isSelected = selectedRows.has(rowId);

              return (
                <TableRow
                  key={rowId}
                  data-state={isSelected ? "selected" : undefined}
                  className={cn(
                    onRowClick && "cursor-pointer"
                  )}
                  onClick={() => onRowClick?.(row)}
                >
                  {/* Row checkbox */}
                  <TableCell
                    onClick={(e: React.MouseEvent) => e.stopPropagation()}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => onSelectRow(rowId)}
                      aria-label={t("selectRow")}
                    />
                  </TableCell>

                  {/* Data cells */}
                  {columns.map((column) => {
                    const value = row[column.key];

                    return (
                      <TableCell
                        key={column.key}
                        className={cn(
                          (column.type === "number" || column.type === "currency") &&
                            "text-right"
                        )}
                      >
                        {renderCellValue(column, value, row)}
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
