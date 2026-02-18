"use client";

import { useState, useCallback, Suspense } from "react";
import { useRouter, usePathname } from "next/navigation";

import { Separator } from "@/components/ui/separator";

import type { DataBrowserProps, ViewMode } from "./types";
import { useDataBrowserParams } from "./useDataBrowserParams";
import { Toolbar } from "./Toolbar";
import { QuickFiltersBar } from "./QuickFiltersBar";
import { ActiveFilterChips } from "./ActiveFilterChips";
import { ListView } from "./ListView";
import { CardView } from "./CardView";
import { PaginationBar } from "./PaginationBar";
import { BulkActionsBar } from "./BulkActionsBar";
import { ParametricFilterPanel } from "./ParametricFilterPanel";

// ── Inner component (needs Suspense for useSearchParams) ────

function DataBrowserInner({
  config,
  data,
  totalCount,
  isLoading,
  onParamsChange,
  onRowClick: externalRowClick,
}: DataBrowserProps): React.ReactNode {
  const router = useRouter();
  const pathname = usePathname();

  const {
    params,
    setView,
    setPage,
    setPageSize,
    setSort,
    setSearch,
    setQuickFilter,
    setFilters,
    removeFilter,
    clearFilters,
  } = useDataBrowserParams(config);

  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);

  // ── Selection handlers ────────────────────────────────────

  const handleSelectRow = useCallback((id: string): void => {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback((): void => {
    setSelectedRows((prev) => {
      const allIds = data.map((row) => String(row["id"] ?? ""));
      const allSelected = allIds.every((id) => prev.has(id));
      if (allSelected) {
        return new Set();
      }
      return new Set(allIds);
    });
  }, [data]);

  const handleClearSelection = useCallback((): void => {
    setSelectedRows(new Set());
  }, []);

  // ── Navigation handlers ───────────────────────────────────

  const handleRowClick = useCallback(
    (row: Record<string, unknown>): void => {
      const action = config.actions.rowClick;
      if (!action || action === "none") return;

      const rowId = String(row["id"] ?? "");
      if (!rowId) return;

      if (action === "detail" || action === "edit") {
        router.push(`${pathname}/${rowId}`);
      }
    },
    [config.actions.rowClick, router, pathname]
  );

  const handleCreate = useCallback((): void => {
    router.push(`${pathname}/new`);
  }, [router, pathname]);

  // ── View change handler (also notifies parent) ────────────

  const handleViewChange = useCallback(
    (view: ViewMode): void => {
      setView(view);
    },
    [setView]
  );

  const handleSearchChange = useCallback(
    (search: string): void => {
      setSearch(search);
      onParamsChange({ ...params, search, page: 1 });
    },
    [setSearch, onParamsChange, params]
  );

  const handleSortChange = useCallback(
    (key: string): void => {
      setSort(key);
    },
    [setSort]
  );

  const handlePageChange = useCallback(
    (page: number): void => {
      setPage(page);
    },
    [setPage]
  );

  const handlePageSizeChange = useCallback(
    (pageSize: number): void => {
      setPageSize(pageSize);
    },
    [setPageSize]
  );

  const handleQuickFilterChange = useCallback(
    (key: string): void => {
      setQuickFilter(key);
    },
    [setQuickFilter]
  );

  const handleFiltersApply = useCallback(
    (filters: Record<string, unknown>): void => {
      setFilters(filters);
      setFilterPanelOpen(false);
    },
    [setFilters]
  );

  const handleFiltersClear = useCallback((): void => {
    clearFilters();
    setFilterPanelOpen(false);
  }, [clearFilters]);

  const handleToggleFilters = useCallback((): void => {
    setFilterPanelOpen((prev) => !prev);
  }, []);

  // ── Determine row click handler ───────────────────────────

  const rowClickAction = config.actions.rowClick;
  const rowClickHandler = externalRowClick
    ? externalRowClick
    : rowClickAction && rowClickAction !== "none"
      ? handleRowClick
      : undefined;

  // ── Render ────────────────────────────────────────────────

  const hasQuickFilters =
    config.quickFilters !== undefined && config.quickFilters.length > 0;
  const hasActiveFilters = Object.keys(params.filters).length > 0;
  const hasFilters =
    config.filters !== undefined && config.filters.length > 0;

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <Toolbar
        config={config}
        params={params}
        onViewChange={handleViewChange}
        onSearchChange={handleSearchChange}
        onToggleFilters={handleToggleFilters}
        onCreate={
          config.actions.create?.enabled ? handleCreate : undefined
        }
      />

      {/* Quick Filters */}
      {hasQuickFilters && (
        <QuickFiltersBar
          quickFilters={config.quickFilters ?? []}
          activeFilter={params.quickFilter}
          onFilterChange={handleQuickFilterChange}
        />
      )}

      {/* Active Filter Chips */}
      {hasActiveFilters && hasFilters && (
        <ActiveFilterChips
          filters={params.filters}
          filterDefs={config.filters ?? []}
          onRemoveFilter={removeFilter}
          onClearAll={handleFiltersClear}
        />
      )}

      <Separator />

      {/* Content: List or Card view */}
      {params.view === "card" &&
      config.views.card !== false &&
      config.views.card.enabled ? (
        <CardView
          config={config}
          data={data}
          isLoading={isLoading}
          selectedRows={selectedRows}
          onSelectRow={handleSelectRow}
          onRowClick={rowClickHandler}
        />
      ) : (
        <ListView
          config={config}
          data={data}
          isLoading={isLoading}
          params={params}
          selectedRows={selectedRows}
          onSelectRow={handleSelectRow}
          onSelectAll={handleSelectAll}
          onSort={handleSortChange}
          onRowClick={rowClickHandler}
        />
      )}

      {/* Pagination */}
      <PaginationBar
        page={params.page}
        pageSize={params.pageSize}
        totalCount={totalCount}
        pageSizeOptions={config.pageSizeOptions}
        onPageChange={handlePageChange}
        onPageSizeChange={handlePageSizeChange}
      />

      {/* Bulk Actions */}
      <BulkActionsBar
        selectedCount={selectedRows.size}
        onDelete={config.actions.bulkDelete ? handleClearSelection : undefined}
        onExport={config.actions.bulkExport ? handleClearSelection : undefined}
        onClearSelection={handleClearSelection}
      />

      {/* Parametric Filter Panel */}
      {hasFilters && (
        <ParametricFilterPanel
          filters={config.filters ?? []}
          activeFilters={params.filters}
          open={filterPanelOpen}
          onOpenChange={setFilterPanelOpen}
          onApply={handleFiltersApply}
          onClear={handleFiltersClear}
        />
      )}
    </div>
  );
}

// ── Main export with Suspense boundary ──────────────────────

export function DataBrowser(props: DataBrowserProps): React.ReactNode {
  return (
    <Suspense>
      <DataBrowserInner {...props} />
    </Suspense>
  );
}
