"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Plus, Pencil, Lock, Trash2 } from "lucide-react";

import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  seedCategories,
} from "../actions";
import type {
  CashFlowCategory,
  CreateCategoryInput,
  UpdateCategoryInput,
} from "../types";

// ── Tree builder ───────────────────────────────────────────────

function buildTree(categories: CashFlowCategory[]): CashFlowCategory[] {
  const map = new Map<string, CashFlowCategory>();
  const roots: CashFlowCategory[] = [];

  for (const cat of categories) {
    map.set(cat.id, { ...cat, children: [], depth: 0 });
  }

  for (const cat of categories) {
    const node = map.get(cat.id)!;
    if (cat.parentId && map.has(cat.parentId)) {
      const parent = map.get(cat.parentId)!;
      parent.children!.push(node);
      node.depth = (parent.depth ?? 0) + 1;
    } else {
      roots.push(node);
    }
  }

  return roots;
}

/** Flatten tree into a list with depth info for rendering. */
function flattenTree(nodes: CashFlowCategory[], depth: number = 0): CashFlowCategory[] {
  const result: CashFlowCategory[] = [];
  for (const node of nodes) {
    result.push({ ...node, depth });
    if (node.children && node.children.length > 0) {
      result.push(...flattenTree(node.children, depth + 1));
    }
  }
  return result;
}

// ── Component ──────────────────────────────────────────────────

export function CategoryManager(): React.ReactNode {
  const t = useTranslations("cashflowCategories");

  const [categories, setCategories] = useState<CashFlowCategory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"income" | "expense">("income");

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formParentId, setFormParentId] = useState<string | null>(null);
  const [formType, setFormType] = useState<"income" | "expense">("income");
  const [isSaving, setIsSaving] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);

  // ── Data loading ───────────────────────────────────────────

  const load = useCallback(async (): Promise<void> => {
    try {
      const data = await getCategories();
      setCategories(data);
    } catch {
      setCategories([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // ── Derived data ───────────────────────────────────────────

  const incomeCategories = categories.filter((c) => c.cashflowType === "income");
  const expenseCategories = categories.filter((c) => c.cashflowType === "expense");

  const incomeTree = buildTree(incomeCategories);
  const expenseTree = buildTree(expenseCategories);

  const incomeFlat = flattenTree(incomeTree);
  const expenseFlat = flattenTree(expenseTree);

  const currentFlat = activeTab === "income" ? incomeFlat : expenseFlat;

  /** Root categories for parent selection in dialog (same type, no children of the selected) */
  const parentOptions = categories.filter(
    (c) => c.cashflowType === formType && c.parentId === null && c.id !== editingId
  );

  // ── Handlers ───────────────────────────────────────────────

  const handleOpenCreate = useCallback((): void => {
    setEditingId(null);
    setFormName("");
    setFormParentId(null);
    setFormType(activeTab);
    setDialogOpen(true);
  }, [activeTab]);

  const handleOpenEdit = useCallback((cat: CashFlowCategory): void => {
    setEditingId(cat.id);
    setFormName(cat.name);
    setFormParentId(cat.parentId);
    setFormType(cat.cashflowType);
    setDialogOpen(true);
  }, []);

  const handleSave = useCallback(async (): Promise<void> => {
    if (!formName.trim()) {
      toast.error(t("messages.nameRequired"));
      return;
    }

    setIsSaving(true);
    try {
      if (editingId) {
        // Update
        const updateData: UpdateCategoryInput = {
          name: formName.trim(),
          parentId: formParentId,
        };
        const result = await updateCategory(editingId, updateData);
        if ("error" in result) {
          if (result.error === "SYSTEM_CATEGORY") {
            toast.error(t("messages.systemCategory"));
          } else {
            toast.error(t("messages.saveFailed"));
          }
          return;
        }
        toast.success(t("messages.saved"));
      } else {
        // Create
        const createData: CreateCategoryInput = {
          name: formName.trim(),
          parentId: formParentId,
          cashflowType: formType,
        };
        const result = await createCategory(createData);
        if ("error" in result) {
          toast.error(t("messages.saveFailed"));
          return;
        }
        toast.success(t("messages.saved"));
      }

      setDialogOpen(false);
      await load();
    } catch {
      toast.error(t("messages.saveFailed"));
    } finally {
      setIsSaving(false);
    }
  }, [editingId, formName, formParentId, formType, load, t]);

  const handleDelete = useCallback(
    async (cat: CashFlowCategory): Promise<void> => {
      if (cat.isSystem) {
        toast.error(t("messages.systemCategory"));
        return;
      }

      try {
        const result = await deleteCategory(cat.id);
        if ("error" in result) {
          if (result.error === "HAS_CHILDREN") {
            toast.error(t("messages.hasChildren"));
          } else if (result.error === "SYSTEM_CATEGORY") {
            toast.error(t("messages.systemCategory"));
          } else {
            toast.error(t("messages.deleteFailed"));
          }
          return;
        }
        toast.success(t("messages.deleted"));
        await load();
      } catch {
        toast.error(t("messages.deleteFailed"));
      }
    },
    [load, t]
  );

  const handleSeed = useCallback(async (): Promise<void> => {
    setIsSeeding(true);
    try {
      await seedCategories();
      toast.success(t("messages.seeded"));
      await load();
    } catch {
      toast.error(t("messages.seedFailed"));
    } finally {
      setIsSeeding(false);
    }
  }, [load, t]);

  // ── Loading state ──────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("description")}
        </p>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <Button onClick={handleOpenCreate} size="sm">
          <Plus className="mr-1 h-4 w-4" />
          {t("actions.add")}
        </Button>
        {categories.length === 0 && (
          <Button
            onClick={handleSeed}
            variant="outline"
            size="sm"
            disabled={isSeeding}
          >
            {t("actions.seed")}
          </Button>
        )}
      </div>

      {/* Tabs: Income / Expense */}
      <Tabs
        value={activeTab}
        onValueChange={(val) => setActiveTab(val as "income" | "expense")}
      >
        <TabsList>
          <TabsTrigger value="income">{t("tabs.income")}</TabsTrigger>
          <TabsTrigger value="expense">{t("tabs.expense")}</TabsTrigger>
        </TabsList>

        <TabsContent value="income">
          <CategoryList
            items={currentFlat}
            onEdit={handleOpenEdit}
            onDelete={handleDelete}
            t={t}
          />
        </TabsContent>

        <TabsContent value="expense">
          <CategoryList
            items={expenseFlat}
            onEdit={handleOpenEdit}
            onDelete={handleDelete}
            t={t}
          />
        </TabsContent>
      </Tabs>

      {/* Empty state hint */}
      {categories.length === 0 && (
        <div className="rounded-md border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("emptyHint")}
          </p>
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingId ? t("dialog.editTitle") : t("dialog.createTitle")}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Name */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">{t("dialog.name")}</Label>
              <Input
                className="col-span-3"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder={t("dialog.namePlaceholder")}
              />
            </div>

            {/* Type (only on create) */}
            {!editingId && (
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">{t("dialog.type")}</Label>
                <Select
                  value={formType}
                  onValueChange={(val) => {
                    setFormType(val as "income" | "expense");
                    setFormParentId(null);
                  }}
                >
                  <SelectTrigger className="col-span-3">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="income">
                      {t("dialog.typeIncome")}
                    </SelectItem>
                    <SelectItem value="expense">
                      {t("dialog.typeExpense")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Parent category */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">{t("dialog.parent")}</Label>
              <Select
                value={formParentId ?? "__none__"}
                onValueChange={(val) =>
                  setFormParentId(val === "__none__" ? null : val)
                }
              >
                <SelectTrigger className="col-span-3">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">
                    {t("dialog.parentNone")}
                  </SelectItem>
                  {parentOptions.map((opt) => (
                    <SelectItem key={opt.id} value={opt.id}>
                      {opt.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
            >
              {t("dialog.cancel")}
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {t("dialog.save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Sub-component: category list ─────────────────────────────

interface CategoryListProps {
  items: CashFlowCategory[];
  onEdit: (cat: CashFlowCategory) => void;
  onDelete: (cat: CashFlowCategory) => void;
  t: ReturnType<typeof useTranslations<"cashflowCategories">>;
}

function CategoryList({
  items,
  onEdit,
  onDelete,
  t,
}: CategoryListProps): React.ReactNode {
  if (items.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        {t("empty")}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {items.map((cat) => (
        <div
          key={cat.id}
          className="flex items-center gap-2 rounded-md border px-3 py-2 hover:bg-muted/50"
          style={{ paddingLeft: `${(cat.depth ?? 0) * 24 + 12}px` }}
        >
          {/* Name */}
          <span className="flex-1 text-sm font-medium">{cat.name}</span>

          {/* System badge */}
          {cat.isSystem && (
            <Badge variant="secondary" className="gap-1">
              <Lock className="h-3 w-3" />
              {t("badges.system")}
            </Badge>
          )}

          {/* Actions (only for non-system categories) */}
          {!cat.isSystem && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onEdit(cat)}
                title={t("actions.edit")}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:text-destructive"
                onClick={() => onDelete(cat)}
                title={t("messages.deleted")}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
