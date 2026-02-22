"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Trash2, ExternalLink, Check, Clock, XCircle } from "lucide-react";
import { toast } from "sonner";

import { DetailView } from "@/components/detail-view";
import { FormSection } from "@/components/forms";
import type { FormSectionDef, FormMode } from "@/components/forms";
import type { DetailViewAction } from "@/components/detail-view";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader,
  AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import Link from "next/link";

import { useCashFlowDetail } from "../hooks";
import { createCashFlow, updateCashFlow, deleteCashFlow, markCashFlowPaid, cancelCashFlow, getPartnerOptions, getCategoryOptions } from "../actions";
import type { CategoryOption, CashFlowType } from "../types";
import { CashFlowStatusBadge } from "./CashFlowStatusBadge";
import { CashFlowTypeBadge } from "./CashFlowTypeBadge";
interface CashFlowDetailProps { id: string; }

export function CashFlowDetail({ id }: CashFlowDetailProps): React.ReactNode {
  const t = useTranslations("cashflows");
  const tCommon = useTranslations("common");
  const router = useRouter();
  const isNew = id === "new";
  const { data: cashflowDetail, isLoading, mutate } = useCashFlowDetail(id);
  const [partnerOptions, setPartnerOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [allCategoryOptions, setAllCategoryOptions] = useState<CategoryOption[]>([]);
  const [values, setValues] = useState<Record<string, unknown>>({ cashflowType: "expense", categoryId: null, amount: "", date: new Date().toISOString().slice(0, 10), dueDate: null, paidDate: null, partnerId: null, description: null, notes: null, isCash: false });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState("detail");
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getPartnerOptions(), getCategoryOptions()])
      .then(([partOpts, catOpts]) => { if (!cancelled) { setPartnerOptions(partOpts); setAllCategoryOptions(catOpts); } })
      .catch((error: unknown) => { console.error("Failed to load options:", error); });
    return (): void => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (cashflowDetail) {
      setValues({ code: cashflowDetail.code, cashflowType: cashflowDetail.cashflowType, categoryId: cashflowDetail.categoryId, amount: cashflowDetail.amount, date: cashflowDetail.date ?? null, dueDate: cashflowDetail.dueDate ?? null, paidDate: cashflowDetail.paidDate ?? null, partnerId: cashflowDetail.partnerId, description: cashflowDetail.description, notes: cashflowDetail.notes, isCash: cashflowDetail.isCash });
    }
  }, [cashflowDetail]);

  const filteredCategoryOptions = useMemo(() => {
    const selectedType = values.cashflowType as CashFlowType;
    if (!selectedType) return allCategoryOptions;
    return allCategoryOptions.filter((cat) => cat.type === selectedType);
  }, [allCategoryOptions, values.cashflowType]);

  const isEditable = isNew || cashflowDetail?.status === "planned" || cashflowDetail?.status === "pending";
  const mode: FormMode = isEditable ? "edit" : "readonly";
  const cfTypeOpts = [{ value: "income", label: t("form.typeIncome") }, { value: "expense", label: t("form.typeExpense") }];

  const createFormSection: FormSectionDef = useMemo(() => ({ title: t("detail.newTitle"), columns: 2, fields: [
    { key: "cashflowType", label: t("form.type"), type: "select", options: cfTypeOpts, required: true },
    { key: "categoryId", label: t("form.category"), type: "select", options: filteredCategoryOptions, placeholder: t("form.categoryPlaceholder") },
    { key: "amount", label: t("form.amount"), type: "currency", required: true, suffix: "K\u010d" },
    { key: "date", label: t("form.date"), type: "date", required: true },
    { key: "dueDate", label: t("form.dueDate"), type: "date" },
    { key: "partnerId", label: t("form.partner"), type: "select", options: partnerOptions, placeholder: t("form.partnerPlaceholder") },
    { key: "description", label: t("form.description"), type: "text", gridSpan: 2 },
    { key: "notes", label: t("form.notes"), type: "textarea", gridSpan: 2 },
    { key: "isCash", label: t("form.isCash"), type: "checkbox" },
  ] }), [t, partnerOptions, filteredCategoryOptions]);

  const editFormSection: FormSectionDef = useMemo(() => ({ title: t("tabs.detail"), columns: 2, fields: [
    { key: "code", label: t("form.code"), type: "text", disabled: true },
    { key: "cashflowType", label: t("form.type"), type: "select", options: cfTypeOpts, disabled: true },
    { key: "categoryId", label: t("form.category"), type: "select", options: filteredCategoryOptions, placeholder: t("form.categoryPlaceholder") },
    { key: "amount", label: t("form.amount"), type: "currency", required: true, suffix: "K\u010d" },
    { key: "date", label: t("form.date"), type: "date", required: true },
    { key: "dueDate", label: t("form.dueDate"), type: "date" },
    { key: "paidDate", label: t("form.paidDate"), type: "date", disabled: true },
    { key: "partnerId", label: t("form.partner"), type: "select", options: partnerOptions, placeholder: t("form.partnerPlaceholder") },
    { key: "description", label: t("form.description"), type: "text", gridSpan: 2 },
    { key: "notes", label: t("form.notes"), type: "textarea", gridSpan: 2 },
    { key: "isCash", label: t("form.isCash"), type: "checkbox" },
  ] }), [t, partnerOptions, filteredCategoryOptions]);

  const handleChange = useCallback((key: string, value: unknown): void => {
    setValues((prev) => { const next = { ...prev, [key]: value }; if (key === "cashflowType") { next.categoryId = null; } return next; });
    if (errors[key]) { setErrors((prev) => { const next = { ...prev }; delete next[key]; return next; }); }
  }, [errors]);

  const handleSave = useCallback(async (): Promise<void> => {
    try {
      if (isNew) {
        const newErrors: Record<string, string> = {};
        if (!values.cashflowType) newErrors.cashflowType = t("form.type");
        if (!values.amount) newErrors.amount = t("form.amount");
        if (!values.date) newErrors.date = t("form.date");
        if (Object.keys(newErrors).length > 0) { setErrors(newErrors); return; }
        const result = await createCashFlow({ cashflowType: String(values.cashflowType) as CashFlowType, categoryId: values.categoryId ? String(values.categoryId) : null, amount: String(values.amount), date: String(values.date), dueDate: values.dueDate ? String(values.dueDate) : null, partnerId: values.partnerId ? String(values.partnerId) : null, description: values.description ? String(values.description) : null, notes: values.notes ? String(values.notes) : null, isCash: Boolean(values.isCash) });
        if ("error" in result) { toast.error(t("messages.saveFailed")); return; }
        toast.success(t("messages.created"));
        router.push("/finance/cashflow/" + result.id);
      } else {
        const result = await updateCashFlow(id, { categoryId: values.categoryId ? String(values.categoryId) : null, amount: values.amount ? String(values.amount) : undefined, date: values.date ? String(values.date) : undefined, dueDate: values.dueDate ? String(values.dueDate) : null, partnerId: values.partnerId ? String(values.partnerId) : null, description: values.description ? String(values.description) : null, notes: values.notes ? String(values.notes) : null, isCash: Boolean(values.isCash) });
        if ("error" in result) { toast.error(result.error === "CASHFLOW_NOT_EDITABLE" ? t("messages.notEditable") : t("messages.saveFailed")); return; }
        toast.success(t("messages.saved")); mutate();
      }
    } catch (error: unknown) { console.error("Failed to save cashflow:", error); toast.error(t("messages.saveFailed")); }
  }, [isNew, id, values, router, t, mutate]);

  const handleDelete = useCallback(async (): Promise<void> => {
    try { const result = await deleteCashFlow(id); if ("error" in result) { toast.error(result.error === "CASHFLOW_NOT_DELETABLE" ? t("messages.onlyPlanned") : t("messages.deleteFailed")); return; } toast.success(t("messages.deleted")); router.push("/finance/cashflow"); }
    catch (error: unknown) { console.error("Failed to delete cashflow:", error); toast.error(t("messages.deleteFailed")); }
  }, [id, router, t]);

  const handleMarkPending = useCallback(async (): Promise<void> => { setIsTransitioning(true); try { const result = await updateCashFlow(id, { status: "pending" }); if (result && typeof result === "object" && "error" in result) { toast.error(t("messages.statusFailed")); } else { toast.success(t("messages.saved")); mutate(); } } catch { toast.error(t("messages.statusFailed")); } finally { setIsTransitioning(false); } }, [id, t, mutate]);
  const handleMarkPaid = useCallback(async (): Promise<void> => { setIsTransitioning(true); try { const result = await markCashFlowPaid(id); if (result && typeof result === "object" && "error" in result) { toast.error(t("messages.statusFailed")); } else { toast.success(t("messages.paid")); mutate(); } } catch { toast.error(t("messages.statusFailed")); } finally { setIsTransitioning(false); } }, [id, t, mutate]);
  const handleCancelCF = useCallback(async (): Promise<void> => { setIsTransitioning(true); try { const result = await cancelCashFlow(id); if (result && typeof result === "object" && "error" in result) { toast.error(t("messages.statusFailed")); } else { toast.success(t("messages.cancelled")); mutate(); } } catch { toast.error(t("messages.statusFailed")); } finally { setIsTransitioning(false); } }, [id, t, mutate]);
  const handleCancel = useCallback((): void => { router.push("/finance/cashflow"); }, [router]);

  const dvActions: DetailViewAction[] = useMemo(() => {
    if (isNew || cashflowDetail?.status !== "planned") return [];
    return [{ key: "delete", label: t("actions.delete"), icon: Trash2, variant: "destructive" as const, confirm: { title: tCommon("confirmDelete"), description: tCommon("confirmDeleteDescription") }, onClick: () => { void handleDelete(); } }];
  }, [isNew, cashflowDetail?.status, t, tCommon, handleDelete]);

  if (isNew) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <DetailView title={t("detail.newTitle")} backHref="/finance/cashflow" isLoading={false} onSave={() => { void handleSave(); }} onCancel={handleCancel} saveLabel={t("actions.save")} cancelLabel={t("actions.cancel")}>
          <FormSection section={createFormSection} values={values} errors={errors} mode="create" onChange={handleChange} />
        </DetailView>
      </div>
    );
  }

  const cf = cashflowDetail;
  const title = cf ? (cf.code ?? t("detail.title")) + (cf.partnerName ? " \u2014 " + cf.partnerName : "") : t("detail.title");

  return (
    <div className="flex flex-col gap-6 p-6">
      <DetailView title={title} backHref="/finance/cashflow" actions={dvActions} isLoading={isLoading} onSave={isEditable ? () => { void handleSave(); } : undefined} onCancel={handleCancel} saveLabel={t("actions.save")} cancelLabel={t("actions.cancel")}>
        {cf && (
          <div className="mb-4 flex items-center gap-3">
            <CashFlowTypeBadge cashflowType={cf.cashflowType} />
            <CashFlowStatusBadge status={cf.status} />
            <CashFlowStatusActionsBar currentStatus={cf.status} isLoading={isTransitioning} onMarkPending={handleMarkPending} onMarkPaid={handleMarkPaid} onCancel={handleCancelCF} />
          </div>
        )}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList>
            <TabsTrigger value="detail">{t("tabs.detail")}</TabsTrigger>
            <TabsTrigger value="crossLinks">{t("tabs.crossLinks")}</TabsTrigger>
          </TabsList>
          <TabsContent value="detail" className="mt-4">
            <FormSection section={editFormSection} values={values} errors={errors} mode={mode} onChange={handleChange} />
          </TabsContent>
          <TabsContent value="crossLinks" className="mt-4">
            <Card>
              <CardHeader><CardTitle className="text-base">{t("crossLinks.title")}</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {cf?.orderId ? (<div className="flex items-center gap-3"><p className="text-sm text-muted-foreground">{t("crossLinks.order")}</p><Button variant="outline" size="sm" asChild><Link href={"/sales/orders/" + cf.orderId}><ExternalLink className="mr-1 size-4" />{t("crossLinks.viewOrder")}</Link></Button></div>) : null}
                {cf?.stockIssueId ? (<div className="flex items-center gap-3"><p className="text-sm text-muted-foreground">{t("crossLinks.stockIssue")}</p><Button variant="outline" size="sm" asChild><Link href={"/stock/issues/" + cf.stockIssueId}><ExternalLink className="mr-1 size-4" />{t("crossLinks.viewStockIssue")}</Link></Button></div>) : null}
                {!cf?.orderId && !cf?.stockIssueId && (<p className="text-sm text-muted-foreground">{t("crossLinks.noLinks")}</p>)}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </DetailView>
    </div>
  );
}

interface CashFlowStatusActionsBarProps { currentStatus: string; isLoading: boolean; onMarkPending: () => Promise<void>; onMarkPaid: () => Promise<void>; onCancel: () => Promise<void>; }

function CashFlowStatusActionsBar({ currentStatus, isLoading, onMarkPending, onMarkPaid, onCancel }: CashFlowStatusActionsBarProps): React.ReactNode {
  const t = useTranslations("cashflows");
  if (currentStatus === "paid" || currentStatus === "cancelled") return null;
  return (
    <div className="flex items-center gap-2">
      {currentStatus === "planned" && (<><Button size="sm" variant="outline" onClick={() => void onMarkPending()} disabled={isLoading}><Clock className="mr-1 size-4" />{t("actions.markPending")}</Button><Button size="sm" onClick={() => void onMarkPaid()} disabled={isLoading}><Check className="mr-1 size-4" />{t("actions.markPaid")}</Button><CancelCashFlowButton isLoading={isLoading} onConfirm={onCancel} /></>)}
      {currentStatus === "pending" && (<><Button size="sm" onClick={() => void onMarkPaid()} disabled={isLoading}><Check className="mr-1 size-4" />{t("actions.markPaid")}</Button><CancelCashFlowButton isLoading={isLoading} onConfirm={onCancel} /></>)}
    </div>
  );
}

interface CancelCashFlowButtonProps { isLoading: boolean; onConfirm: () => Promise<void>; }

function CancelCashFlowButton({ isLoading, onConfirm }: CancelCashFlowButtonProps): React.ReactNode {
  const t = useTranslations("cashflows");
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild><Button size="sm" variant="outline" disabled={isLoading}><XCircle className="mr-1 size-4" />{t("actions.cancelCashFlow")}</Button></AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>{t("actions.cancelCashFlow")}</AlertDialogTitle><AlertDialogDescription>{t("templates.deleteConfirm")}</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>{t("actions.cancel")}</AlertDialogCancel><AlertDialogAction onClick={() => void onConfirm()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{t("actions.cancelCashFlow")}</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
