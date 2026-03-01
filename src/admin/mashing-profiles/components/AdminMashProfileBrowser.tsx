"use client";

import { useTranslations } from "next-intl";
import { useRouter, usePathname } from "next/navigation";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { useAdminMashingProfiles } from "../hooks";

// ── Component ──────────────────────────────────────────────────

export function AdminMashProfileBrowser(): React.ReactNode {
  const t = useTranslations("mashingProfiles");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const pathname = usePathname();

  const { data: profiles, isLoading } = useAdminMashingProfiles();

  const mashingTypeLabels: Record<string, string> = {
    infusion: t("mashingType.infusion"),
    decoction: t("mashingType.decoction"),
    step: t("mashingType.step"),
  };

  const handleRowClick = (id: string): void => {
    router.push(`${pathname}/${id}`);
  };

  const handleNew = (): void => {
    router.push(`${pathname}/new`);
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">
          {t("title")}
        </h1>
        <Button size="sm" onClick={handleNew}>
          <Plus className="mr-1 size-4" />
          {tCommon("create")}
        </Button>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="text-muted-foreground">{tCommon("loading")}</div>
      ) : profiles.length === 0 ? (
        <div className="text-muted-foreground">{tCommon("noResults")}</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("columns.name")}</TableHead>
              <TableHead>{t("columns.mashingTypeLabel")}</TableHead>
              <TableHead className="text-right">
                {t("columns.stepCount")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {profiles.map((profile) => (
              <TableRow
                key={profile.id}
                className="cursor-pointer"
                onClick={() => handleRowClick(profile.id)}
              >
                <TableCell className="font-medium">
                  {profile.name}
                </TableCell>
                <TableCell>
                  {profile.mashingType
                    ? (mashingTypeLabels[profile.mashingType] ??
                        profile.mashingType)
                    : "—"}
                </TableCell>
                <TableCell className="text-right">
                  {profile.steps.length}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
