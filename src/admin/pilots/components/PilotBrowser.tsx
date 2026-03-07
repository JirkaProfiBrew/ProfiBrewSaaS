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
import { Copy, Check } from "lucide-react";
import { listInvitations } from "../actions";
import { CreateInvitationDialog } from "./CreateInvitationDialog";
import type { PilotInvitation } from "../types";

function statusVariant(
  status: PilotInvitation["status"]
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "registered":
      return "default";
    case "sent":
      return "secondary";
    case "expired":
      return "destructive";
    default:
      return "outline";
  }
}

export function PilotBrowser(): React.ReactNode {
  const t = useTranslations("admin.pilots");
  const [invitations, setInvitations] = useState<PilotInvitation[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const loadData = useCallback(async (): Promise<void> => {
    try {
      const data = await listInvitations();
      setInvitations(data);
    } catch {
      console.error("Failed to load invitations");
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  function handleCopyLink(invitation: PilotInvitation): void {
    const baseUrl = window.location.origin;
    const locale = window.location.pathname.split("/")[1] ?? "cs";
    const url = `${baseUrl}/${locale}/register?invite=${invitation.token}`;
    void navigator.clipboard.writeText(url);
    setCopiedId(invitation.id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <CreateInvitationDialog onCreated={() => void loadData()} />
      </div>

      {invitations.length === 0 ? (
        <p className="text-muted-foreground">{t("noInvitations")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("email")}</TableHead>
              <TableHead>{t("plan")}</TableHead>
              <TableHead>{t("trialDays")}</TableHead>
              <TableHead>{t("priceOverride")}</TableHead>
              <TableHead>{t("status")}</TableHead>
              <TableHead>{t("createdAt")}</TableHead>
              <TableHead>{t("actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invitations.map((inv) => (
              <TableRow key={inv.id}>
                <TableCell className="font-medium">{inv.email}</TableCell>
                <TableCell>{inv.planSlug}</TableCell>
                <TableCell>{inv.trialDays}</TableCell>
                <TableCell>
                  {inv.priceOverride ? `${inv.priceOverride} CZK` : "-"}
                </TableCell>
                <TableCell>
                  <Badge variant={statusVariant(inv.status)}>
                    {t(inv.status)}
                  </Badge>
                </TableCell>
                <TableCell>
                  {inv.createdAt
                    ? new Date(inv.createdAt).toLocaleDateString("cs-CZ")
                    : "-"}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCopyLink(inv)}
                    disabled={inv.status === "registered"}
                  >
                    {copiedId === inv.id ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                    <span className="ml-1.5">
                      {copiedId === inv.id ? t("linkCopied") : t("copyLink")}
                    </span>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
