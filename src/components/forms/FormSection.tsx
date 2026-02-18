"use client";

import * as React from "react";
import { Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

import type { FormFieldDef, FormSectionProps } from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resolveBoolean(
  value: boolean | ((values: Record<string, unknown>) => boolean) | undefined,
  values: Record<string, unknown>,
  fallback: boolean
): boolean {
  if (value === undefined) return fallback;
  if (typeof value === "function") return value(values);
  return value;
}

const GRID_COLS: Record<1 | 2 | 3 | 4, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 md:grid-cols-2",
  3: "grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
  4: "grid-cols-1 md:grid-cols-2 lg:grid-cols-4",
};

const COL_SPAN: Record<1 | 2 | 3 | 4, string> = {
  1: "col-span-1",
  2: "col-span-1 md:col-span-2",
  3: "col-span-1 md:col-span-2 lg:col-span-3",
  4: "col-span-1 md:col-span-2 lg:col-span-4",
};

// ---------------------------------------------------------------------------
// Per-type field renderers
// ---------------------------------------------------------------------------

interface FieldRendererProps {
  field: FormFieldDef;
  value: unknown;
  disabled: boolean;
  onChange: (key: string, value: unknown) => void;
}

function renderTextInput({ field, value, disabled, onChange }: FieldRendererProps): React.ReactNode {
  return (
    <Input
      id={field.key}
      value={typeof value === "string" ? value : ""}
      placeholder={field.placeholder}
      disabled={disabled}
      onChange={(e) => onChange(field.key, e.target.value)}
    />
  );
}

function renderTextarea({ field, value, disabled, onChange }: FieldRendererProps): React.ReactNode {
  return (
    <Textarea
      id={field.key}
      value={typeof value === "string" ? value : ""}
      placeholder={field.placeholder}
      disabled={disabled}
      onChange={(e) => onChange(field.key, e.target.value)}
    />
  );
}

function renderNumberInput({ field, value, disabled, onChange }: FieldRendererProps): React.ReactNode {
  const step = field.type === "decimal" || field.type === "currency" ? "0.01" : "1";

  const input = (
    <Input
      id={field.key}
      type="number"
      step={step}
      value={value !== undefined && value !== null ? String(value) : ""}
      placeholder={field.placeholder}
      disabled={disabled}
      className={cn(
        field.prefix && "rounded-l-none",
        field.suffix && "rounded-r-none"
      )}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === "") {
          onChange(field.key, null);
        } else {
          onChange(field.key, field.type === "number" ? parseInt(raw, 10) : parseFloat(raw));
        }
      }}
    />
  );

  if (!field.prefix && !field.suffix) return input;

  return (
    <div className="flex items-center">
      {field.prefix && (
        <span className="border-input bg-muted text-muted-foreground inline-flex h-9 items-center rounded-l-md border border-r-0 px-3 text-sm">
          {field.prefix}
        </span>
      )}
      {input}
      {field.suffix && (
        <span className="border-input bg-muted text-muted-foreground inline-flex h-9 items-center rounded-r-md border border-l-0 px-3 text-sm">
          {field.suffix}
        </span>
      )}
    </div>
  );
}

function renderDateInput({ field, value, disabled, onChange }: FieldRendererProps): React.ReactNode {
  const type = field.type === "datetime" ? "datetime-local" : "date";
  return (
    <Input
      id={field.key}
      type={type}
      value={typeof value === "string" ? value : ""}
      disabled={disabled}
      onChange={(e) => onChange(field.key, e.target.value)}
    />
  );
}

function renderSelect({ field, value, disabled, onChange }: FieldRendererProps): React.ReactNode {
  const options = field.options ?? [];
  return (
    <Select
      value={typeof value === "string" ? value : undefined}
      onValueChange={(v) => onChange(field.key, v)}
      disabled={disabled}
    >
      <SelectTrigger id={field.key} className="w-full">
        <SelectValue placeholder={field.placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function renderMultiselect({ field, value, disabled, onChange }: FieldRendererProps): React.ReactNode {
  const options = field.options ?? [];
  const selected = Array.isArray(value) ? (value as string[]) : [];

  function handleToggle(optionValue: string, checked: boolean): void {
    const next = checked
      ? [...selected, optionValue]
      : selected.filter((v) => v !== optionValue);
    onChange(field.key, next);
  }

  return (
    <div className="flex flex-col gap-2">
      {options.map((opt) => (
        <div key={opt.value} className="flex items-center gap-2">
          <Checkbox
            id={`${field.key}-${opt.value}`}
            checked={selected.includes(opt.value)}
            disabled={disabled}
            onCheckedChange={(checked) => handleToggle(opt.value, checked === true)}
          />
          <Label
            htmlFor={`${field.key}-${opt.value}`}
            className="font-normal"
          >
            {opt.label}
          </Label>
        </div>
      ))}
    </div>
  );
}

function renderToggle({ field, value, disabled, onChange }: FieldRendererProps): React.ReactNode {
  return (
    <div className="flex items-center gap-2 pt-2">
      <Switch
        id={field.key}
        checked={value === true}
        disabled={disabled}
        onCheckedChange={(checked) => onChange(field.key, checked)}
      />
    </div>
  );
}

function renderCheckbox({ field, value, disabled, onChange }: FieldRendererProps): React.ReactNode {
  return (
    <div className="flex items-center gap-2 pt-2">
      <Checkbox
        id={field.key}
        checked={value === true}
        disabled={disabled}
        onCheckedChange={(checked) => onChange(field.key, checked === true)}
      />
    </div>
  );
}

function renderComputed({ field, value }: Pick<FieldRendererProps, "field" | "value">): React.ReactNode {
  const displayValue = value !== undefined && value !== null ? String(value) : "";

  const input = (
    <Input
      id={field.key}
      value={displayValue}
      disabled
      readOnly
      className={cn(
        "bg-muted",
        field.prefix && "rounded-l-none",
        field.suffix && "rounded-r-none"
      )}
    />
  );

  if (!field.prefix && !field.suffix) return input;

  return (
    <div className="flex items-center">
      {field.prefix && (
        <span className="border-input bg-muted text-muted-foreground inline-flex h-9 items-center rounded-l-md border border-r-0 px-3 text-sm">
          {field.prefix}
        </span>
      )}
      {input}
      {field.suffix && (
        <span className="border-input bg-muted text-muted-foreground inline-flex h-9 items-center rounded-r-md border border-l-0 px-3 text-sm">
          {field.suffix}
        </span>
      )}
    </div>
  );
}

function renderColorInput({ field, value, disabled, onChange }: FieldRendererProps): React.ReactNode {
  return (
    <Input
      id={field.key}
      type="color"
      value={typeof value === "string" ? value : "#000000"}
      disabled={disabled}
      className="h-9 w-16 cursor-pointer p-1"
      onChange={(e) => onChange(field.key, e.target.value)}
    />
  );
}

function renderFileUpload({ field, disabled, onChange }: Omit<FieldRendererProps, "value">): React.ReactNode {
  return (
    <Input
      id={field.key}
      type="file"
      disabled={disabled}
      onChange={(e) => {
        const files = e.target.files;
        onChange(field.key, files && files.length > 0 ? files[0] : null);
      }}
    />
  );
}

function renderRelation({ field, value, disabled, onChange }: FieldRendererProps): React.ReactNode {
  return (
    <div className="relative">
      <Input
        id={field.key}
        value={typeof value === "string" ? value : ""}
        placeholder={field.placeholder}
        disabled={disabled}
        className="pr-9"
        onChange={(e) => onChange(field.key, e.target.value)}
      />
      <Search className="text-muted-foreground pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Field dispatcher
// ---------------------------------------------------------------------------

function renderField(
  field: FormFieldDef,
  value: unknown,
  disabled: boolean,
  onChange: (key: string, value: unknown) => void
): React.ReactNode {
  const props: FieldRendererProps = { field, value, disabled, onChange };

  switch (field.type) {
    case "text":
      return renderTextInput(props);
    case "textarea":
      return renderTextarea(props);
    case "number":
    case "decimal":
    case "currency":
      return renderNumberInput(props);
    case "date":
    case "datetime":
      return renderDateInput(props);
    case "select":
      return renderSelect(props);
    case "multiselect":
      return renderMultiselect(props);
    case "toggle":
      return renderToggle(props);
    case "checkbox":
      return renderCheckbox(props);
    case "computed":
      return renderComputed({ field, value });
    case "color":
      return renderColorInput(props);
    case "file_upload":
      return renderFileUpload({ field, disabled, onChange });
    case "relation":
      return renderRelation(props);
    default: {
      // Exhaustive check — if new types are added this will become a compile error
      const _exhaustive: never = field.type;
      return _exhaustive;
    }
  }
}

// ---------------------------------------------------------------------------
// FormSection component
// ---------------------------------------------------------------------------

export function FormSection({
  section,
  values,
  errors,
  mode,
  onChange,
}: FormSectionProps): React.ReactNode {
  const columns = section.columns ?? 2;

  return (
    <div className="space-y-4">
      {/* Section header */}
      {(section.title || section.description) && (
        <div className="space-y-1">
          {section.title && (
            <h3 className="text-lg font-semibold leading-none tracking-tight">
              {section.title}
            </h3>
          )}
          {section.description && (
            <p className="text-muted-foreground text-sm">
              {section.description}
            </p>
          )}
        </div>
      )}

      {/* Fields grid */}
      <div className={cn("grid gap-4", GRID_COLS[columns])}>
        {section.fields.map((field) => {
          // Visibility check
          const isVisible = resolveBoolean(field.visible, values, true);
          if (!isVisible) return null;

          // Disabled state
          const isFieldDisabled =
            mode === "readonly" || resolveBoolean(field.disabled, values, false);

          // Compute value for computed fields
          const fieldValue =
            field.type === "computed" && field.computeFn
              ? field.computeFn(values)
              : values[field.key];

          // Grid span
          const span = field.gridSpan ?? 1;
          const spanClass = span > 1 ? COL_SPAN[span] : undefined;

          const error = errors?.[field.key];

          return (
            <div key={field.key} className={cn("space-y-2", spanClass)}>
              {/* Label */}
              <Label htmlFor={field.key}>
                {field.label}
                {field.required && (
                  <span className="text-destructive ml-1">*</span>
                )}
              </Label>

              {/* Field */}
              {renderField(field, fieldValue, isFieldDisabled, onChange)}

              {/* Error message */}
              {error && (
                <p className="text-destructive text-sm">{error}</p>
              )}

              {/* Help text */}
              {field.helpText && !error && (
                <p className="text-muted-foreground text-sm">
                  {field.helpText}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
