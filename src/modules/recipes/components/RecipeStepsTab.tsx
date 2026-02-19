"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Trash2, ChevronUp, ChevronDown, Plus, Download, Pencil } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { RecipeStep } from "../types";
import { useMashingProfiles } from "../hooks";
import {
  addRecipeStep,
  updateRecipeStep,
  removeRecipeStep,
  reorderRecipeSteps,
  applyMashProfile,
} from "../actions";

// ── Props ──────────────────────────────────────────────────────

interface RecipeStepsTabProps {
  recipeId: string;
  steps: RecipeStep[];
  onMutate: () => void;
}

// ── Constants ──────────────────────────────────────────────────

const STEP_TYPES = [
  "mash_in",
  "rest",
  "decoction",
  "mash_out",
  "boil",
  "whirlpool",
  "cooling",
] as const;

// ── Component ──────────────────────────────────────────────────

export function RecipeStepsTab({
  recipeId,
  steps,
  onMutate,
}: RecipeStepsTabProps): React.ReactNode {
  const t = useTranslations("recipes");
  const tCommon = useTranslations("common");

  const { data: mashProfiles } = useMashingProfiles();

  const [stepDialogOpen, setStepDialogOpen] = useState(false);
  const [stepDialogMode, setStepDialogMode] = useState<"add" | "edit">("add");
  const [editingStepId, setEditingStepId] = useState<string | null>(null);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Step form state (shared for add/edit)
  const [newStepType, setNewStepType] = useState<string>("rest");
  const [newName, setNewName] = useState("");
  const [newTemperatureC, setNewTemperatureC] = useState("");
  const [newTimeMin, setNewTimeMin] = useState("");
  const [newRampTimeMin, setNewRampTimeMin] = useState("");
  const [newStepNotes, setNewStepNotes] = useState("");

  // Mash profile selection
  const [selectedProfileId, setSelectedProfileId] = useState("");

  const resetForm = useCallback((): void => {
    setNewStepType("rest");
    setNewName("");
    setNewTemperatureC("");
    setNewTimeMin("");
    setNewRampTimeMin("");
    setNewStepNotes("");
    setEditingStepId(null);
    setStepDialogMode("add");
  }, []);

  // Open add dialog
  const openAddDialog = useCallback((): void => {
    resetForm();
    setStepDialogMode("add");
    setStepDialogOpen(true);
  }, [resetForm]);

  // Open edit dialog with pre-populated values
  const openEditDialog = useCallback(
    (step: RecipeStep): void => {
      setStepDialogMode("edit");
      setEditingStepId(step.id);
      setNewStepType(step.stepType);
      setNewName(step.name);
      setNewTemperatureC(step.temperatureC ?? "");
      setNewTimeMin(step.timeMin != null ? String(step.timeMin) : "");
      setNewRampTimeMin(step.rampTimeMin != null ? String(step.rampTimeMin) : "");
      setNewStepNotes(step.notes ?? "");
      setStepDialogOpen(true);
    },
    []
  );

  const handleAddStep = useCallback(async (): Promise<void> => {
    if (!newName.trim()) {
      toast.error(tCommon("validation.required"));
      return;
    }

    setIsSubmitting(true);
    try {
      await addRecipeStep(recipeId, {
        stepType: newStepType,
        name: newName,
        temperatureC: newTemperatureC || null,
        timeMin: newTimeMin ? Number(newTimeMin) : null,
        rampTimeMin: newRampTimeMin ? Number(newRampTimeMin) : null,
        notes: newStepNotes || null,
      });
      toast.success(tCommon("saved"));
      resetForm();
      setStepDialogOpen(false);
      onMutate();
    } catch (error: unknown) {
      console.error("Failed to add recipe step:", error);
      toast.error(tCommon("saveFailed"));
    } finally {
      setIsSubmitting(false);
    }
  }, [
    recipeId,
    newStepType,
    newName,
    newTemperatureC,
    newTimeMin,
    newRampTimeMin,
    newStepNotes,
    tCommon,
    resetForm,
    onMutate,
  ]);

  const handleEditSave = useCallback(async (): Promise<void> => {
    if (!editingStepId || !newName.trim()) {
      toast.error(tCommon("validation.required"));
      return;
    }

    setIsSubmitting(true);
    try {
      await updateRecipeStep(editingStepId, {
        stepType: newStepType,
        name: newName,
        temperatureC: newTemperatureC || null,
        timeMin: newTimeMin ? Number(newTimeMin) : null,
        rampTimeMin: newRampTimeMin ? Number(newRampTimeMin) : null,
        notes: newStepNotes || null,
      });
      toast.success(tCommon("saved"));
      resetForm();
      setStepDialogOpen(false);
      onMutate();
    } catch (error: unknown) {
      console.error("Failed to update recipe step:", error);
      toast.error(tCommon("saveFailed"));
    } finally {
      setIsSubmitting(false);
    }
  }, [
    editingStepId,
    newStepType,
    newName,
    newTemperatureC,
    newTimeMin,
    newRampTimeMin,
    newStepNotes,
    tCommon,
    resetForm,
    onMutate,
  ]);

  const handleDialogSave = useCallback((): void => {
    if (stepDialogMode === "edit") {
      void handleEditSave();
    } else {
      void handleAddStep();
    }
  }, [stepDialogMode, handleEditSave, handleAddStep]);

  const handleRemoveStep = useCallback(
    async (stepId: string): Promise<void> => {
      try {
        await removeRecipeStep(stepId);
        toast.success(tCommon("saved"));
        onMutate();
      } catch (error: unknown) {
        console.error("Failed to remove recipe step:", error);
        toast.error(tCommon("saveFailed"));
      }
    },
    [tCommon, onMutate]
  );

  const handleMoveUp = useCallback(
    async (index: number): Promise<void> => {
      if (index <= 0) return;
      const newOrder = [...steps.map((s) => s.id)];
      const id = newOrder[index];
      const prevId = newOrder[index - 1];
      if (!id || !prevId) return;
      newOrder[index] = prevId;
      newOrder[index - 1] = id;
      try {
        await reorderRecipeSteps(recipeId, newOrder);
        onMutate();
      } catch (error: unknown) {
        console.error("Failed to reorder steps:", error);
      }
    },
    [steps, recipeId, onMutate]
  );

  const handleMoveDown = useCallback(
    async (index: number): Promise<void> => {
      if (index >= steps.length - 1) return;
      const newOrder = [...steps.map((s) => s.id)];
      const id = newOrder[index];
      const nextId = newOrder[index + 1];
      if (!id || !nextId) return;
      newOrder[index] = nextId;
      newOrder[index + 1] = id;
      try {
        await reorderRecipeSteps(recipeId, newOrder);
        onMutate();
      } catch (error: unknown) {
        console.error("Failed to reorder steps:", error);
      }
    },
    [steps, recipeId, onMutate]
  );

  const handleApplyProfile = useCallback(async (): Promise<void> => {
    if (!selectedProfileId) {
      toast.error(tCommon("validation.required"));
      return;
    }

    setIsSubmitting(true);
    try {
      await applyMashProfile(recipeId, selectedProfileId);
      toast.success(tCommon("saved"));
      setProfileDialogOpen(false);
      setSelectedProfileId("");
      onMutate();
    } catch (error: unknown) {
      console.error("Failed to apply mash profile:", error);
      toast.error(tCommon("saveFailed"));
    } finally {
      setIsSubmitting(false);
    }
  }, [recipeId, selectedProfileId, tCommon, onMutate]);

  // Step type label map
  const stepTypeLabels: Record<string, string> = {
    mash_in: t("steps.stepTypes.mash_in"),
    rest: t("steps.stepTypes.rest"),
    decoction: t("steps.stepTypes.decoction"),
    mash_out: t("steps.stepTypes.mash_out"),
    boil: t("steps.stepTypes.boil"),
    whirlpool: t("steps.stepTypes.whirlpool"),
    cooling: t("steps.stepTypes.cooling"),
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{t("tabs.steps")}</h3>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setProfileDialogOpen(true)}
          >
            <Download className="mr-1 size-4" />
            {t("steps.loadProfile")}
          </Button>
          <Button size="sm" onClick={openAddDialog}>
            <Plus className="mr-1 size-4" />
            {t("steps.add")}
          </Button>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">#</TableHead>
            <TableHead>{t("steps.dialog.selectType")}</TableHead>
            <TableHead>{t("steps.name")}</TableHead>
            <TableHead className="text-right">
              {t("steps.temperature")}
            </TableHead>
            <TableHead className="text-right">
              {t("steps.time")}
            </TableHead>
            <TableHead className="text-right">
              {t("steps.rampTime")}
            </TableHead>
            <TableHead>{t("steps.notes")}</TableHead>
            <TableHead className="w-28" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {steps.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-muted-foreground">
                {t("steps.empty")}
              </TableCell>
            </TableRow>
          ) : (
            steps.map((step, idx) => (
              <TableRow key={step.id}>
                <TableCell className="text-muted-foreground">
                  {idx + 1}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">
                    {stepTypeLabels[step.stepType] ?? step.stepType}
                  </Badge>
                </TableCell>
                <TableCell className="font-medium">{step.name}</TableCell>
                <TableCell className="text-right">
                  {step.temperatureC != null ? `${step.temperatureC} °C` : "—"}
                </TableCell>
                <TableCell className="text-right">
                  {step.timeMin != null ? `${step.timeMin} min` : "—"}
                </TableCell>
                <TableCell className="text-right">
                  {step.rampTimeMin != null ? `${step.rampTimeMin} min` : "—"}
                </TableCell>
                <TableCell className="max-w-[200px] truncate text-muted-foreground">
                  {step.notes ?? "—"}
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openEditDialog(step)}
                      title={t("steps.dialog.editTitle")}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={idx === 0}
                      onClick={() => {
                        void handleMoveUp(idx);
                      }}
                    >
                      <ChevronUp className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={idx === steps.length - 1}
                      onClick={() => {
                        void handleMoveDown(idx);
                      }}
                    >
                      <ChevronDown className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        void handleRemoveStep(step.id);
                      }}
                    >
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {/* Add / Edit Step Dialog */}
      <Dialog
        open={stepDialogOpen}
        onOpenChange={(open) => {
          if (!open) resetForm();
          setStepDialogOpen(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {stepDialogMode === "edit"
                ? t("steps.dialog.editTitle")
                : t("steps.dialog.title")}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            {/* Step Type */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">
                {t("steps.dialog.selectType")}
              </label>
              <Select value={newStepType} onValueChange={setNewStepType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STEP_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {stepTypeLabels[type] ?? type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Name */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">
                {t("steps.name")}
              </label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t("steps.name")}
              />
            </div>

            {/* Temperature */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">
                {t("steps.temperature")}
              </label>
              <Input
                type="number"
                value={newTemperatureC}
                onChange={(e) => setNewTemperatureC(e.target.value)}
                placeholder="°C"
              />
            </div>

            {/* Time */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">
                {t("steps.time")}
              </label>
              <Input
                type="number"
                value={newTimeMin}
                onChange={(e) => setNewTimeMin(e.target.value)}
                placeholder="min"
              />
            </div>

            {/* Ramp Time */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">
                {t("steps.rampTime")}
              </label>
              <Input
                type="number"
                value={newRampTimeMin}
                onChange={(e) => setNewRampTimeMin(e.target.value)}
                placeholder="min"
              />
            </div>

            {/* Notes */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">
                {t("steps.notes")}
              </label>
              <Input
                value={newStepNotes}
                onChange={(e) => setNewStepNotes(e.target.value)}
                placeholder={t("steps.notes")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                resetForm();
                setStepDialogOpen(false);
              }}
            >
              {tCommon("cancel")}
            </Button>
            <Button onClick={handleDialogSave} disabled={isSubmitting}>
              {tCommon("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Load Mash Profile Dialog */}
      <Dialog open={profileDialogOpen} onOpenChange={setProfileDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("steps.loadProfile")}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-4">
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium">
                {t("steps.dialog.selectProfile")}
              </label>
              <Select
                value={selectedProfileId}
                onValueChange={setSelectedProfileId}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("steps.dialog.selectProfile")} />
                </SelectTrigger>
                <SelectContent>
                  {mashProfiles.map((profile) => (
                    <SelectItem key={profile.id} value={profile.id}>
                      {profile.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-sm text-muted-foreground">
              {t("steps.loadProfileWarning")}
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setSelectedProfileId("");
                setProfileDialogOpen(false);
              }}
            >
              {tCommon("cancel")}
            </Button>
            <Button
              onClick={() => void handleApplyProfile()}
              disabled={isSubmitting || !selectedProfileId}
            >
              {t("steps.applyProfile")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
