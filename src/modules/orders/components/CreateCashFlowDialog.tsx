"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Banknote } from "lucide-react";
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

import { createCashFlowFromOrder } from "@/modules/cashflows";

interface CreateCashFlowDialogProps {
  orderId: string;
  onCreated: () => void;
}

export function CreateCashFlowDialog({
  orderId,
  onCreated,
}: CreateCashFlowDialogProps): React.ReactNode {
  const t = useTranslations("orders");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleCreate(): Promise<void> {
    setLoading(true);
    try {
      const result = await createCashFlowFromOrder(orderId);
      if ("error" in result) {
        if (result.error === "ORDER_CASHFLOW_EXISTS") {
          toast.error(t("cashflowTab.alreadyExists"));
        } else {
          toast.error(t("cashflowTab.createFailed"));
        }
        return;
      }
      toast.success(t("cashflowTab.created"));
      setOpen(false);
      onCreated();
    } catch (err: unknown) {
      console.error("Failed to create cash flow from order:", err);
      toast.error(t("cashflowTab.createFailed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Banknote className="mr-1 size-4" />
          {t("actions.createCashFlow")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("cashflowTab.createTitle")}</DialogTitle>
          <DialogDescription>
            {t("cashflowTab.createDescription")}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t("actions.cancel")}
          </Button>
          <Button onClick={() => void handleCreate()} disabled={loading}>
            {loading
              ? t("cashflowTab.creating")
              : t("actions.createCashFlow")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
