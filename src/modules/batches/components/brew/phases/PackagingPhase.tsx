"use client";

import { useState, useEffect, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter, useParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
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

import type { Batch } from "../../../types";
import { getBatchBrewData, advanceBatchPhase } from "../../../actions";
import { BatchBottlingTab } from "../../BatchBottlingTab";

interface Props {
  batchId: string;
}

export function PackagingPhase({ batchId }: Props): React.ReactNode {
  const t = useTranslations("batches");
  const router = useRouter();
  const params = useParams();
  const locale = params.locale as string;
  const [isPending, startTransition] = useTransition();

  const [batch, setBatch] = useState<Batch | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      const brewData = await getBatchBrewData(batchId);
      if (cancelled || !brewData) return;
      setBatch(brewData.batch);
      setLoading(false);
    }
    void load();
    return (): void => {
      cancelled = true;
    };
  }, [batchId]);

  function handleMutate(): void {
    async function reload(): Promise<void> {
      const brewData = await getBatchBrewData(batchId);
      if (brewData) setBatch(brewData.batch);
    }
    void reload();
  }

  function handleComplete(): void {
    startTransition(async () => {
      try {
        await advanceBatchPhase(batchId, "completed");
        toast.success(t("brew.phaseAdvanced"));
        router.push(`/${locale}/brewery/batches/${batchId}/brew/done`);
        router.refresh();
      } catch {
        toast.error("Error");
      }
    });
  }

  const isActive = batch?.currentPhase === "packaging";

  if (loading) {
    return <div className="p-8 text-muted-foreground">Loading...</div>;
  }
  if (!batch) return null;

  return (
    <div className="space-y-6">
      {/* Existing Bottling UI */}
      <BatchBottlingTab
        batchId={batchId}
        batchNumber={batch.batchNumber}
        itemId={batch.itemId}
        actualVolumeL={batch.actualVolumeL}
        recipeBatchSizeL={batch.recipeBatchSizeL ?? null}
        onMutate={handleMutate}
      />

      {/* Complete button */}
      {isActive && (
        <div className="flex justify-end pt-4">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="lg" disabled={isPending}>
                {t("brew.completed.finishBatch")}{" "}
                <ArrowRight className="ml-2 size-4" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t("brew.completed.finishBatch")}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t("brew.completed.finishConfirm")}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel>
                <AlertDialogAction onClick={handleComplete}>
                  {t("brew.completed.finishBatch")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </div>
  );
}
