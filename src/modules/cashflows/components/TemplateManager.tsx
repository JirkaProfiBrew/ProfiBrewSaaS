"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Play, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { useTemplateList } from "../hooks";
import {
  createTemplate, updateTemplate, deleteTemplate,
  generateFromTemplates, generateFromTemplate, previewGeneration,
  getGeneratedCashFlows, getPartnerOptions, getCategoryOptions,
} from "../actions";
import type {
  CashFlow, CashFlowTemplate, CreateTemplateInput, UpdateTemplateInput,
  CashFlowType, CategoryOption,
} from "../types";
import type { GeneratedCfItem, PendingCfItem } from "../actions";
import { CashFlowTypeBadge } from "./CashFlowTypeBadge";
import { CashFlowStatusBadge } from "./CashFlowStatusBadge";

// ── Form helpers ────────────────────────────────────────────

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
  autoGenerate: boolean;
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
  autoGenerate: false,
};

function formatCZK(value: string): string {
  const num = parseFloat(value) || 0;
  return num.toLocaleString("cs-CZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Main component ──────────────────────────────────────────

export function TemplateManager(): React.ReactNode {
  const t = useTranslations("cashflows");
  const router = useRouter();
  const { data: templates, isLoading, mutate } = useTemplateList();

  // -- Shared options
  const [partnerOptions, setPartnerOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [allCategoryOptions, setAllCategoryOptions] = useState<CategoryOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getPartnerOptions(), getCategoryOptions()])
      .then(([partOpts, catOpts]) => { if (!cancelled) { setPartnerOptions(partOpts); setAllCategoryOptions(catOpts); } })
      .catch((error: unknown) => { console.error("Failed to load options:", error); });
    return (): void => { cancelled = true; };
  }, []);

  // -- Add/Edit dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<CashFlowTemplate | null>(null);
  const [formValues, setFormValues] = useState<DialogFormValues>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);

  const filteredCategoryOptions = allCategoryOptions.filter((cat) => cat.type === formValues.cashflowType);

  // -- Sheet detail state
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<CashFlowTemplate | null>(null);
  const [sheetTab, setSheetTab] = useState("settings");
  const [generatedCfs, setGeneratedCfs] = useState<CashFlow[]>([]);
  const [pendingItems, setPendingItems] = useState<PendingCfItem[]>([]);
  const [loadingGenerated, setLoadingGenerated] = useState(false);
  const [loadingPending, setLoadingPending] = useState(false);
  const [isGeneratingSingle, setIsGeneratingSingle] = useState(false);

  // -- Bulk generate dialog state
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkPending, setBulkPending] = useState<PendingCfItem[]>([]);
  const [bulkResult, setBulkResult] = useState<GeneratedCfItem[] | null>(null);
  const [loadingBulkPreview, setLoadingBulkPreview] = useState(false);
  const [isGeneratingBulk, setIsGeneratingBulk] = useState(false);

  const frequencyLabels: Record<string, string> = useMemo(() => ({
    weekly: t("frequency.weekly"), monthly: t("frequency.monthly"),
    quarterly: t("frequency.quarterly"), yearly: t("frequency.yearly"),
  }), [t]);

  // ── Add/Edit dialog handlers ──────────────────────────────

  const handleAdd = useCallback((): void => {
    setEditingItem(null);
    setFormValues(EMPTY_FORM);
    setDialogOpen(true);
  }, []);

  const handleEditFromSheet = useCallback((): void => {
    if (!selectedTemplate) return;
    setEditingItem(selectedTemplate);
    setFormValues({
      name: selectedTemplate.name, cashflowType: selectedTemplate.cashflowType,
      categoryId: selectedTemplate.categoryId ?? "",
      amount: selectedTemplate.amount, description: selectedTemplate.description ?? "",
      partnerId: selectedTemplate.partnerId ?? "",
      frequency: selectedTemplate.frequency,
      dayOfMonth: selectedTemplate.dayOfMonth != null ? String(selectedTemplate.dayOfMonth) : "",
      startDate: selectedTemplate.startDate, endDate: selectedTemplate.endDate ?? "",
      nextDate: selectedTemplate.nextDate,
      autoGenerate: selectedTemplate.autoGenerate,
    });
    setDialogOpen(true);
  }, [selectedTemplate]);

  const handleClose = useCallback((): void => {
    setDialogOpen(false);
    setEditingItem(null);
    setFormValues(EMPTY_FORM);
  }, []);

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
          autoGenerate: formValues.autoGenerate,
        };
        const result = await updateTemplate(editingItem.id, updateData);
        if ("error" in result) { toast.error(t("templates.saveFailed")); return; }
        if (selectedTemplate && selectedTemplate.id === editingItem.id) {
          setSelectedTemplate(result);
        }
      } else {
        const createData: CreateTemplateInput = {
          name: formValues.name, cashflowType: formValues.cashflowType,
          categoryId: formValues.categoryId || null, amount: formValues.amount,
          description: formValues.description || null, partnerId: formValues.partnerId || null,
          frequency: formValues.frequency as CreateTemplateInput["frequency"],
          dayOfMonth: formValues.dayOfMonth ? Number(formValues.dayOfMonth) : null,
          startDate: formValues.startDate, endDate: formValues.endDate || null,
          nextDate: formValues.nextDate,
          autoGenerate: formValues.autoGenerate,
        };
        const result = await createTemplate(createData);
        if ("error" in result) { toast.error(t("templates.saveFailed")); return; }
      }
      toast.success(t("templates.saved")); handleClose(); mutate();
    } catch { toast.error(t("templates.saveFailed")); } finally { setIsSaving(false); }
  }, [editingItem, formValues, handleClose, mutate, t, selectedTemplate]);

  const handleDelete = useCallback(async (id: string): Promise<void> => {
    try {
      const result = await deleteTemplate(id);
      if ("error" in result) { toast.error(t("templates.deleteFailed")); return; }
      toast.success(t("templates.deleted"));
      if (selectedTemplate?.id === id) { setSheetOpen(false); setSelectedTemplate(null); }
      mutate();
    } catch { toast.error(t("templates.deleteFailed")); }
  }, [mutate, t, selectedTemplate]);

  // ── Sheet detail handlers ─────────────────────────────────

  const openSheet = useCallback((tpl: CashFlowTemplate): void => {
    setSelectedTemplate(tpl);
    setSheetTab("settings");
    setGeneratedCfs([]);
    setPendingItems([]);
    setSheetOpen(true);
  }, []);

  const loadGenerated = useCallback(async (templateId: string): Promise<void> => {
    setLoadingGenerated(true);
    try {
      const cfs = await getGeneratedCashFlows(templateId);
      setGeneratedCfs(cfs);
    } catch (err: unknown) {
      console.error("Failed to load generated CFs:", err);
    } finally { setLoadingGenerated(false); }
  }, []);

  const loadPending = useCallback(async (templateId: string): Promise<void> => {
    setLoadingPending(true);
    try {
      const items = await previewGeneration(templateId);
      setPendingItems(items);
    } catch (err: unknown) {
      console.error("Failed to load pending items:", err);
    } finally { setLoadingPending(false); }
  }, []);

  useEffect(() => {
    if (!selectedTemplate || !sheetOpen) return;
    if (sheetTab === "generated") { void loadGenerated(selectedTemplate.id); }
    if (sheetTab === "pending") { void loadPending(selectedTemplate.id); }
  }, [sheetTab, selectedTemplate, sheetOpen, loadGenerated, loadPending]);

  const handleGenerateSingle = useCallback(async (): Promise<void> => {
    if (!selectedTemplate) return;
    setIsGeneratingSingle(true);
    try {
      const result = await generateFromTemplate(selectedTemplate.id);
      if ("error" in result) {
        toast.error(t("templates.generateFailed"));
      } else if (result.generated.length === 0) {
        toast.info(t("templates.generateEmpty"));
      } else {
        toast.success(t("templates.generateSuccess", { count: result.generated.length }));
        void loadGenerated(selectedTemplate.id);
        void loadPending(selectedTemplate.id);
        mutate();
      }
    } catch { toast.error(t("templates.generateFailed")); } finally { setIsGeneratingSingle(false); }
  }, [selectedTemplate, mutate, t, loadGenerated, loadPending]);

  // ── Bulk generate handlers ────────────────────────────────

  const openBulkDialog = useCallback(async (): Promise<void> => {
    setBulkDialogOpen(true);
    setBulkResult(null);
    setLoadingBulkPreview(true);
    try {
      const items = await previewGeneration();
      setBulkPending(items);
    } catch (err: unknown) {
      console.error("Failed to load bulk preview:", err);
      setBulkPending([]);
    } finally { setLoadingBulkPreview(false); }
  }, []);

  const handleBulkGenerate = useCallback(async (): Promise<void> => {
    setIsGeneratingBulk(true);
    try {
      const result = await generateFromTemplates();
      if ("error" in result) {
        toast.error(t("templates.generateFailed"));
      } else {
        setBulkResult(result.items);
        mutate();
      }
    } catch { toast.error(t("templates.generateFailed")); } finally { setIsGeneratingBulk(false); }
  }, [mutate, t]);

  const closeBulkDialog = useCallback((): void => {
    setBulkDialogOpen(false);
    setBulkPending([]);
    setBulkResult(null);
  }, []);

  const bulkTotal = useMemo(() => {
    const source = bulkResult ?? bulkPending;
    return source.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
  }, [bulkPending, bulkResult]);

  // ── Loading state ─────────────────────────────────────────

  if (isLoading) {
    return (<div className="flex flex-col gap-6 p-6"><Skeleton className="h-8 w-48" /><Skeleton className="h-64 w-full" /></div>);
  }

  // ── Render ────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{t("templates.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("templates.description")}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => { void openBulkDialog(); }}>
            <Play className="mr-2 h-4 w-4" />{t("templates.generate")}
          </Button>
          <Button onClick={handleAdd}><Plus className="mr-2 h-4 w-4" />{t("templates.addTemplate")}</Button>
        </div>
      </div>

      {/* Template browser table */}
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
            <TableRow
              key={tpl.id}
              className="cursor-pointer"
              onClick={() => openSheet(tpl)}
            >
              <TableCell className="font-medium">
                {tpl.name}
                {tpl.autoGenerate && <Badge variant="outline" className="ml-2 text-xs">{t("templates.autoBadge")}</Badge>}
              </TableCell>
              <TableCell><CashFlowTypeBadge cashflowType={tpl.cashflowType} /></TableCell>
              <TableCell>{tpl.categoryName ?? "-"}</TableCell>
              <TableCell className="tabular-nums">{formatCZK(tpl.amount)} K\u010d</TableCell>
              <TableCell>{frequencyLabels[tpl.frequency] ?? tpl.frequency}</TableCell>
              <TableCell>{tpl.nextDate}</TableCell>
              <TableCell>
                <Badge variant={tpl.isActive ? "default" : "secondary"}>
                  {tpl.isActive ? t("templates.active") : "Inactive"}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="sm"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t("templates.deleteConfirm")}</AlertDialogTitle>
                        <AlertDialogDescription>{t("templates.deleteConfirm")}</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t("templates.cancel")}</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => { void handleDelete(tpl.id); }}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          {t("actions.delete")}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </TableCell>
            </TableRow>
          ))}
          {templates.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-muted-foreground">
                {t("templates.empty")}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {/* ── Sheet: Template detail with tabs ────────────────── */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{selectedTemplate?.name ?? ""}</SheetTitle>
          </SheetHeader>

          <Tabs value={sheetTab} onValueChange={setSheetTab} className="mt-4 px-6">
            <TabsList className="w-full">
              <TabsTrigger value="settings" className="flex-1">{t("templates.tabs.settings")}</TabsTrigger>
              <TabsTrigger value="generated" className="flex-1">{t("templates.tabs.generated")}</TabsTrigger>
              <TabsTrigger value="pending" className="flex-1">{t("templates.tabs.pending")}</TabsTrigger>
            </TabsList>

            {/* Tab 1: Settings (read-only summary + edit button) */}
            <TabsContent value="settings" className="mt-4 space-y-4">
              {selectedTemplate && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <span className="text-muted-foreground">{t("templates.name")}</span>
                    <span className="font-medium">{selectedTemplate.name}</span>

                    <span className="text-muted-foreground">{t("templates.type")}</span>
                    <span><CashFlowTypeBadge cashflowType={selectedTemplate.cashflowType} /></span>

                    <span className="text-muted-foreground">{t("templates.category")}</span>
                    <span>{selectedTemplate.categoryName ?? "-"}</span>

                    <span className="text-muted-foreground">{t("templates.amount")}</span>
                    <span className="font-mono">{formatCZK(selectedTemplate.amount)} Kč</span>

                    <span className="text-muted-foreground">{t("templates.description")}</span>
                    <span>{selectedTemplate.description ?? "-"}</span>

                    <span className="text-muted-foreground">{t("templates.partner")}</span>
                    <span>{selectedTemplate.partnerName ?? "-"}</span>

                    <span className="text-muted-foreground">{t("templates.frequency")}</span>
                    <span>{frequencyLabels[selectedTemplate.frequency] ?? selectedTemplate.frequency}</span>

                    <span className="text-muted-foreground">{t("templates.startDate")}</span>
                    <span>{selectedTemplate.startDate}</span>

                    <span className="text-muted-foreground">{t("templates.endDate")}</span>
                    <span>{selectedTemplate.endDate ?? "-"}</span>

                    <span className="text-muted-foreground">{t("templates.nextDate")}</span>
                    <span className="font-medium">{selectedTemplate.nextDate}</span>

                    <span className="text-muted-foreground">{t("templates.autoGenerate")}</span>
                    <span>
                      {selectedTemplate.autoGenerate
                        ? <Badge variant="outline" className="text-xs">{t("templates.autoBadge")}</Badge>
                        : "-"}
                    </span>
                  </div>
                  <Button variant="outline" size="sm" onClick={handleEditFromSheet}>
                    <Pencil className="mr-1 h-4 w-4" />{t("templates.editTemplate")}
                  </Button>
                </div>
              )}
            </TabsContent>

            {/* Tab 2: Generated CFs */}
            <TabsContent value="generated" className="mt-4">
              {loadingGenerated ? (
                <div className="space-y-2">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ) : generatedCfs.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">{t("templates.generated.empty")}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("templates.generated.code")}</TableHead>
                      <TableHead>{t("templates.generated.date")}</TableHead>
                      <TableHead className="text-right">{t("templates.generated.amount")}</TableHead>
                      <TableHead>{t("templates.generated.status")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {generatedCfs.map((cf) => (
                      <TableRow key={cf.id}>
                        <TableCell>
                          <button
                            type="button"
                            className="text-primary hover:underline cursor-pointer"
                            onClick={() => router.push(`/finance/cashflow/${cf.id}`)}
                          >
                            {cf.code}
                          </button>
                        </TableCell>
                        <TableCell>{cf.date}</TableCell>
                        <TableCell className="text-right font-mono">{formatCZK(cf.amount)} Kč</TableCell>
                        <TableCell><CashFlowStatusBadge status={cf.status} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            {/* Tab 3: Pending (preview) */}
            <TabsContent value="pending" className="mt-4 space-y-4">
              {loadingPending ? (
                <div className="space-y-2">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              ) : pendingItems.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">{t("templates.pending.empty")}</p>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("templates.pending.date")}</TableHead>
                        <TableHead className="text-right">{t("templates.pending.amount")}</TableHead>
                        <TableHead>{t("templates.pending.type")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendingItems.map((item, idx) => (
                        <TableRow key={`${item.date}-${idx}`}>
                          <TableCell>{item.date}</TableCell>
                          <TableCell className="text-right font-mono">{formatCZK(item.amount)} Kč</TableCell>
                          <TableCell><CashFlowTypeBadge cashflowType={item.cashflowType} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <Button
                    onClick={() => { void handleGenerateSingle(); }}
                    disabled={isGeneratingSingle}
                  >
                    {isGeneratingSingle && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {t("templates.generateFromTemplate")}
                  </Button>
                </>
              )}
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>

      {/* ── Dialog: Add / Edit template ─────────────────────── */}
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
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">{t("templates.autoGenerate")}</Label>
              <div className="col-span-3 space-y-1">
                <Switch checked={formValues.autoGenerate} onCheckedChange={(v) => setFormValues((p) => ({ ...p, autoGenerate: v }))} />
                <p className="text-xs text-muted-foreground">{t("templates.autoGenerateHelp")}</p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleClose}>{t("templates.cancel")}</Button>
            <Button onClick={() => { void handleSave(); }} disabled={isSaving}>{t("templates.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Bulk generate preview / result ──────────── */}
      <Dialog open={bulkDialogOpen} onOpenChange={(open) => { if (!open) closeBulkDialog(); }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {bulkResult
                ? t("templates.bulkGenerate.resultTitle", { count: bulkResult.length })
                : t("templates.bulkGenerate.title")}
            </DialogTitle>
          </DialogHeader>

          {/* Loading preview */}
          {loadingBulkPreview && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* Preview state (before generate) */}
          {!loadingBulkPreview && !bulkResult && (
            <>
              {bulkPending.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4">
                  {t("templates.bulkGenerate.nothingToGenerate")}
                </p>
              ) : (
                <>
                  <p className="text-sm font-medium">
                    {t("templates.bulkGenerate.pendingCount", { count: bulkPending.length })}
                  </p>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("templates.pending.templateName")}</TableHead>
                        <TableHead>{t("templates.pending.date")}</TableHead>
                        <TableHead className="text-right">{t("templates.pending.amount")}</TableHead>
                        <TableHead>{t("templates.pending.type")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {bulkPending.map((item, idx) => (
                        <TableRow key={`${item.templateId}-${item.date}-${idx}`} className={item.autoGenerate ? "opacity-60" : undefined}>
                          <TableCell>
                            {item.templateName}
                            {item.autoGenerate && <Badge variant="outline" className="ml-1 text-xs">{t("templates.autoBadge")}</Badge>}
                          </TableCell>
                          <TableCell>{item.date}</TableCell>
                          <TableCell className="text-right font-mono">{formatCZK(item.amount)} Kč</TableCell>
                          <TableCell><CashFlowTypeBadge cashflowType={item.cashflowType} /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="flex items-center justify-between text-sm font-medium pt-2 border-t">
                    <span>{t("templates.bulkGenerate.total")}</span>
                    <span className="font-mono">{formatCZK(String(bulkTotal))} Kč</span>
                  </div>
                </>
              )}
            </>
          )}

          {/* Result state (after generate) */}
          {bulkResult && (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("templates.generated.code")}</TableHead>
                    <TableHead>{t("templates.pending.templateName")}</TableHead>
                    <TableHead>{t("templates.generated.date")}</TableHead>
                    <TableHead className="text-right">{t("templates.generated.amount")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bulkResult.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.code}</TableCell>
                      <TableCell>{item.templateName}</TableCell>
                      <TableCell>{item.date}</TableCell>
                      <TableCell className="text-right font-mono">{formatCZK(item.amount)} Kč</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex items-center justify-between text-sm font-medium pt-2 border-t">
                <span>{t("templates.bulkGenerate.total")}</span>
                <span className="font-mono">{formatCZK(String(bulkTotal))} Kč</span>
              </div>
            </>
          )}

          <DialogFooter>
            {bulkResult ? (
              <Button onClick={closeBulkDialog}>{t("templates.bulkGenerate.close")}</Button>
            ) : (
              <>
                <Button variant="outline" onClick={closeBulkDialog}>{t("templates.cancel")}</Button>
                <Button
                  onClick={() => { void handleBulkGenerate(); }}
                  disabled={isGeneratingBulk || bulkPending.length === 0 || loadingBulkPreview}
                >
                  {isGeneratingBulk && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t("templates.bulkGenerate.confirm", { count: bulkPending.length })}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
