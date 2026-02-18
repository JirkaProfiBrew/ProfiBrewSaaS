"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { PaginationBarProps } from "./types";

// ── Main Component ─────────────────────────────────────────

export function PaginationBar({
  page,
  pageSize,
  totalCount,
  pageSizeOptions,
  onPageChange,
  onPageSizeChange,
}: PaginationBarProps): React.ReactElement {
  const t = useTranslations("dataBrowser");

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const isFirstPage = page <= 1;
  const isLastPage = page >= totalPages;

  function handlePrevious(): void {
    if (!isFirstPage) {
      onPageChange(page - 1);
    }
  }

  function handleNext(): void {
    if (!isLastPage) {
      onPageChange(page + 1);
    }
  }

  function handlePageSizeChange(value: string): void {
    const newPageSize = Number(value);
    if (!isNaN(newPageSize) && newPageSize > 0) {
      onPageSizeChange(newPageSize);
    }
  }

  return (
    <div className="flex items-center justify-between">
      {/* Left: Total count */}
      <p className="text-muted-foreground text-sm">
        {t("total", { count: totalCount })}
      </p>

      {/* Center: Page size selector */}
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground text-sm">
          {t("pageSize")}
        </span>
        <Select
          value={String(pageSize)}
          onValueChange={handlePageSizeChange}
        >
          <SelectTrigger size="sm" className="w-[70px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {pageSizeOptions.map((option) => (
              <SelectItem key={option} value={String(option)}>
                {option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Right: Page navigation */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handlePrevious}
          disabled={isFirstPage}
          aria-label={t("previous")}
        >
          <ChevronLeft />
          {t("previous")}
        </Button>

        <span className="text-muted-foreground text-sm">
          {t("pageOf", { page, total: totalPages })}
        </span>

        <Button
          variant="outline"
          size="sm"
          onClick={handleNext}
          disabled={isLastPage}
          aria-label={t("next")}
        >
          {t("next")}
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}
