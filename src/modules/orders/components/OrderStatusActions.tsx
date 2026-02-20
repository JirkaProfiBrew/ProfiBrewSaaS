"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  Check,
  Package,
  Truck,
  PackageCheck,
  FileText,
  XCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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

import {
  confirmOrder,
  startPreparation,
  shipOrder,
  deliverOrder,
  invoiceOrder,
  cancelOrder,
} from "../actions";

// ── Types ──────────────────────────────────────────────────────

interface OrderStatusActionsProps {
  orderId: string;
  currentStatus: string;
  hasItems: boolean;
  onTransition: () => void;
}

// ── Component ──────────────────────────────────────────────────

export function OrderStatusActions({
  orderId,
  currentStatus,
  hasItems,
  onTransition,
}: OrderStatusActionsProps): React.ReactNode {
  const t = useTranslations("orders");
  const [isLoading, setIsLoading] = useState(false);

  const handleTransition = useCallback(
    async (
      action: () => Promise<unknown>,
      successMessage: string
    ): Promise<void> => {
      setIsLoading(true);
      try {
        const result = await action();
        if (result && typeof result === "object" && "error" in result) {
          const err = (result as { error: string }).error;
          if (err === "NO_ITEMS") {
            toast.error(t("messages.needsItems"));
          } else {
            toast.error(t("messages.statusFailed"));
          }
        } else {
          toast.success(successMessage);
          onTransition();
        }
      } catch {
        toast.error(t("messages.statusFailed"));
      } finally {
        setIsLoading(false);
      }
    },
    [onTransition, t]
  );

  const handleCancel = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    try {
      const result = await cancelOrder(orderId);
      if (result && typeof result === "object" && "error" in result) {
        toast.error(t("messages.statusFailed"));
      } else {
        toast.success(t("messages.cancelled"));
        onTransition();
      }
    } catch {
      toast.error(t("messages.statusFailed"));
    } finally {
      setIsLoading(false);
    }
  }, [orderId, onTransition, t]);

  // Terminal states: no actions available
  if (currentStatus === "invoiced" || currentStatus === "cancelled") {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      {/* draft: Confirm + Cancel */}
      {currentStatus === "draft" && (
        <>
          <TooltipProvider delayDuration={0}>
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={!hasItems ? 0 : undefined}>
                  <Button
                    size="sm"
                    onClick={() =>
                      void handleTransition(
                        () => confirmOrder(orderId),
                        t("messages.confirmed")
                      )
                    }
                    disabled={isLoading || !hasItems}
                    className={!hasItems ? "pointer-events-none" : ""}
                  >
                    <Check className="mr-1 size-4" />
                    {t("actions.confirm")}
                  </Button>
                </span>
              </TooltipTrigger>
              {!hasItems && (
                <TooltipContent>
                  {t("messages.needsItems")}
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>

          <CancelButton
            isLoading={isLoading}
            onConfirm={handleCancel}
          />
        </>
      )}

      {/* confirmed: Start Preparation + Cancel */}
      {currentStatus === "confirmed" && (
        <>
          <Button
            size="sm"
            onClick={() =>
              void handleTransition(
                () => startPreparation(orderId),
                t("messages.preparationStarted")
              )
            }
            disabled={isLoading}
          >
            <Package className="mr-1 size-4" />
            {t("actions.startPreparation")}
          </Button>

          <CancelButton
            isLoading={isLoading}
            onConfirm={handleCancel}
          />
        </>
      )}

      {/* in_preparation: Ship */}
      {currentStatus === "in_preparation" && (
        <Button
          size="sm"
          onClick={() =>
            void handleTransition(
              () => shipOrder(orderId),
              t("messages.shipped")
            )
          }
          disabled={isLoading}
        >
          <Truck className="mr-1 size-4" />
          {t("actions.ship")}
        </Button>
      )}

      {/* shipped: Deliver */}
      {currentStatus === "shipped" && (
        <Button
          size="sm"
          onClick={() =>
            void handleTransition(
              () => deliverOrder(orderId),
              t("messages.delivered")
            )
          }
          disabled={isLoading}
        >
          <PackageCheck className="mr-1 size-4" />
          {t("actions.deliver")}
        </Button>
      )}

      {/* delivered: Invoice */}
      {currentStatus === "delivered" && (
        <Button
          size="sm"
          onClick={() =>
            void handleTransition(
              () => invoiceOrder(orderId),
              t("messages.invoiced")
            )
          }
          disabled={isLoading}
        >
          <FileText className="mr-1 size-4" />
          {t("actions.invoice")}
        </Button>
      )}
    </div>
  );
}

// ── Cancel Button with AlertDialog ─────────────────────────────

interface CancelButtonProps {
  isLoading: boolean;
  onConfirm: () => Promise<void>;
}

function CancelButton({
  isLoading,
  onConfirm,
}: CancelButtonProps): React.ReactNode {
  const t = useTranslations("orders");

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={isLoading}>
          <XCircle className="mr-1 size-4" />
          {t("actions.cancelOrder")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("cancelDialog.title")}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t("cancelDialog.description")}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("cancelDialog.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => void onConfirm()}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {t("cancelDialog.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
