"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Copy, Check } from "lucide-react";
import { createInvitation } from "../actions";

interface CreateInvitationDialogProps {
  onCreated: () => void;
}

const PLAN_OPTIONS = [
  { value: "free", label: "Free" },
  { value: "starter", label: "Starter" },
  { value: "pro", label: "Pro" },
  { value: "business", label: "Business" },
];

export function CreateInvitationDialog({
  onCreated,
}: CreateInvitationDialogProps): React.ReactNode {
  const t = useTranslations("admin.pilots");
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(
    e: React.FormEvent<HTMLFormElement>
  ): Promise<void> {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    const planSlug = formData.get("planSlug") as string;
    const trialDays = parseInt(formData.get("trialDays") as string, 10);
    const priceOverride = formData.get("priceOverride") as string;
    const notes = formData.get("notes") as string;

    try {
      const invitation = await createInvitation({
        email,
        planSlug: planSlug || "pro",
        trialDays: isNaN(trialDays) ? 30 : trialDays,
        priceOverride: priceOverride || undefined,
        notes: notes || undefined,
      });

      const baseUrl = window.location.origin;
      const locale = window.location.pathname.split("/")[1] ?? "cs";
      const url = `${baseUrl}/${locale}/register?invite=${invitation.token}`;
      setInviteUrl(url);
      onCreated();
    } catch {
      console.error("Failed to create invitation");
    } finally {
      setLoading(false);
    }
  }

  function handleCopy(): void {
    if (inviteUrl) {
      void navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function handleOpenChange(newOpen: boolean): void {
    setOpen(newOpen);
    if (!newOpen) {
      setInviteUrl(null);
      setCopied(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1.5 h-4 w-4" />
          {t("createInvitation")}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("createInvitation")}</DialogTitle>
        </DialogHeader>

        {inviteUrl ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("inviteUrl")}</Label>
              <div className="flex gap-2">
                <Input value={inviteUrl} readOnly className="bg-muted" />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleCopy}
                >
                  {copied ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              {copied && (
                <p className="text-sm text-muted-foreground">
                  {t("linkCopied")}
                </p>
              )}
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="invite-email">{t("email")}</Label>
              <Input
                id="invite-email"
                name="email"
                type="email"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-plan">{t("plan")}</Label>
              <Select name="planSlug" defaultValue="pro">
                <SelectTrigger id="invite-plan">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLAN_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-trial">{t("trialDays")}</Label>
              <Input
                id="invite-trial"
                name="trialDays"
                type="number"
                defaultValue={30}
                min={0}
                max={365}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-price">{t("priceOverride")}</Label>
              <Input
                id="invite-price"
                name="priceOverride"
                type="text"
                placeholder="0"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-notes">{t("notes")}</Label>
              <Textarea id="invite-notes" name="notes" rows={2} />
            </div>
            <Button type="submit" disabled={loading} className="w-full">
              {t("create")}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
