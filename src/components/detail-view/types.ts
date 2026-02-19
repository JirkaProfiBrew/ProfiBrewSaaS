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
}

export interface DetailViewProps {
  title: string;
  subtitle?: string;
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
