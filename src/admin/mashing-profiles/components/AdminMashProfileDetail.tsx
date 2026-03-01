"use client";

import { useState, useCallback, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter, usePathname } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

import { MashStepEditor } from "@/modules/mashing-profiles/components/MashStepEditor";
import type { MashStep, MashingType } from "@/modules/mashing-profiles/types";
import { useAdminMashingProfile } from "../hooks";
import {
  adminCreateMashingProfile,
  adminUpdateMashingProfile,
  adminDeleteMashingProfile,
} from "../actions";

// ── Constants ──────────────────────────────────────────────────

const MASHING_TYPES: MashingType[] = ["infusion", "decoction", "step"];

// ── Component ──────────────────────────────────────────────────

interface AdminMashProfileDetailProps {
  id: string;
}

export function AdminMashProfileDetail({
  id,
}: AdminMashProfileDetailProps): React.ReactNode {
  const t = useTranslations("mashingProfiles");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const pathname = usePathname();

  const isNew = id === "new";
  const { data: profile, isLoading } = useAdminMashingProfile(id);

  const backHref = pathname.replace(/\/mashing-profiles\/.*$/, "/mashing-profiles");

  // Form state
  const [name, setName] = useState("");
  const [mashingType, setMashingType] = useState<MashingType | "">("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [steps, setSteps] = useState<MashStep[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Initialize form from loaded profile
  useEffect(() => {
    if (profile) {
      setName(profile.name);
      setMashingType(profile.mashingType ?? "");
      setDescription(profile.description ?? "");
      setNotes(profile.notes ?? "");
      setSteps(profile.steps);
    }
  }, [profile]);

  const handleSave = useCallback(async (): Promise<void> => {
    if (!name.trim()) {
      toast.error(tCommon("validation.required"));
      return;
    }
    if (steps.length === 0) {
      toast.error(t("steps.empty"));
      return;
    }

    setIsSubmitting(true);
    try {
      const data = {
        name,
        mashingType: mashingType || null,
        description: description || null,
        steps,
        notes: notes || null,
      };

      if (isNew) {
        await adminCreateMashingProfile(data);
      } else {
        await adminUpdateMashingProfile(id, data);
      }

      toast.success(tCommon("saved"));
      router.push(backHref);
    } catch (error: unknown) {
      console.error("Failed to save system mashing profile:", error);
      toast.error(tCommon("saveFailed"));
    } finally {
      setIsSubmitting(false);
    }
  }, [name, mashingType, description, steps, notes, isNew, id, tCommon, t, router, backHref]);

  const handleDelete = useCallback(async (): Promise<void> => {
    setIsSubmitting(true);
    try {
      await adminDeleteMashingProfile(id);
      toast.success(tCommon("deleted"));
      router.push(backHref);
    } catch (error: unknown) {
      console.error("Failed to delete system mashing profile:", error);
      toast.error(tCommon("deleteFailed"));
    } finally {
      setIsSubmitting(false);
    }
  }, [id, tCommon, router, backHref]);

  if (isLoading && !isNew) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <div className="text-muted-foreground">{tCommon("loading")}</div>
      </div>
    );
  }

  if (!isNew && !profile) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <div className="text-muted-foreground">{tCommon("noResults")}</div>
      </div>
    );
  }

  const mashingTypeLabels: Record<string, string> = {
    infusion: t("mashingType.infusion"),
    decoction: t("mashingType.decoction"),
    step: t("mashingType.step"),
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">
          {isNew ? t("detail.newTitle") : profile?.name ?? t("detail.title")}
        </h1>
        <div className="flex items-center gap-2">
          {!isNew && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" disabled={isSubmitting}>
                  <Trash2 className="mr-1 size-4" />
                  {t("detail.actions.delete")}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {tCommon("confirmDelete")}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {tCommon("confirmDeleteDescription")}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => void handleDelete()}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {tCommon("delete")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(backHref)}
          >
            {t("detail.actions.cancel")}
          </Button>
          <Button
            size="sm"
            onClick={() => void handleSave()}
            disabled={isSubmitting}
          >
            {t("detail.actions.save")}
          </Button>
        </div>
      </div>

      {/* Form */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium">
            {t("detail.fields.name")}
          </label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium">
            {t("detail.fields.mashingType")}
          </label>
          <Select
            value={mashingType}
            onValueChange={(val) => setMashingType(val as MashingType)}
          >
            <SelectTrigger>
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              {MASHING_TYPES.map((mt) => (
                <SelectItem key={mt} value={mt}>
                  {mashingTypeLabels[mt] ?? mt}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <label className="text-sm font-medium">
            {t("detail.fields.description")}
          </label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
        </div>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <label className="text-sm font-medium">
            {t("detail.fields.notes")}
          </label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
          />
        </div>
      </div>

      {/* Steps editor */}
      <MashStepEditor steps={steps} onChange={setSteps} />
    </div>
  );
}
