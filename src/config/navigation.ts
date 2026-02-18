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
      { slug: "batches", icon: FlaskRound, labelKey: "batches", path: "batches" },
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
      { slug: "excise", icon: FileText, labelKey: "excise", path: "excise" },
      { slug: "monthlyReport", icon: FileText, labelKey: "monthlyReport", path: "monthly-report" },
      { slug: "cashflow", icon: Banknote, labelKey: "cashflow", path: "cashflow" },
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
  { slug: "users", icon: UserCog, labelKey: "users", path: "settings/users" },
  { slug: "counters", icon: Hash, labelKey: "counters", path: "settings/counters" },
];
