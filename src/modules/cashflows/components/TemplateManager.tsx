"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

import { useTemplateList } from "../hooks";
import {
  createTemplate, updateTemplate, deleteTemplate,
  generateFromTemplates, getPartnerOptions, getCategoryOptions,
} from "../actions";
import type { CashFlowTemplate, CreateTemplateInput, UpdateTemplateInput, CashFlowType, CategoryOption } from "../types";
import { CashFlowTypeBadge } from "./CashFlowTypeBadge";

interface DialogFormValues {
  name: string;
  cashflowType: CashFlowType;
  categoryId: string;
  amount: string;
  description: string;
  partnerId: string;
  frequency: string;
  dayOfMonth: string;
  startDate: string;
  endDate: string;
  nextDate: string;
}

const EMPTY_FORM: DialogFormValues = {
  name: "",
  cashflowType: "expense",
  categoryId: "",
  amount: "",
  description: "",
  partnerId: "",
  frequency: "monthly",
  dayOfMonth: "",
  startDate: new Date().toISOString().slice(0, 10),
  endDate: "",
  nextDate: new Date().toISOString().slice(0, 10),
};

function formatCZK(value: string): string {
  const num = parseFloat(value) || 0;
  return num.toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function TemplateManager(): React.ReactNode {
  const t = useTranslations("cashflows");
  const { data: templates, isLoading, mutate } = useTemplateList();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<CashFlowTemplate | null>(null);
  const [formValues, setFormValues] = useState<DialogFormValues>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [partnerOptions, setPartnerOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [allCategoryOptions, setAllCategoryOptions] = useState<CategoryOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getPartnerOptions(), getCategoryOptions()])
      .then(([partOpts, catOpts]) => { if (!cancelled) { setPartnerOptions(partOpts); setAllCategoryOptions(catOpts); } })
      .catch((error: unknown) => { console.error("Failed to load options:", error); });
    return (): void => { cancelled = true; };
  }, []);

  const filteredCategoryOptions = allCategoryOptions.filter((cat) => cat.type === formValues.cashflowType);

  const handleAdd = useCallback((): void => { setEditingItem(null); setFormValues(EMPTY_FORM); setDialogOpen(true); }, []);

  const handleEdit = useCallback((tpl: CashFlowTemplate): void => {
    setEditingItem(tpl);
    setFormValues({
      name: tpl.name, cashflowType: tpl.cashflowType, categoryId: tpl.categoryId ?? "",
      amount: tpl.amount, description: tpl.description ?? "", partnerId: tpl.partnerId ?? "",
      frequency: tpl.frequency, dayOfMonth: tpl.dayOfMonth != null ? String(tpl.dayOfMonth) : "",
      startDate: tpl.startDate, endDate: tpl.endDate ?? "", nextDate: tpl.nextDate,
    });
    setDialogOpen(true);
  }, []);

  const handleClose = useCallback((): void => { setDialogOpen(false); setEditingItem(null); setFormValues(EMPTY_FORM); }, []);

  const handleSave = useCallback(async (): Promise<void> => {
    if (!formValues.name.trim()) { toast.error(t("templates.nameRequired")); return; }
    if (!formValues.amount || isNaN(Number(formValues.amount))) { toast.error(t("templates.amountRequired")); return; }
    setIsSaving(true);
    try {
      if (editingItem) {
        const updateData: UpdateTemplateInput = {
          name: formValues.name, categoryId: formValues.categoryId || null,
          amount: formValues.amount, description: formValues.description || null,
          partnerId: formValues.partnerId || null,
          frequency: formValues.frequency as UpdateTemplateInput["frequency"],
          dayOfMonth: formValues.dayOfMonth ? Number(formValues.dayOfMonth) : null,
          endDate: formValues.endDate || null, nextDate: formValues.nextDate || undefined,
        };
        const result = await updateTemplate(editingItem.id, updateData);
        if ("error" in result) { toast.error(t("templates.saveFailed")); return; }
      } else {
        const createData: CreateTemplateInput = {
          name: formValues.name, cashflowType: formValues.cashflowType,
          categoryId: formValues.categoryId || null, amount: formValues.amount,
          description: formValues.description || null, partnerId: formValues.partnerId || null,
          frequency: formValues.frequency as CreateTemplateInput["frequency"],
          dayOfMonth: formValues.dayOfMonth ? Number(formValues.dayOfMonth) : null,
          startDate: formValues.startDate, endDate: formValues.endDate || null,
          nextDate: formValues.nextDate,
        };
        const result = await createTemplate(createData);
        if ("error" in result) { toast.error(t("templates.saveFailed")); return; }
      }
      toast.success(t("templates.saved")); handleClose(); mutate();
    } catch { toast.error(t("templates.saveFailed")); } finally { setIsSaving(false); }
  }, [editingItem, formValues, handleClose, mutate, t]);

  const handleDelete = useCallback(async (id: string): Promise<void> => {
    try {
      const result = await deleteTemplate(id);
      if ("error" in result) { toast.error(t("templates.deleteFailed")); return; }
      toast.success(t("templates.deleted")); mutate();
    } catch { toast.error(t("templates.deleteFailed")); }
  }, [mutate, t]);

  const handleGenerate = useCallback(async (): Promise<void> => {
    setIsGenerating(true);
    try {
      const result = await generateFromTemplates();
      if ("error" in result) { toast.error(t("templates.generateFailed")); return; }
      if (result.generated === 0) { toast.info(t("templates.generateEmpty")); }
      else { toast.success(t("templates.generateSuccess", { count: result.generated })); mutate(); }
    } catch { toast.error(t("templates.generateFailed")); } finally { setIsGenerating(false); }
  }, [mutate, t]);

  const frequencyLabels: Record<string, string> = {
    weekly: t("frequency.weekly"), monthly: t("frequency.monthly"),
    quarterly: t("frequency.quarterly"), yearly: t("frequency.yearly"),
  };

  if (isLoading) {
    return (<div className="flex flex-col gap-6 p-6"><Skeleton className="h-8 w-48" /><Skeleton className="h-64 w-full" /></div>);
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("templates.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("templates.description")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => { void handleGenerate(); }} disabled={isGenerating}>
            <Play className="mr-2 h-4 w-4" />{t("templates.generate")}
          </Button>
          <Button onClick={handleAdd}><Plus className="mr-2 h-4 w-4" />{t("templates.addTemplate")}</Button>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("templates.name")}</TableHead>
            <TableHead>{t("templates.type")}</TableHead>
            <TableHead>{t("templates.category")}</TableHead>
            <TableHead>{t("templates.amount")}</TableHead>
            <TableHead>{t("templates.frequency")}</TableHead>
            <TableHead>{t("templates.nextDate")}</TableHead>
            <TableHead>{t("templates.active")}</TableHead>
            <TableHead>{t("templates.actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {templates.map((tpl) => (
            <TableRow key={tpl.id}>
              <TableCell className="font-medium">{tpl.name}</TableCell>
              <TableCell><CashFlowTypeBadge cashflowType={tpl.cashflowType} /></TableCell>
              <TableCell>{tpl.categoryName ?? "-"}</TableCell>
              <TableCell className="tabular-nums">{formatCZK(tpl.amount)} K\u010d</TableCell>
              <TableCell>{frequencyLabels[tpl.frequency] ?? tpl.frequency}</TableCell>
              <TableCell>{tpl.nextDate}</TableCell>
              <TableCell><Badge variant={tpl.isActive ? "default" : "secondary"}>{tpl.isActive ? "Active" : "Inactive"}</Badge></TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => handleEdit(tpl)}><Pencil className="mr-1 h-4 w-4" /></Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild><Button variant="ghost" size="sm"><Trash2 className="h-4 w-4 text-destructive" /></Button></AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader><AlertDialogTitle>{t("templates.deleteConfirm")}</AlertDialogTitle><AlertDialogDescription>{t("templates.deleteConfirm")}</AlertDialogDescription></AlertDialogHeader>
                      <AlertDialogFooter><AlertDialogCancel>{t("templates.cancel")}</AlertDialogCancel><AlertDialogAction onClick={() => { void handleDelete(tpl.id); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{t("actions.delete")}</AlertDialogAction></AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </TableCell>
            </TableRow>
          ))}
          {templates.length === 0 && (<TableRow><TableCell colSpan={8} className="text-center text-muted-foreground">{t("templates.empty")}</TableCell></TableRow>)}
        </TableBody>
      </Table>

      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingItem ? t("templates.editTemplate") : t("templates.addTemplate")}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">{t("templates.name")}</Label>
              <Input className="col-span-3" value={formValues.name} onChange={(e) => setFormValues((p) => ({ ...p, name: e.target.value }))} />
            </div>
            {!editingItem && (
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">{t("form.type")}</Label>
                <Select value={formValues.cashflowType} onValueChange={(v) => setFormValues((p) => ({ ...p, cashflowType: v as CashFlowType, categoryId: "" }))}>
                  <SelectTrigger className="col-span-3"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="income">{t("form.typeIncome")}</SelectItem><SelectItem value="expense">{t("form.typeExpense")}</SelectItem></SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">{t("templates.category")}</Label>
              <Select value={formValues.categoryId} onValueChange={(v) => setFormValues((p) => ({ ...p, categoryId: v }))}>
                <SelectTrigger className="col-span-3"><SelectValue placeholder={t("form.categoryPlaceholder")} /></SelectTrigger>
                <SelectContent>{filteredCategoryOptions.map((o) => (<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>))}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">{t("templates.amount")}</Label>
              <Input className="col-span-3" type="number" min={0} step="0.01" value={formValues.amount} onChange={(e) => setFormValues((p) => ({ ...p, amount: e.target.value }))} />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">{t("templates.description")}</Label>
              <Input className="col-span-3" value={formValues.description} onChange={(e) => setFormValues((p) => ({ ...p, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">{t("templates.partner")}</Label>
              <Select value={formValues.partnerId} onValueChange={(v) => setFormValues((p) => ({ ...p, partnerId: v }))}>
                <SelectTrigger className="col-span-3"><SelectValue placeholder={t("form.partnerPlaceholder")} /></SelectTrigger>
                <SelectContent>{partnerOptions.map((o) => (<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>))}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">{t("templates.frequency")}</Label>
              <Select value={formValues.frequency} onValueChange={(v) => setFormValues((p) => ({ ...p, frequency: v }))}>
                <SelectTrigger className="col-span-3"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="weekly">{t("frequency.weekly")}</SelectItem><SelectItem value="monthly">{t("frequency.monthly")}</SelectItem><SelectItem value="quarterly">{t("frequency.quarterly")}</SelectItem><SelectItem value="yearly">{t("frequency.yearly")}</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">{t("templates.dayOfMonth")}</Label>
              <Input className="col-span-3" type="number" min={1} max={31} value={formValues.dayOfMonth} onChange={(e) => setFormValues((p) => ({ ...p, dayOfMonth: e.target.value }))} />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">{t("templates.startDate")}</Label>
              <Input className="col-span-3" type="date" value={formValues.startDate} onChange={(e) => setFormValues((p) => ({ ...p, startDate: e.target.value }))} />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">{t("templates.endDate")}</Label>
              <Input className="col-span-3" type="date" value={formValues.endDate} onChange={(e) => setFormValues((p) => ({ ...p, endDate: e.target.value }))} />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">{t("templates.nextDate")}</Label>
              <Input className="col-span-3" type="date" value={formValues.nextDate} onChange={(e) => setFormValues((p) => ({ ...p, nextDate: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleClose}>{t("templates.cancel")}</Button>
            <Button onClick={() => { void handleSave(); }} disabled={isSaving}>{t("templates.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
