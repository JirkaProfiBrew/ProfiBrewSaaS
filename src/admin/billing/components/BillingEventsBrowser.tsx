"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";
import { listBillingEvents, markEventProcessed } from "../actions";
import type { BillingEventRow } from "../actions";

export function BillingEventsBrowser(): React.ReactNode {
  const t = useTranslations("admin.billingEvents");
  const [events, setEvents] = useState<BillingEventRow[]>([]);

  const loadData = useCallback(async (): Promise<void> => {
    try {
      const data = await listBillingEvents();
      setEvents(data);
    } catch {
      console.error("Failed to load billing events");
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function handleMarkProcessed(eventId: string): Promise<void> {
    try {
      await markEventProcessed(eventId);
      void loadData();
    } catch {
      console.error("Failed to mark event as processed");
    }
  }

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">{t("title")}</h1>

      {events.length === 0 ? (
        <p className="text-muted-foreground">{t("noEvents")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("tenant")}</TableHead>
              <TableHead>{t("type")}</TableHead>
              <TableHead>{t("plan")}</TableHead>
              <TableHead>{t("amount")}</TableHead>
              <TableHead>{t("processed")}</TableHead>
              <TableHead>{t("date")}</TableHead>
              <TableHead>{t("notes")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {events.map((ev) => (
              <TableRow key={ev.id}>
                <TableCell className="font-medium">
                  {ev.tenantName}
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{ev.type}</Badge>
                </TableCell>
                <TableCell>{ev.planSlug ?? "-"}</TableCell>
                <TableCell>
                  {ev.amount ? `${ev.amount} CZK` : "-"}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={ev.processed ? "default" : "secondary"}
                  >
                    {ev.processed ? t("done") : t("pending")}
                  </Badge>
                </TableCell>
                <TableCell>
                  {ev.createdAt
                    ? new Date(ev.createdAt).toLocaleDateString("cs-CZ")
                    : "-"}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                  {ev.notes ?? "-"}
                </TableCell>
                <TableCell>
                  {!ev.processed && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void handleMarkProcessed(ev.id)}
                    >
                      <Check className="mr-1.5 h-4 w-4" />
                      {t("markProcessed")}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
