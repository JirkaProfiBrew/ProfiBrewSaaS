"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { ParametricFilterPanelProps, FilterDef } from "./types";

// ── Range value types ───────────────────────────────────────

interface DateRangeValue {
  from?: string;
  to?: string;
}

interface NumberRangeValue {
  min?: number;
  max?: number;
}

// ── Filter field renderers ──────────────────────────────────

function TextFilterField({
  filter,
  value,
  onChange,
}: {
  filter: FilterDef;
  value: string;
  onChange: (value: string) => void;
}): React.ReactNode {
  return (
    <Input
      id={`filter-${filter.key}`}
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function SelectFilterField({
  filter,
  value,
  onChange,
  placeholder,
}: {
  filter: FilterDef;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}): React.ReactNode {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={`filter-${filter.key}`} className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {filter.options?.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function MultiselectFilterField({
  filter,
  value,
  onChange,
}: {
  filter: FilterDef;
  value: string[];
  onChange: (value: string[]) => void;
}): React.ReactNode {
  const handleToggle = useCallback(
    (optionValue: string, checked: boolean): void => {
      if (checked) {
        onChange([...value, optionValue]);
      } else {
        onChange(value.filter((v) => v !== optionValue));
      }
    },
    [value, onChange]
  );

  return (
    <ScrollArea className="max-h-40 rounded-md border p-2">
      <div className="flex flex-col gap-2">
        {filter.options?.map((option) => (
          <div key={option.value} className="flex items-center gap-2">
            <Checkbox
              id={`filter-${filter.key}-${option.value}`}
              checked={value.includes(option.value)}
              onCheckedChange={(checked) =>
                handleToggle(option.value, checked === true)
              }
            />
            <Label
              htmlFor={`filter-${filter.key}-${option.value}`}
              className="cursor-pointer text-sm font-normal"
            >
              {option.label}
            </Label>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

function BooleanFilterField({
  filter,
  value,
  onChange,
  labelYes,
}: {
  filter: FilterDef;
  value: boolean | undefined;
  onChange: (value: boolean | undefined) => void;
  labelYes: string;
}): React.ReactNode {
  return (
    <div className="flex items-center gap-2">
      <Checkbox
        id={`filter-${filter.key}`}
        checked={value === true}
        onCheckedChange={(checked) =>
          onChange(checked === true ? true : undefined)
        }
      />
      <Label
        htmlFor={`filter-${filter.key}`}
        className="cursor-pointer text-sm font-normal"
      >
        {labelYes}
      </Label>
    </div>
  );
}

function DateRangeFilterField({
  filter,
  value,
  onChange,
  labelFrom,
  labelTo,
}: {
  filter: FilterDef;
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
  labelFrom: string;
  labelTo: string;
}): React.ReactNode {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1">
        <Label
          htmlFor={`filter-${filter.key}-from`}
          className="text-xs font-normal text-muted-foreground"
        >
          {labelFrom}
        </Label>
        <Input
          id={`filter-${filter.key}-from`}
          type="date"
          value={value.from ?? ""}
          onChange={(e) => onChange({ ...value, from: e.target.value || undefined })}
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label
          htmlFor={`filter-${filter.key}-to`}
          className="text-xs font-normal text-muted-foreground"
        >
          {labelTo}
        </Label>
        <Input
          id={`filter-${filter.key}-to`}
          type="date"
          value={value.to ?? ""}
          onChange={(e) => onChange({ ...value, to: e.target.value || undefined })}
        />
      </div>
    </div>
  );
}

function NumberRangeFilterField({
  filter,
  value,
  onChange,
  labelMin,
  labelMax,
}: {
  filter: FilterDef;
  value: NumberRangeValue;
  onChange: (value: NumberRangeValue) => void;
  labelMin: string;
  labelMax: string;
}): React.ReactNode {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-1">
        <Label
          htmlFor={`filter-${filter.key}-min`}
          className="text-xs font-normal text-muted-foreground"
        >
          {labelMin}
        </Label>
        <Input
          id={`filter-${filter.key}-min`}
          type="number"
          value={value.min ?? ""}
          onChange={(e) =>
            onChange({
              ...value,
              min: e.target.value !== "" ? Number(e.target.value) : undefined,
            })
          }
        />
      </div>
      <div className="flex flex-col gap-1">
        <Label
          htmlFor={`filter-${filter.key}-max`}
          className="text-xs font-normal text-muted-foreground"
        >
          {labelMax}
        </Label>
        <Input
          id={`filter-${filter.key}-max`}
          type="number"
          value={value.max ?? ""}
          onChange={(e) =>
            onChange({
              ...value,
              max: e.target.value !== "" ? Number(e.target.value) : undefined,
            })
          }
        />
      </div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────

export function ParametricFilterPanel({
  filters,
  activeFilters,
  open,
  onOpenChange,
  onApply,
  onClear,
}: ParametricFilterPanelProps): React.ReactNode {
  const t = useTranslations("dataBrowser");
  const [localFilters, setLocalFilters] =
    useState<Record<string, unknown>>(activeFilters);

  // Reset internal state when panel opens
  useEffect(() => {
    if (open) {
      setLocalFilters(activeFilters);
    }
  }, [open, activeFilters]);

  const updateFilter = useCallback(
    (key: string, value: unknown): void => {
      setLocalFilters((prev) => ({
        ...prev,
        [key]: value,
      }));
    },
    []
  );

  const handleApply = useCallback((): void => {
    // Remove empty/undefined values before applying
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(localFilters)) {
      if (value === undefined || value === "" || value === null) {
        continue;
      }
      if (Array.isArray(value) && value.length === 0) {
        continue;
      }
      if (
        typeof value === "object" &&
        value !== null &&
        !Array.isArray(value)
      ) {
        const objectValue = value as Record<string, unknown>;
        const hasValue = Object.values(objectValue).some(
          (v) => v !== undefined && v !== "" && v !== null
        );
        if (!hasValue) {
          continue;
        }
      }
      cleaned[key] = value;
    }
    onApply(cleaned);
  }, [localFilters, onApply]);

  const handleClear = useCallback((): void => {
    setLocalFilters({});
    onClear();
  }, [onClear]);

  const renderFilterField = useCallback(
    (filter: FilterDef): React.ReactNode => {
      switch (filter.type) {
        case "text":
          return (
            <TextFilterField
              filter={filter}
              value={(localFilters[filter.key] as string) ?? ""}
              onChange={(value) => updateFilter(filter.key, value)}
            />
          );

        case "select":
          return (
            <SelectFilterField
              filter={filter}
              value={(localFilters[filter.key] as string) ?? ""}
              onChange={(value) => updateFilter(filter.key, value)}
              placeholder={t("selectOption")}
            />
          );

        case "multiselect":
          return (
            <MultiselectFilterField
              filter={filter}
              value={(localFilters[filter.key] as string[]) ?? []}
              onChange={(value) => updateFilter(filter.key, value)}
            />
          );

        case "boolean":
          return (
            <BooleanFilterField
              filter={filter}
              value={localFilters[filter.key] as boolean | undefined}
              onChange={(value) => updateFilter(filter.key, value)}
              labelYes={t("yes")}
            />
          );

        case "date_range":
          return (
            <DateRangeFilterField
              filter={filter}
              value={(localFilters[filter.key] as DateRangeValue) ?? {}}
              onChange={(value) => updateFilter(filter.key, value)}
              labelFrom={t("from")}
              labelTo={t("to")}
            />
          );

        case "number_range":
          return (
            <NumberRangeFilterField
              filter={filter}
              value={(localFilters[filter.key] as NumberRangeValue) ?? {}}
              onChange={(value) => updateFilter(filter.key, value)}
              labelMin={t("min")}
              labelMax={t("max")}
            />
          );

        default: {
          const _exhaustiveCheck: never = filter.type;
          return _exhaustiveCheck;
        }
      }
    },
    [localFilters, updateFilter, t]
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-80">
        <SheetHeader>
          <SheetTitle>{t("filterPanel")}</SheetTitle>
        </SheetHeader>

        <ScrollArea className="flex-1 px-4">
          <div className="flex flex-col gap-5">
            {filters.map((filter) => (
              <div key={filter.key} className="flex flex-col gap-1.5">
                <Label
                  htmlFor={`filter-${filter.key}`}
                  className={cn(
                    "text-sm font-medium",
                    filter.type === "multiselect" && "mb-0.5"
                  )}
                >
                  {filter.label}
                </Label>
                {renderFilterField(filter)}
              </div>
            ))}
          </div>
        </ScrollArea>

        <SheetFooter>
          <Button variant="outline" onClick={handleClear} className="flex-1">
            {t("clearFilters")}
          </Button>
          <Button onClick={handleApply} className="flex-1">
            {t("applyFilters")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
