"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { getTrackingLot } from "../actions";
import type { TrackingLotDetail } from "../types";
import type { TrackingLotStatus } from "@/modules/stock-issues/types";

const STATUS_COLORS: Record<TrackingLotStatus, string> = {
  in_stock: "bg-green-100 text-green-700",
  partial: "bg-yellow-100 text-yellow-700",
  issued: "bg-gray-100 text-gray-500",
  expired: "bg-red-100 text-red-700",
};

interface LotDetailProps {
  id: string;
}

export function LotDetail({ id }: LotDetailProps): React.ReactNode {
  const t = useTranslations("tracking");
  const router = useRouter();

  const [lot, setLot] = useState<TrackingLotDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load(): Promise<void> {
      setLoading(true);
      try {
        const data = await getTrackingLot(id);
        setLot(data);
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [id]);

  if (loading) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {t("loading")}
      </p>
    );
  }

  if (!lot) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {t("notFound")}
      </p>
    );
  }

  const attrs = lot.lotAttributes;

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="size-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {lot.receiptCode} — {lot.itemName}
          </h1>
          <p className="text-sm text-muted-foreground">
            {lot.receiptDate} · {lot.warehouseName}
            {lot.supplierName ? ` · ${lot.supplierName}` : ""}
          </p>
        </div>
        <Badge variant="secondary" className={STATUS_COLORS[lot.status]}>
          {t(`status.${lot.status}`)}
        </Badge>
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <InfoField
          label={t("detail.lotNumber")}
          value={lot.lotNumber ?? "\u2014"}
        />
        <InfoField
          label={t("detail.expiry")}
          value={lot.expiryDate ?? "\u2014"}
        />
        <InfoField
          label={t("detail.receivedQty")}
          value={`${lot.issuedQty}${lot.unitSymbol ? ` ${lot.unitSymbol}` : ""}`}
        />
        <InfoField
          label={t("detail.remainingQty")}
          value={`${lot.remainingQty}${lot.unitSymbol ? ` ${lot.unitSymbol}` : ""}`}
        />
        <InfoField
          label={t("detail.unitPrice")}
          value={
            lot.unitPrice
              ? `${Number(lot.unitPrice).toLocaleString("cs-CZ", { minimumFractionDigits: 2 })} K\u010d`
              : "\u2014"
          }
        />
      </div>

      {/* Lot attributes (if brew material) */}
      {Object.keys(attrs).length > 0 && (
        <div>
          <h2 className="mb-2 text-lg font-semibold">
            {t("detail.lotAttributes")}
          </h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {Object.entries(attrs).map(([key, val]) => (
              <InfoField
                key={key}
                label={t(
                  `detail.attr.${key}` as Parameters<typeof t>[0]
                )}
                value={String(val ?? "\u2014")}
              />
            ))}
          </div>
        </div>
      )}

      {/* Allocation history */}
      <div>
        <h2 className="mb-2 text-lg font-semibold">
          {t("detail.allocations")}
        </h2>
        {lot.allocations.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            {t("detail.noAllocations")}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("detail.issueCode")}</TableHead>
                  <TableHead>{t("detail.issueDate")}</TableHead>
                  <TableHead>{t("detail.purpose")}</TableHead>
                  <TableHead>{t("detail.batch")}</TableHead>
                  <TableHead className="text-right">
                    {t("detail.issuedQty")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t("detail.allocUnitPrice")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lot.allocations.map((alloc) => (
                  <TableRow key={alloc.id}>
                    <TableCell className="font-medium">
                      {alloc.issueCode}
                    </TableCell>
                    <TableCell>{alloc.issueDate}</TableCell>
                    <TableCell>
                      {alloc.movementPurpose
                        ? t(
                            `detail.purposeLabel.${alloc.movementPurpose}` as Parameters<typeof t>[0]
                          )
                        : "—"}
                    </TableCell>
                    <TableCell>
                      {alloc.batchNumber ? (
                        <button
                          type="button"
                          className="text-primary hover:underline cursor-pointer"
                          onClick={() =>
                            router.push(
                              `/brewery/batches/${alloc.batchId}`
                            )
                          }
                        >
                          {alloc.batchNumber}
                        </button>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {alloc.quantity}
                    </TableCell>
                    <TableCell className="text-right">
                      {Number(alloc.unitPrice).toLocaleString("cs-CZ", {
                        minimumFractionDigits: 2,
                      })}{" "}
                      K{"\u010d"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}

// Small readonly field
function InfoField({
  label,
  value,
}: {
  label: string;
  value: string;
}): React.ReactNode {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}
