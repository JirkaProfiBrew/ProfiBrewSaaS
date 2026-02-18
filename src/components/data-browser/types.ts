import type { LucideIcon } from "lucide-react";

// ── View & Sort ──────────────────────────────────────────────

export type ViewMode = "list" | "card";
export type SortDirection = "asc" | "desc";

// ── Column Types ─────────────────────────────────────────────

export type ColumnType =
  | "text"
  | "number"
  | "boolean"
  | "date"
  | "link"
  | "badge"
  | "icon"
  | "currency";

export interface ColumnDef {
  key: string;
  label: string;
  type: ColumnType;
  sortable?: boolean;
  width?: number;
  format?: string;
  /** Map raw values to localized display labels (used by badge columns). */
  valueLabels?: Record<string, string>;
  render?: (value: unknown, row: Record<string, unknown>) => React.ReactNode;
}

// ── Card View Config ─────────────────────────────────────────

export interface CardMetricField {
  key: string;
  label: string;
  format?: string;
  /** Conditional display: "field=value" syntax */
  showIf?: string;
}

export interface CardViewConfig {
  enabled: boolean;
  imageField?: string;
  titleField: string;
  subtitleField?: string;
  badgeFields?: string[];
  metricFields?: CardMetricField[];
  actions?: string[];
}

// ── Filters ──────────────────────────────────────────────────

export type FilterType =
  | "text"
  | "select"
  | "multiselect"
  | "boolean"
  | "date_range"
  | "number_range";

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterDef {
  key: string;
  label: string;
  type: FilterType;
  options?: FilterOption[];
  /** Dynamic options loaded from DB — e.g. "items.brand" */
  optionsFrom?: string;
}

export interface QuickFilter {
  key: string;
  label: string;
  filter: Record<string, unknown>;
}

// ── Actions & Permissions ────────────────────────────────────

export type RowClickAction = "detail" | "edit" | "none";

export interface DataBrowserActions {
  create?: { label: string; enabled: boolean };
  bulkDelete?: boolean;
  bulkExport?: boolean;
  rowClick?: RowClickAction;
  /** Custom row-level actions shown in the "..." menu */
  rowActions?: RowActionDef[];
}

export interface RowActionDef {
  key: string;
  label: string;
  icon?: LucideIcon;
  variant?: "default" | "destructive";
  onClick?: (row: Record<string, unknown>) => void;
}

export interface DataBrowserPermissions {
  create: string[];
  read: string[];
  update: string[];
  delete: string[];
}

// ── Main Config ──────────────────────────────────────────────

export interface DataBrowserConfig {
  entity: string;
  title: string;
  baseFilter?: Record<string, unknown>;

  views: {
    list: { enabled: boolean; default?: boolean };
    card: CardViewConfig | false;
  };

  columns: ColumnDef[];
  quickFilters?: QuickFilter[];
  filters?: FilterDef[];

  defaultSort: { key: string; direction: SortDirection };
  pageSize: number;
  pageSizeOptions: number[];

  actions: DataBrowserActions;
  permissions: DataBrowserPermissions;
}

// ── URL-based State ──────────────────────────────────────────

export interface DataBrowserParams {
  view: ViewMode;
  page: number;
  pageSize: number;
  sort: string;
  sortDirection: SortDirection;
  search: string;
  quickFilter: string;
  filters: Record<string, unknown>;
}

// ── Component Props ──────────────────────────────────────────

export interface DataBrowserProps {
  config: DataBrowserConfig;
  data: Record<string, unknown>[];
  totalCount: number;
  isLoading: boolean;
  onParamsChange: (params: DataBrowserParams) => void;
  /** Override default row click behavior (which navigates to pathname/id). */
  onRowClick?: (row: Record<string, unknown>) => void;
}

export interface ListViewProps {
  config: DataBrowserConfig;
  data: Record<string, unknown>[];
  isLoading: boolean;
  params: DataBrowserParams;
  selectedRows: Set<string>;
  onSelectRow: (id: string) => void;
  onSelectAll: () => void;
  onSort: (key: string) => void;
  onRowClick?: (row: Record<string, unknown>) => void;
}

export interface CardViewProps {
  config: DataBrowserConfig;
  data: Record<string, unknown>[];
  isLoading: boolean;
  selectedRows: Set<string>;
  onSelectRow: (id: string) => void;
  onRowClick?: (row: Record<string, unknown>) => void;
}

export interface PaginationBarProps {
  page: number;
  pageSize: number;
  totalCount: number;
  pageSizeOptions: number[];
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}

export interface QuickFiltersBarProps {
  quickFilters: QuickFilter[];
  activeFilter: string;
  onFilterChange: (key: string) => void;
}

export interface ToolbarProps {
  config: DataBrowserConfig;
  params: DataBrowserParams;
  onViewChange: (view: ViewMode) => void;
  onSearchChange: (search: string) => void;
  onToggleFilters: () => void;
  onCreate?: () => void;
}

export interface ParametricFilterPanelProps {
  filters: FilterDef[];
  activeFilters: Record<string, unknown>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (filters: Record<string, unknown>) => void;
  onClear: () => void;
}

export interface BulkActionsBarProps {
  selectedCount: number;
  onDelete?: () => void;
  onExport?: () => void;
  onClearSelection: () => void;
}

export interface ActiveFilterChipsProps {
  filters: Record<string, unknown>;
  filterDefs: FilterDef[];
  onRemoveFilter: (key: string) => void;
  onClearAll: () => void;
}
