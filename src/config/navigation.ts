import {
  Beer,
  Package,
  ShoppingCart,
  DollarSign,
  CalendarDays,
  LayoutDashboard,
  Users,
  Contact,
  Wheat,
  FlaskConical,
  FlaskRound,
  Flame,
  Wrench,
  Boxes,
  ArrowLeftRight,
  Search,
  FileText,
  ClipboardList,
  Banknote,
  Landmark,
  Settings,
  ShoppingBag,
  Building2,
  Hash,
  UserCog,
  Warehouse,
  Repeat,
  GlassWater,
  Thermometer,
  type LucideIcon,
} from "lucide-react";

export interface AgendaConfig {
  slug: string;
  icon: LucideIcon;
  /** i18n key in nav.agendas namespace */
  labelKey: string;
  /** Route path relative to module (e.g. "partners" → /brewery/partners) */
  path: string;
}

export interface ModuleConfig {
  slug: string;
  icon: LucideIcon;
  /** i18n key in nav.modules namespace */
  labelKey: string;
  /** Base route path (e.g. "brewery" → /brewery) */
  basePath: string;
  agendas: AgendaConfig[];
}

export const modules: ModuleConfig[] = [
  {
    slug: "brewery",
    icon: Beer,
    labelKey: "brewery",
    basePath: "brewery",
    agendas: [
      { slug: "overview", icon: LayoutDashboard, labelKey: "overview", path: "overview" },
      { slug: "partners", icon: Users, labelKey: "partners", path: "partners" },
      { slug: "contacts", icon: Contact, labelKey: "contacts", path: "contacts" },
      { slug: "materials", icon: Wheat, labelKey: "materials", path: "materials" },
      { slug: "recipes", icon: FlaskConical, labelKey: "recipes", path: "recipes" },
      { slug: "beerStyles", icon: GlassWater, labelKey: "beerStyles", path: "beer-styles" },
      { slug: "batches", icon: FlaskRound, labelKey: "batches", path: "batches" },
      { slug: "brewingSystems", icon: Flame, labelKey: "brewingSystems", path: "brewing-systems" },
      { slug: "mashingProfiles", icon: Thermometer, labelKey: "mashingProfiles", path: "mashing-profiles" },
      { slug: "equipment", icon: Wrench, labelKey: "equipment", path: "equipment" },
      { slug: "productSetup", icon: ShoppingBag, labelKey: "productSetup", path: "product-setup" },
    ],
  },
  {
    slug: "stock",
    icon: Package,
    labelKey: "stock",
    basePath: "stock",
    agendas: [
      { slug: "overview", icon: LayoutDashboard, labelKey: "overview", path: "overview" },
      { slug: "items", icon: Boxes, labelKey: "items", path: "items" },
      { slug: "movements", icon: ArrowLeftRight, labelKey: "movements", path: "movements" },
      { slug: "tracking", icon: Search, labelKey: "tracking", path: "tracking" },
      { slug: "excise", icon: FileText, labelKey: "excise", path: "excise" },
      { slug: "monthlyReport", icon: ClipboardList, labelKey: "monthlyReport", path: "monthly-report" },
    ],
  },
  {
    slug: "sales",
    icon: ShoppingCart,
    labelKey: "sales",
    basePath: "sales",
    agendas: [
      { slug: "overview", icon: LayoutDashboard, labelKey: "overview", path: "overview" },
      { slug: "orders", icon: ClipboardList, labelKey: "orders", path: "orders" },
    ],
  },
  {
    slug: "finance",
    icon: DollarSign,
    labelKey: "finance",
    basePath: "finance",
    agendas: [
      { slug: "overview", icon: LayoutDashboard, labelKey: "overview", path: "overview" },
      { slug: "cashflow", icon: Banknote, labelKey: "cashflow", path: "cashflow" },
      { slug: "cashflowTemplates", icon: Repeat, labelKey: "cashflowTemplates", path: "cashflow/templates" },
      { slug: "cashdesk", icon: Landmark, labelKey: "cashdesk", path: "cashdesk" },
    ],
  },
  {
    slug: "plan",
    icon: CalendarDays,
    labelKey: "plan",
    basePath: "plan",
    agendas: [],
  },
];

export const settingsAgenda: AgendaConfig = {
  slug: "settings",
  icon: Settings,
  labelKey: "settings",
  path: "settings",
};

/**
 * Settings sub-agendas — shown when Settings is selected.
 */
export const settingsSubAgendas: AgendaConfig[] = [
  { slug: "settingsGeneral", icon: Settings, labelKey: "settingsGeneral", path: "settings" },
  { slug: "shops", icon: Building2, labelKey: "shops", path: "settings/shops" },
  { slug: "warehouses", icon: Warehouse, labelKey: "warehouses", path: "settings/warehouses" },
  { slug: "users", icon: UserCog, labelKey: "users", path: "settings/users" },
  { slug: "counters", icon: Hash, labelKey: "counters", path: "settings/counters" },
  { slug: "deposits", icon: Package, labelKey: "deposits", path: "settings/deposits" },
  { slug: "cashflowCategories", icon: Banknote, labelKey: "cashflowCategories", path: "settings/cashflow-categories" },
  { slug: "cashDesks", icon: Landmark, labelKey: "cashDesks", path: "settings/cash-desks" },
  { slug: "exciseSettings", icon: FileText, labelKey: "exciseSettings", path: "settings/excise" },
];
