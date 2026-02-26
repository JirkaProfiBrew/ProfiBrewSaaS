"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  getItemStockByWarehouse,
  getItemRecentMovements,
  getItemAvgPricesByWarehouse,
} from "../actions";
import type { DemandBreakdownRow, WarehouseAvgPrice } from "../actions";

// ── Props ───────────────────────────────────────────────────────

interface ItemStockTabProps {
  itemId: string;
}

// ── Component ───────────────────────────────────────────────────

export function ItemStockTab({ itemId }: ItemStockTabProps): React.ReactNode {
  const t = useTranslations("items");
  const router = useRouter();

  const [stockRows, setStockRows] = useState<
    Array<{
      warehouseId: string;
      warehouseName: string;
      quantity: number;
      demandedQty: number;
      availableQty: number;
    }>
  >([]);

  const [demandBreakdown, setDemandBreakdown] = useState<DemandBreakdownRow[]>(
    []
  );

  const [avgPrices, setAvgPrices] = useState<WarehouseAvgPrice[]>([]);

  const [movements, setMovements] = useState<
    Array<{
      id: string;
      date: string;
      stockIssueId: string | null;
      movementType: string;
      quantity: string;
      unitPrice: string | null;
      warehouseId: string;
      warehouseName: string;
      stockIssueCode: string | null;
    }>
  >([]);

  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!itemId) return;

    let cancelled = false;
    setIsLoading(true);

    Promise.all([
      getItemStockByWarehouse(itemId),
      getItemRecentMovements(itemId),
      getItemAvgPricesByWarehouse(itemId),
    ])
      .then(([stockResult, mvts, avgPriceRows]) => {
        if (!cancelled) {
          setStockRows(stockResult.warehouses);
          setDemandBreakdown(stockResult.demandBreakdown);
          setMovements(mvts);
          setAvgPrices(avgPriceRows);
          setIsLoading(false);
        }
      })
      .catch((error: unknown) => {
        console.error("Failed to load stock data:", error);
        if (!cancelled) setIsLoading(false);
      });

    return (): void => {
      cancelled = true;
    };
  }, [itemId]);

  if (isLoading) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        {t("stockTab.title")}...
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Per-warehouse stock status */}
      <div>
        <h3 className="text-lg font-semibold mb-3">{t("stockTab.title")}</h3>
        {stockRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("stockTab.noStock")}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("stockTab.warehouse")}</TableHead>
                <TableHead className="text-right">
                  {t("stockTab.quantity")}
                </TableHead>
                <TableHead className="text-right">
                  {t("stockTab.demanded")}
                </TableHead>
                <TableHead className="text-right">
                  {t("stockTab.available")}
                </TableHead>
                <TableHead className="text-right">
                  {t("stockTab.avgPrice")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stockRows.map((row) => {
                const wp = avgPrices.find(
                  (a) => a.warehouseId === row.warehouseId
                );
                return (
                  <TableRow key={row.warehouseId}>
                    <TableCell>{row.warehouseName}</TableCell>
                    <TableCell className="text-right font-mono">
                      {row.quantity.toLocaleString("cs-CZ")}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {row.demandedQty.toLocaleString("cs-CZ")}
                    </TableCell>
                    <TableCell
                      className={`text-right font-mono${row.availableQty < 0 ? " text-red-600 font-semibold" : ""}`}
                    >
                      {row.availableQty.toLocaleString("cs-CZ")}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {wp ? wp.avgPrice.toFixed(2) : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Demand breakdown */}
      {demandBreakdown.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-3">
            {t("stockTab.demandBreakdown")}
          </h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("stockTab.demandSource")}</TableHead>
                <TableHead>{t("stockTab.demandCode")}</TableHead>
                <TableHead className="text-right">
                  {t("stockTab.demandRequired")}
                </TableHead>
                <TableHead className="text-right">
                  {t("stockTab.demandIssued")}
                </TableHead>
                <TableHead className="text-right">
                  {t("stockTab.demandRemaining")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {demandBreakdown.map((row, idx) => (
                <TableRow key={`${row.source}-${row.sourceId}-${idx}`}>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        row.source === "order"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-orange-100 text-orange-700"
                      }
                    >
                      {row.source === "order"
                        ? t("stockTab.sourceOrder")
                        : t("stockTab.sourceBatch")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      className="text-primary hover:underline cursor-pointer"
                      onClick={() => {
                        if (row.source === "order") {
                          router.push(`/sales/orders/${row.sourceId}`);
                        } else {
                          router.push(`/brewery/batches/${row.sourceId}`);
                        }
                      }}
                    >
                      {row.sourceCode}
                    </button>
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {row.requiredQty.toLocaleString("cs-CZ")}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {row.issuedQty.toLocaleString("cs-CZ")}
                  </TableCell>
                  <TableCell className="text-right font-mono text-red-600 font-semibold">
                    {row.remainingQty.toLocaleString("cs-CZ")}
                    {row.childDetail && (
                      <span className="block text-xs font-normal text-muted-foreground">
                        ({row.childDetail})
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Recent movements */}
      <div>
        <h3 className="text-lg font-semibold mb-3">
          {t("stockTab.recentMovements")}
        </h3>
        {movements.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("stockTab.noMovements")}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("stockTab.date")}</TableHead>
                <TableHead>{t("stockTab.document")}</TableHead>
                <TableHead>{t("stockTab.direction")}</TableHead>
                <TableHead className="text-right">
                  {t("stockTab.quantity")}
                </TableHead>
                <TableHead className="text-right">
                  {t("stockTab.price")}
                </TableHead>
                <TableHead>{t("stockTab.warehouse")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movements.map((m) => {
                const isIn = m.movementType === "in";
                const qty = Number(m.quantity);
                const isStorno = qty < 0;
                return (
                  <TableRow key={m.id}>
                    <TableCell>{m.date}</TableCell>
                    <TableCell>
                      {m.stockIssueCode ? (
                        <button
                          type="button"
                          className="text-primary hover:underline cursor-pointer"
                          onClick={() => {
                            if (m.stockIssueId) {
                              router.push(
                                `/stock/movements/${m.stockIssueId}`
                              );
                            }
                          }}
                        >
                          {m.stockIssueCode}
                        </button>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          isIn
                            ? "bg-green-100 text-green-700"
                            : "bg-red-100 text-red-700"
                        }
                      >
                        {isIn ? t("stockTab.in") : t("stockTab.out")}
                      </Badge>
                    </TableCell>
                    <TableCell
                      className={`text-right font-mono${isStorno ? " text-red-600" : ""}`}
                    >
                      {isStorno ? "- " : ""}
                      {Math.abs(qty).toLocaleString("cs-CZ")}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {m.unitPrice
                        ? Number(m.unitPrice).toLocaleString("cs-CZ")
                        : "—"}
                    </TableCell>
                    <TableCell>{m.warehouseName}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
