import type { LucideIcon } from "lucide-react";

export interface DetailViewTab {
  key: string;
  label: string;
  icon?: LucideIcon;
  content: React.ReactNode;
}

export interface DetailViewAction {
  key: string;
  label: string;
  icon?: LucideIcon;
  variant?: "default" | "destructive" | "outline" | "ghost";
  onClick: () => void;
  /** When set, the action shows a confirmation AlertDialog before executing. */
  confirm?: {
    title: string;
    description: string;
  };
}

export interface DetailViewProps {
  title: string;
  subtitle?: string;
  /** Custom content rendered next to the title/subtitle area (e.g. an icon or visual). */
  headerExtra?: React.ReactNode;
  backHref: string;
  backLabel?: string;
  tabs?: DetailViewTab[];
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  actions?: DetailViewAction[];
  isLoading?: boolean;
  children?: React.ReactNode;
  onSave?: () => void;
  onCancel?: () => void;
  saveLabel?: string;
  cancelLabel?: string;
}
