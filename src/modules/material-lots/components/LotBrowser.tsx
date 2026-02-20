"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Package } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { getTrackingLots } from "../actions";
import type { TrackingLot, TrackingFilter } from "../types";
import type { TrackingLotStatus } from "@/modules/stock-issues/types";

// Helper
const STATUS_COLORS: Record<TrackingLotStatus, string> = {
  in_stock: "bg-green-100 text-green-700",
  partial: "bg-yellow-100 text-yellow-700",
  issued: "bg-gray-100 text-gray-500",
  expired: "bg-red-100 text-red-700",
};

export function LotBrowser(): React.ReactNode {
  const t = useTranslations("tracking");
  const router = useRouter();

  const [lots, setLots] = useState<TrackingLot[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const fetchLots = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const filterArg: TrackingFilter = {
        search: search || undefined,
        status:
          statusFilter !== "all"
            ? (statusFilter as TrackingLotStatus)
            : undefined,
      };
      const data = await getTrackingLots(filterArg);
      setLots(data);
    } catch {
      // silent -- lot browser is readonly
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search]);

  useEffect(() => {
    void fetchLots();
  }, [fetchLots]);

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">
          <Package className="mr-2 inline size-6" />
          {t("title")}
        </h1>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="w-64"
          placeholder={t("search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("filters.all")}</SelectItem>
            <SelectItem value="in_stock">
              {t("filters.inStock")}
            </SelectItem>
            <SelectItem value="partial">
              {t("filters.partial")}
            </SelectItem>
            <SelectItem value="issued">{t("filters.issued")}</SelectItem>
            <SelectItem value="expired">
              {t("filters.expired")}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {loading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {t("loading")}
        </p>
      ) : lots.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          {t("noLots")}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("columns.receiptCode")}</TableHead>
                <TableHead>{t("columns.date")}</TableHead>
                <TableHead>{t("columns.item")}</TableHead>
                <TableHead>{t("columns.supplier")}</TableHead>
                <TableHead>{t("columns.lotNumber")}</TableHead>
                <TableHead>{t("columns.expiry")}</TableHead>
                <TableHead className="text-right">
                  {t("columns.remaining")}
                </TableHead>
                <TableHead className="text-right">
                  {t("columns.unitPrice")}
                </TableHead>
                <TableHead>{t("columns.status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lots.map((lot) => (
                <TableRow
                  key={lot.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() =>
                    router.push(`/stock/tracking/${lot.id}`)
                  }
                >
                  <TableCell className="font-medium">
                    {lot.receiptCode}
                  </TableCell>
                  <TableCell>{lot.receiptDate}</TableCell>
                  <TableCell>
                    <span className="mr-1 text-xs text-muted-foreground">
                      {lot.itemCode}
                    </span>
                    {lot.itemName}
                  </TableCell>
                  <TableCell>
                    {lot.supplierName ?? "\u2014"}
                  </TableCell>
                  <TableCell>
                    {lot.lotNumber ?? "\u2014"}
                  </TableCell>
                  <TableCell>
                    {lot.expiryDate ?? "\u2014"}
                  </TableCell>
                  <TableCell className="text-right">
                    {lot.remainingQty}
                    {lot.unitSymbol ? ` ${lot.unitSymbol}` : ""}
                  </TableCell>
                  <TableCell className="text-right">
                    {lot.unitPrice
                      ? `${Number(lot.unitPrice).toLocaleString("cs-CZ", { minimumFractionDigits: 2 })} K\u010d`
                      : "\u2014"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={STATUS_COLORS[lot.status]}
                    >
                      {t(`status.${lot.status}`)}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
