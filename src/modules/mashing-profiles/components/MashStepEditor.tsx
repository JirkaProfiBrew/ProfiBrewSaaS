"use client";

import { useTranslations } from "next-intl";
import { Plus, ChevronUp, ChevronDown, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
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

import type { MashStep, MashStepType } from "../types";

// ── Props ──────────────────────────────────────────────────────

interface MashStepEditorProps {
  steps: MashStep[];
  onChange: (steps: MashStep[]) => void;
  readonly?: boolean;
}

const STEP_TYPES: MashStepType[] = ["mash_in", "rest", "decoction", "mash_out"];

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
    decoction: t("stepType.decoction"),
    mash_out: t("stepType.mash_out"),
  };

  const handleAdd = (): void => {
    onChange([
      ...steps,
      { name: "", temperature: 0, time: 0, type: "rest" },
    ]);
  };

  const handleUpdate = (index: number, field: keyof MashStep, value: unknown): void => {
    const updated = steps.map((step, i) =>
      i === index ? { ...step, [field]: value } : step
    );
    onChange(updated);
  };

  const handleRemove = (index: number): void => {
    onChange(steps.filter((_, i) => i !== index));
  };

  const handleMoveUp = (index: number): void => {
    if (index <= 0) return;
    const updated = [...steps];
    const temp = updated[index - 1]!;
    updated[index - 1] = updated[index]!;
    updated[index] = temp;
    onChange(updated);
  };

  const handleMoveDown = (index: number): void => {
    if (index >= steps.length - 1) return;
    const updated = [...steps];
    const temp = updated[index + 1]!;
    updated[index + 1] = updated[index]!;
    updated[index] = temp;
    onChange(updated);
  };

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-lg font-semibold">{t("steps.title")}</h3>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">#</TableHead>
            <TableHead>{t("steps.name")}</TableHead>
            <TableHead>{t("steps.type")}</TableHead>
            <TableHead className="text-right">{t("steps.temperature")}</TableHead>
            <TableHead className="text-right">{t("steps.time")}</TableHead>
            <TableHead>{t("steps.notes")}</TableHead>
            {!readonly && <TableHead className="w-28" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {steps.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={readonly ? 6 : 7}
                className="text-muted-foreground text-center"
              >
                {t("steps.empty")}
              </TableCell>
            </TableRow>
          ) : (
            steps.map((step, idx) => (
              <TableRow key={idx}>
                <TableCell className="text-muted-foreground">{idx + 1}</TableCell>
                <TableCell>
                  {readonly ? (
                    <span className="font-medium">{step.name}</span>
                  ) : (
                    <Input
                      value={step.name}
                      onChange={(e) => handleUpdate(idx, "name", e.target.value)}
                      className="h-8"
                    />
                  )}
                </TableCell>
                <TableCell>
                  {readonly ? (
                    <span>{stepTypeLabels[step.type] ?? step.type}</span>
                  ) : (
                    <Select
                      value={step.type}
                      onValueChange={(val) => handleUpdate(idx, "type", val)}
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
                    <span>{step.temperature} °C</span>
                  ) : (
                    <Input
                      type="number"
                      value={step.temperature}
                      onChange={(e) =>
                        handleUpdate(idx, "temperature", Number(e.target.value))
                      }
                      className="h-8 w-20 text-right"
                    />
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {readonly ? (
                    <span>{step.time} min</span>
                  ) : (
                    <Input
                      type="number"
                      value={step.time}
                      onChange={(e) =>
                        handleUpdate(idx, "time", Number(e.target.value))
                      }
                      className="h-8 w-20 text-right"
                    />
                  )}
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
            ))
          )}
        </TableBody>
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
