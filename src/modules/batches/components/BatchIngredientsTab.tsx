"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Package, ExternalLink, Beaker } from "lucide-react";
import { toast } from "sonner";

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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { getBatchIngredients, getProductionIssues, createProductionIssue, directProductionIssue, confirmDirectProductionIssue } from "../actions";
import type { BatchIngredientRow, ProductionIssueInfo } from "../types";

// ── Category color mapping ────────────────────────────────────

const CATEGORY_CLASS_MAP: Record<string, string> = {
  malt: "bg-amber-100 text-amber-800 border-amber-300",
  hop: "bg-green-100 text-green-800 border-green-300",
  yeast: "bg-yellow-100 text-yellow-800 border-yellow-300",
  adjunct: "bg-purple-100 text-purple-800 border-purple-300",
  other: "bg-gray-100 text-gray-800 border-gray-300",
};

const STATUS_CLASS_MAP: Record<string, string> = {
  draft: "bg-gray-100 text-gray-800 border-gray-300",
  confirmed: "bg-green-100 text-green-800 border-green-300",
  cancelled: "bg-red-100 text-red-800 border-red-300",
};

/** Format amount as a number. */
function formatAmount(amount: string): string {
  const val = parseFloat(amount);
  if (isNaN(val)) return amount;
  return val.toLocaleString("cs-CZ", { maximumFractionDigits: 2 });
}

// ── Component ──────────────────────────────────────────────────

interface BatchIngredientsTabProps {
  batchId: string;
  recipeId: string | null;
  batchNumber: string;
}

export function BatchIngredientsTab({
  batchId,
  recipeId,
  batchNumber,
}: BatchIngredientsTabProps): React.ReactNode {
  const t = useTranslations("batches");
  const router = useRouter();
  const [ingredients, setIngredients] = useState<BatchIngredientRow[]>([]);
  const [linkedIssues, setLinkedIssues] = useState<ProductionIssueInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [warningsOpen, setWarningsOpen] = useState(false);
  const [pendingIssueId, setPendingIssueId] = useState<string>("");
  const [warnings, setWarnings] = useState<Array<{ itemName: string; unit: string; requested: number; available: number; willIssue: number; missing: number }>>([]);

  const loadData = useCallback((): void => {
    if (!batchId) return;

    setIsLoading(true);

    Promise.all([
      getBatchIngredients(batchId),
      getProductionIssues(batchId),
    ])
      .then(([ingredientRows, issues]) => {
        setIngredients(ingredientRows);
        setLinkedIssues(issues);
        setIsLoading(false);
      })
      .catch((error: unknown) => {
        console.error("Failed to load batch ingredients:", error);
        setIsLoading(false);
      });
  }, [batchId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreateProductionIssue = useCallback(async (): Promise<void> => {
    setIsCreating(true);
    try {
      const result = await createProductionIssue(batchId);
      if ("error" in result) {
        toast.error(t("ingredients.actions.issueFailed"));
        return;
      }
      toast.success(t("ingredients.actions.issueSuccess"));
      router.push(`/stock/movements/${result.stockIssueId}`);
    } catch (error: unknown) {
      console.error("Failed to create production issue:", error);
      toast.error(t("ingredients.actions.issueFailed"));
    } finally {
      setIsCreating(false);
    }
  }, [batchId, t, router]);

  const handleDirectIssue = useCallback(async (): Promise<void> => {
    setIsCreating(true);
    try {
      const result = await directProductionIssue(batchId);
      if ("error" in result) {
        toast.error(t("ingredients.actions.directIssueFailed"));
        return;
      }
      if ("warnings" in result && result.warnings.length > 0) {
        // Stock insufficient — show warnings dialog, let user decide
        setPendingIssueId(result.stockIssueId);
        setWarnings(result.warnings);
        setWarningsOpen(true);
        return;
      }
      toast.success(t("ingredients.actions.directIssueSuccess"));
      loadData();
    } catch (error: unknown) {
      console.error("Failed to direct issue:", error);
      toast.error(t("ingredients.actions.directIssueFailed"));
    } finally {
      setIsCreating(false);
    }
  }, [batchId, t, loadData]);

  const handleWarningsConfirm = useCallback(async (): Promise<void> => {
    setWarningsOpen(false);
    setIsCreating(true);
    try {
      const result = await confirmDirectProductionIssue(pendingIssueId);
      if ("error" in result) {
        toast.error(t("ingredients.actions.directIssueFailed"));
        return;
      }
      toast.success(t("ingredients.actions.directIssueSuccess"));
      loadData();
    } catch (error: unknown) {
      console.error("Failed to confirm direct issue:", error);
      toast.error(t("ingredients.actions.directIssueFailed"));
    } finally {
      setIsCreating(false);
      setPendingIssueId("");
      setWarnings([]);
    }
  }, [pendingIssueId, t, loadData]);

  const handleWarningsCancel = useCallback((): void => {
    setWarningsOpen(false);
    setPendingIssueId("");
    setWarnings([]);
    setIsCreating(false);
  }, []);

  // Show "Originál" column only when at least one ingredient has original qty
  const hasOriginal = ingredients.some((i) => i.originalQty != null);

  if (!recipeId) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        {t("ingredients.noRecipe")}
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        {t("ingredients.loading")}
      </div>
    );
  }

  if (ingredients.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        {t("ingredients.empty")}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Action buttons */}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => { void handleCreateProductionIssue(); }}
          disabled={isCreating}
        >
          <Package className="h-4 w-4 mr-2" />
          {t("ingredients.actions.prepareIssue")}
        </Button>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="default"
              size="sm"
              disabled={isCreating}
            >
              <Beaker className="h-4 w-4 mr-2" />
              {t("ingredients.actions.directIssue")}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("ingredients.actions.directIssue")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("ingredients.actions.confirmDirectIssue", { batchNumber })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("ingredients.actions.cancel")}</AlertDialogCancel>
              <AlertDialogAction onClick={() => { void handleDirectIssue(); }}>
                {t("ingredients.actions.confirm")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Ingredients table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("ingredients.columns.name")}</TableHead>
            <TableHead>{t("ingredients.columns.category")}</TableHead>
            {hasOriginal && (
              <TableHead className="text-right">{t("ingredients.columns.original")}</TableHead>
            )}
            <TableHead className="text-right">{t("ingredients.columns.recipeQty")}</TableHead>
            <TableHead>{t("ingredients.columns.unit")}</TableHead>
            <TableHead className="text-right">{t("ingredients.columns.issued")}</TableHead>
            <TableHead className="text-right">{t("ingredients.columns.missing")}</TableHead>
            <TableHead>{t("ingredients.columns.lots")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ingredients.map((item) => {
            const categoryClass =
              CATEGORY_CLASS_MAP[item.category] ?? CATEGORY_CLASS_MAP.other;
            const missingVal = parseFloat(item.missingQty);
            const originalDiffers = item.originalQty != null
              && parseFloat(item.originalQty) !== parseFloat(item.recipeQty);
            return (
              <TableRow key={item.recipeItemId}>
                <TableCell className="font-medium">
                  {item.itemName}
                  {item.itemCode && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      ({item.itemCode})
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={categoryClass}>
                    {t(`ingredients.category.${item.category}` as Parameters<typeof t>[0])}
                  </Badge>
                </TableCell>
                {hasOriginal && (
                  <TableCell className="text-right text-muted-foreground">
                    {item.originalQty != null ? formatAmount(item.originalQty) : "\u2014"}
                  </TableCell>
                )}
                <TableCell className={originalDiffers ? "text-right font-semibold" : "text-right"}>
                  {formatAmount(item.recipeQty)}
                </TableCell>
                <TableCell>{item.unitSymbol ?? "g"}</TableCell>
                <TableCell className="text-right">{formatAmount(item.issuedQty)}</TableCell>
                <TableCell className={missingVal > 0 ? "text-right text-red-600 font-medium" : "text-right"}>
                  {missingVal > 0 ? formatAmount(item.missingQty) : "-"}
                </TableCell>
                <TableCell className="text-xs">
                  {item.lots.length > 0 ? (
                    <div className="flex flex-col gap-0.5">
                      {item.lots.map((lot, idx) => (
                        <span key={idx}>
                          <Link
                            href={`/stock/tracking/${lot.receiptLineId}`}
                            className="text-primary hover:underline"
                          >
                            {lot.lotNumber ?? "\u2014"}
                          </Link>
                          {" "}({lot.quantity.toLocaleString("cs-CZ", { maximumFractionDigits: 2 })})
                        </span>
                      ))}
                    </div>
                  ) : (
                    "\u2014"
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {/* Linked production issues */}
      <div className="flex flex-col gap-2">
        <h4 className="text-sm font-medium">{t("ingredients.linkedIssues")}</h4>
        {linkedIssues.filter((i) => i.status !== "cancelled").length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("ingredients.noLinkedIssues")}</p>
        ) : (
          <div className="flex flex-col gap-1">
            {linkedIssues
              .filter((issue) => issue.status !== "cancelled")
              .map((issue) => {
              const statusClass = STATUS_CLASS_MAP[issue.status] ?? STATUS_CLASS_MAP.draft;
              return (
                <div key={issue.id} className="flex items-center gap-3 text-sm">
                  <Link
                    href={`/stock/movements/${issue.id}`}
                    className="text-primary underline hover:no-underline flex items-center gap-1"
                  >
                    {issue.code}
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                  <Badge variant="outline" className={statusClass}>
                    {t(`ingredients.issueStatus.${issue.status}` as Parameters<typeof t>[0])}
                  </Badge>
                  <span className="text-muted-foreground">{issue.date}</span>
                  <span className="text-muted-foreground">({t(`ingredients.purpose.${issue.movementPurpose}` as Parameters<typeof t>[0])})</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Stock warnings dialog for direct issue */}
      <AlertDialog open={warningsOpen} onOpenChange={setWarningsOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("ingredients.actions.stockWarningTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("ingredients.actions.stockWarningDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="my-2 space-y-1 text-sm">
            {warnings.map((w, idx) => (
              <div key={idx} className="flex justify-between text-red-600">
                <span className="font-medium">{w.itemName}</span>
                <span>
                  {t("ingredients.actions.warningRequested")} {w.requested.toLocaleString("cs-CZ")} {w.unit},
                  {" "}{t("ingredients.actions.warningAvailable")} {w.available.toLocaleString("cs-CZ")} {w.unit},
                  {" "}{t("ingredients.actions.warningMissing")} {w.missing.toLocaleString("cs-CZ")} {w.unit}
                </span>
              </div>
            ))}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleWarningsCancel}>
              {t("ingredients.actions.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => { void handleWarningsConfirm(); }}>
              {t("ingredients.actions.confirmPartialIssue")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
