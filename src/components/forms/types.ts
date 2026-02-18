import type { ZodType } from "zod";

export type FormMode = "create" | "edit" | "readonly";

export type FormFieldType =
  | "text"
  | "textarea"
  | "number"
  | "decimal"
  | "date"
  | "datetime"
  | "select"
  | "multiselect"
  | "toggle"
  | "checkbox"
  | "file_upload"
  | "relation"
  | "computed"
  | "color"
  | "currency";

export interface FormFieldOption {
  value: string;
  label: string;
}

export interface RelationConfig {
  entity: string;
  displayField: string;
  searchFields: string[];
}

export interface FormFieldDef {
  key: string;
  label: string;
  type: FormFieldType;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean | ((values: Record<string, unknown>) => boolean);
  visible?: boolean | ((values: Record<string, unknown>) => boolean);
  validation?: ZodType;
  options?: FormFieldOption[];
  optionsFrom?: string;
  relationConfig?: RelationConfig;
  computeFn?: (values: Record<string, unknown>) => unknown;
  gridSpan?: 1 | 2 | 3 | 4;
  helpText?: string;
  prefix?: string;
  suffix?: string;
}

export interface FormSectionDef {
  title?: string;
  description?: string;
  columns?: 1 | 2 | 3 | 4;
  fields: FormFieldDef[];
}

export interface FormSectionProps {
  section: FormSectionDef;
  values: Record<string, unknown>;
  errors?: Record<string, string>;
  mode: FormMode;
  onChange: (key: string, value: unknown) => void;
}
