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
  getCancelOrderPrecheck,
} from "../actions";
import type { CancelOrderPrecheckResult } from "../actions";

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
          } else if (err === "NO_WAREHOUSE") {
            toast.error(t("messages.noWarehouse"));
          } else if (err === "STOCK_MODE_NONE") {
            toast.error(t("messages.stockModeNone"));
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
        const err = (result as { error: string }).error;
        if (err === "CASHFLOW_ALREADY_PAID") {
          toast.error(t("messages.cashflowPaid"));
        } else if (err === "ALREADY_INVOICED") {
          toast.error(t("messages.statusFailed"));
        } else {
          toast.error(t("messages.statusFailed"));
        }
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
            orderId={orderId}
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
            orderId={orderId}
            isLoading={isLoading}
            onConfirm={handleCancel}
          />
        </>
      )}

      {/* in_preparation: Ship + Cancel */}
      {currentStatus === "in_preparation" && (
        <>
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
          <CancelButton
            orderId={orderId}
            isLoading={isLoading}
            onConfirm={handleCancel}
          />
        </>
      )}

      {/* shipped: Deliver + Cancel */}
      {currentStatus === "shipped" && (
        <>
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
          <CancelButton
            orderId={orderId}
            isLoading={isLoading}
            onConfirm={handleCancel}
          />
        </>
      )}

      {/* delivered: Invoice + Cancel */}
      {currentStatus === "delivered" && (
        <>
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
          <CancelButton
            orderId={orderId}
            isLoading={isLoading}
            onConfirm={handleCancel}
          />
        </>
      )}
    </div>
  );
}

// ── Cancel Button with AlertDialog + Precheck ───────────────────

interface CancelButtonProps {
  orderId: string;
  isLoading: boolean;
  onConfirm: () => Promise<void>;
}

function CancelButton({
  orderId,
  isLoading,
  onConfirm,
}: CancelButtonProps): React.ReactNode {
  const t = useTranslations("orders");
  const [open, setOpen] = useState(false);
  const [precheck, setPrecheck] = useState<CancelOrderPrecheckResult | null>(null);
  const [precheckLoading, setPrecheckLoading] = useState(false);

  const handleOpenChange = useCallback(
    (nextOpen: boolean): void => {
      if (nextOpen) {
        setPrecheckLoading(true);
        setPrecheck(null);
        getCancelOrderPrecheck(orderId)
          .then((result) => {
            setPrecheck(result);
          })
          .catch((err: unknown) => {
            console.error("Precheck failed:", err);
            // Allow cancel anyway — precheck is informational
            setPrecheck({ canCancel: true, impacts: [] });
          })
          .finally(() => {
            setPrecheckLoading(false);
          });
      }
      setOpen(nextOpen);
    },
    [orderId]
  );

  const impacts: string[] = [];
  if (precheck) {
    for (const impact of precheck.impacts) {
      if (impact.type === "stock_issue") {
        if (impact.action === "reverse") {
          impacts.push(t("cancelDialog.willReverseStockIssue"));
        } else if (impact.action === "cancel_draft") {
          impacts.push(t("cancelDialog.willCancelDraftIssue"));
        }
      } else if (impact.type === "cashflow") {
        if (impact.action === "blocked_paid") {
          impacts.push(t("cancelDialog.blockedByCashflow"));
        } else {
          impacts.push(t("cancelDialog.willCancelCashflow"));
        }
      }
    }
  }

  const blocked = precheck !== null && !precheck.canCancel;

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
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
          <AlertDialogDescription asChild>
            <div>
              <p>{t("cancelDialog.description")}</p>
              {impacts.length > 0 && (
                <ul className="mt-2 space-y-1 text-sm">
                  {impacts.map((impact, i) => (
                    <li key={i}>• {impact}</li>
                  ))}
                </ul>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("cancelDialog.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              setOpen(false);
              void onConfirm();
            }}
            disabled={precheckLoading || blocked}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {t("cancelDialog.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
