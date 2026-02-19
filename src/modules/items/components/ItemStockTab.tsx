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

import { getItemStockByWarehouse, getItemRecentMovements } from "../actions";

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
      reservedQty: number;
      availableQty: number;
    }>
  >([]);

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
    ])
      .then(([stock, mvts]) => {
        if (!cancelled) {
          setStockRows(stock);
          setMovements(mvts);
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
    return <p className="text-sm text-muted-foreground py-4">{t("stockTab.title")}...</p>;
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Per-warehouse stock status */}
      <div>
        <h3 className="text-lg font-semibold mb-3">{t("stockTab.title")}</h3>
        {stockRows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("stockTab.noStock")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("stockTab.warehouse")}</TableHead>
                <TableHead className="text-right">{t("stockTab.quantity")}</TableHead>
                <TableHead className="text-right">{t("stockTab.reserved")}</TableHead>
                <TableHead className="text-right">{t("stockTab.available")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stockRows.map((row) => (
                <TableRow key={row.warehouseId}>
                  <TableCell>{row.warehouseName}</TableCell>
                  <TableCell className="text-right font-mono">
                    {row.quantity.toLocaleString("cs-CZ")}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {row.reservedQty.toLocaleString("cs-CZ")}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {row.availableQty.toLocaleString("cs-CZ")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Recent movements */}
      <div>
        <h3 className="text-lg font-semibold mb-3">{t("stockTab.recentMovements")}</h3>
        {movements.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("stockTab.noMovements")}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("stockTab.date")}</TableHead>
                <TableHead>{t("stockTab.document")}</TableHead>
                <TableHead>{t("stockTab.direction")}</TableHead>
                <TableHead className="text-right">{t("stockTab.quantity")}</TableHead>
                <TableHead className="text-right">{t("stockTab.price")}</TableHead>
                <TableHead>{t("stockTab.warehouse")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movements.map((m) => {
                const isIn = m.movementType === "in";
                const qty = Number(m.quantity);
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
                              router.push(`/stock/movements/${m.stockIssueId}`);
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
                    <TableCell className="text-right font-mono">
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
