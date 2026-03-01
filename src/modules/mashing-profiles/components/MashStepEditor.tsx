"use client";

import { useState, useRef, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Plus, ChevronUp, ChevronDown, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

import { cn } from "@/lib/utils";
import type { MashStep, MashStepType, MashDuration } from "../types";

// ── Step templates ──────────────────────────────────────────────

interface StepTemplate {
  key: string;
  stepType: MashStepType;
  targetTemperatureC: number;
  holdTimeMin: number;
  rampTimeMin: number;
}

const STEP_TEMPLATES: StepTemplate[] = [
  { key: "acidRest", stepType: "rest", targetTemperatureC: 40, holdTimeMin: 15, rampTimeMin: 0 },
  { key: "betaGlucanRest", stepType: "rest", targetTemperatureC: 40, holdTimeMin: 20, rampTimeMin: 0 },
  { key: "proteinRest", stepType: "rest", targetTemperatureC: 52, holdTimeMin: 15, rampTimeMin: 0 },
  { key: "maltoseRest", stepType: "rest", targetTemperatureC: 63, holdTimeMin: 30, rampTimeMin: 0 },
  { key: "saccharificationRest", stepType: "rest", targetTemperatureC: 72, holdTimeMin: 30, rampTimeMin: 0 },
  { key: "mashOut", stepType: "mash_out", targetTemperatureC: 78, holdTimeMin: 10, rampTimeMin: 5 },
];

// ── Props ──────────────────────────────────────────────────────

interface MashStepEditorProps {
  steps: MashStep[];
  onChange: (steps: MashStep[]) => void;
  readonly?: boolean;
}

const STEP_TYPES: MashStepType[] = ["mash_in", "rest", "heat", "decoction", "mash_out"];

// ── Duration calculation ────────────────────────────────────────

function formatMinutes(totalMin: number): string {
  if (totalMin <= 0) return "0 min";
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m} min`;
}

export function calculateMashDuration(steps: MashStep[]): MashDuration {
  let totalRampMin = 0;
  let totalHoldMin = 0;

  for (const step of steps) {
    totalRampMin += step.rampTimeMin;
    totalHoldMin += step.holdTimeMin;
  }

  return {
    totalMin: totalRampMin + totalHoldMin,
    rampMin: totalRampMin,
    holdMin: totalHoldMin,
    formatted: formatMinutes(totalRampMin + totalHoldMin),
  };
}

// ── Name input with template autocomplete ───────────────────────

function NameInputWithTemplates({
  value,
  onValueChange,
  onSelectTemplate,
  templates,
}: {
  value: string;
  onValueChange: (v: string) => void;
  onSelectTemplate: (tmpl: StepTemplate) => void;
  templates: Array<StepTemplate & { label: string }>;
}): React.ReactNode {
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    if (!value) return templates;
    const lower = value.toLowerCase();
    return templates.filter((t) => t.label.toLowerCase().includes(lower));
  }, [value, templates]);

  const handleSelect = useCallback(
    (tmpl: StepTemplate & { label: string }): void => {
      onValueChange(tmpl.label);
      onSelectTemplate(tmpl);
      setOpen(false);
    },
    [onValueChange, onSelectTemplate]
  );

  return (
    <Popover open={open && filtered.length > 0} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => {
            onValueChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          className="h-8"
        />
      </PopoverTrigger>
      <PopoverContent
        className="w-64 p-1"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {filtered.map((tmpl) => (
          <button
            key={tmpl.key}
            type="button"
            className="flex w-full items-center justify-between rounded px-2 py-1.5 text-sm hover:bg-accent"
            onClick={() => handleSelect(tmpl)}
          >
            <span>{tmpl.label}</span>
            <span className="text-muted-foreground text-xs">{tmpl.targetTemperatureC}°C</span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

// ── Component ──────────────────────────────────────────────────

export function MashStepEditor({
  steps,
  onChange,
  readonly = false,
}: MashStepEditorProps): React.ReactNode {
  const t = useTranslations("mashingProfiles");

  const stepTypeLabels: Record<string, string> = {
    mash_in: t("stepType.mash_in"),
    rest: t("stepType.rest"),
    heat: t("stepType.heat"),
    decoction: t("stepType.decoction"),
    mash_out: t("stepType.mash_out"),
  };

  const templatesWithLabels = useMemo(
    () =>
      STEP_TEMPLATES.map((tmpl) => ({
        ...tmpl,
        label: t(`steps.templates.${tmpl.key}`),
      })),
    [t]
  );

  const duration = useMemo(() => calculateMashDuration(steps), [steps]);

  const handleAdd = (): void => {
    onChange([
      ...steps,
      { name: "", stepType: "rest", targetTemperatureC: 0, rampTimeMin: 0, holdTimeMin: 0 },
    ]);
  };

  const handleUpdate = (index: number, field: keyof MashStep, value: unknown): void => {
    const updated = steps.map((step, i) =>
      i === index ? { ...step, [field]: value } : step
    );
    onChange(updated);
  };

  const handleApplyTemplate = (index: number, tmpl: StepTemplate): void => {
    const updated = steps.map((step, i) =>
      i === index
        ? {
            ...step,
            stepType: tmpl.stepType,
            targetTemperatureC: tmpl.targetTemperatureC,
            holdTimeMin: tmpl.holdTimeMin,
            rampTimeMin: tmpl.rampTimeMin,
          }
        : step
    );
    onChange(updated);
  };

  const handleRemove = (index: number): void => {
    onChange(steps.filter((_, i) => i !== index));
  };

  const handleMoveUp = (index: number): void => {
    if (index <= 0) return;
    const updated = [...steps];
    const swp = updated[index - 1]!;
    updated[index - 1] = updated[index]!;
    updated[index] = swp;
    onChange(updated);
  };

  const handleMoveDown = (index: number): void => {
    if (index >= steps.length - 1) return;
    const updated = [...steps];
    const swp = updated[index + 1]!;
    updated[index + 1] = updated[index]!;
    updated[index] = swp;
    onChange(updated);
  };

  const colCount = readonly ? 8 : 9;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{t("steps.title")}</h3>
        {steps.length > 0 && (
          <span className="text-sm text-muted-foreground">
            {t("steps.totalDuration")}: <span className="font-semibold">{duration.formatted}</span>
            {" "}
            <span className="text-xs">
              ({t("steps.rampTotal")}: {formatMinutes(duration.rampMin)}, {t("steps.holdTotal")}: {formatMinutes(duration.holdMin)})
            </span>
          </span>
        )}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">#</TableHead>
            <TableHead>{t("steps.name")}</TableHead>
            <TableHead>{t("steps.type")}</TableHead>
            <TableHead className="text-right">{t("steps.targetTemp")}</TableHead>
            <TableHead className="text-right">{t("steps.rampTime")}</TableHead>
            <TableHead className="text-right">{t("steps.holdTime")}</TableHead>
            <TableHead className="text-right">{t("steps.totalTime")}</TableHead>
            <TableHead>{t("steps.notes")}</TableHead>
            {!readonly && <TableHead className="w-28" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {steps.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={colCount}
                className="text-muted-foreground text-center"
              >
                {t("steps.empty")}
              </TableCell>
            </TableRow>
          ) : (
            steps.map((step, idx) => {
              const stepTotal = step.rampTimeMin + step.holdTimeMin;
              return (
                <TableRow key={idx}>
                  <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                  <TableCell>
                    {readonly ? (
                      <span className="font-medium">{step.name}</span>
                    ) : (
                      <NameInputWithTemplates
                        value={step.name}
                        onValueChange={(v) => handleUpdate(idx, "name", v)}
                        onSelectTemplate={(tmpl) => handleApplyTemplate(idx, tmpl)}
                        templates={templatesWithLabels}
                      />
                    )}
                  </TableCell>
                  <TableCell>
                    {readonly ? (
                      <span>{stepTypeLabels[step.stepType] ?? step.stepType}</span>
                    ) : (
                      <Select
                        value={step.stepType}
                        onValueChange={(val) => handleUpdate(idx, "stepType", val)}
                      >
                        <SelectTrigger className="h-8 w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STEP_TYPES.map((st) => (
                            <SelectItem key={st} value={st}>
                              {stepTypeLabels[st] ?? st}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {readonly ? (
                      <span>{step.targetTemperatureC} °C</span>
                    ) : (
                      <Input
                        type="number"
                        value={step.targetTemperatureC}
                        onChange={(e) =>
                          handleUpdate(idx, "targetTemperatureC", Number(e.target.value))
                        }
                        className="h-8 w-20 text-right"
                      />
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {readonly ? (
                      <span>{step.rampTimeMin} min</span>
                    ) : (
                      <Input
                        type="number"
                        value={step.rampTimeMin}
                        onChange={(e) =>
                          handleUpdate(idx, "rampTimeMin", Number(e.target.value))
                        }
                        className="h-8 w-20 text-right"
                      />
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {readonly ? (
                      <span>{step.holdTimeMin} min</span>
                    ) : (
                      <Input
                        type="number"
                        value={step.holdTimeMin}
                        onChange={(e) =>
                          handleUpdate(idx, "holdTimeMin", Number(e.target.value))
                        }
                        className="h-8 w-20 text-right"
                      />
                    )}
                  </TableCell>
                  <TableCell className={cn("text-right tabular-nums", stepTotal > 0 && "font-medium")}>
                    {stepTotal > 0 ? `${stepTotal} min` : "—"}
                  </TableCell>
                  <TableCell>
                    {readonly ? (
                      <span className="text-muted-foreground">{step.notes ?? "—"}</span>
                    ) : (
                      <Input
                        value={step.notes ?? ""}
                        onChange={(e) =>
                          handleUpdate(idx, "notes", e.target.value || undefined)
                        }
                        className="h-8"
                      />
                    )}
                  </TableCell>
                  {!readonly && (
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          disabled={idx === 0}
                          onClick={() => handleMoveUp(idx)}
                        >
                          <ChevronUp className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          disabled={idx === steps.length - 1}
                          onClick={() => handleMoveDown(idx)}
                        >
                          <ChevronDown className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7"
                          onClick={() => handleRemove(idx)}
                        >
                          <Trash2 className="text-destructive size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              );
            })
          )}
        </TableBody>
        {steps.length > 0 && (
          <TableFooter>
            <TableRow>
              <TableCell colSpan={4} className="text-right font-semibold">
                {t("steps.totalTime")}
              </TableCell>
              <TableCell className="text-right font-semibold tabular-nums">
                {duration.rampMin} min
              </TableCell>
              <TableCell className="text-right font-semibold tabular-nums">
                {duration.holdMin} min
              </TableCell>
              <TableCell className="text-right font-bold tabular-nums">
                {duration.totalMin} min
              </TableCell>
              <TableCell colSpan={readonly ? 1 : 2} />
            </TableRow>
          </TableFooter>
        )}
      </Table>

      {!readonly && (
        <Button variant="outline" size="sm" onClick={handleAdd} className="self-start">
          <Plus className="mr-1 size-4" />
          {t("steps.add")}
        </Button>
      )}
    </div>
  );
}
