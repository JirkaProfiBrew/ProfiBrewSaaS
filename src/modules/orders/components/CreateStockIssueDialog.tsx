"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Package } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

import { createStockIssueFromOrder } from "../actions";

interface CreateStockIssueDialogProps {
  orderId: string;
  onCreated: (stockIssueId: string) => void;
}

export function CreateStockIssueDialog({
  orderId,
  onCreated,
}: CreateStockIssueDialogProps): React.ReactNode {
  const t = useTranslations("orders");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleCreate(): Promise<void> {
    setLoading(true);
    try {
      const result = await createStockIssueFromOrder(orderId);
      if ("error" in result) {
        if (result.error === "NO_WAREHOUSE") {
          toast.error(t("stockIssueTab.noWarehouse"));
        } else if (result.error === "ALREADY_HAS_ISSUE") {
          toast.error(t("stockIssueTab.alreadyExists"));
        } else {
          toast.error(t("stockIssueTab.createFailed"));
        }
        return;
      }
      toast.success(t("stockIssueTab.created"));
      setOpen(false);
      onCreated(result.stockIssueId);
    } catch (err: unknown) {
      console.error("Failed to create stock issue:", err);
      toast.error(t("stockIssueTab.createFailed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Package className="mr-1 size-4" />
          {t("actions.createStockIssue")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("stockIssueTab.createTitle")}</DialogTitle>
          <DialogDescription>
            {t("stockIssueTab.createDescription")}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("actions.cancel")}
          </Button>
          <Button onClick={() => void handleCreate()} disabled={loading}>
            {loading
              ? t("stockIssueTab.creating")
              : t("actions.createStockIssue")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
