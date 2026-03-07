"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Pencil, Trash2 } from "lucide-react";
import {
  listTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
} from "../actions";
import type { CashflowTemplate } from "../actions";

// ── Tree helpers ─────────────────────────────────────────────

interface TreeNode {
  template: CashflowTemplate;
  children: TreeNode[];
  depth: number;
}

function buildTree(templates: CashflowTemplate[]): TreeNode[] {
  const active = templates.filter((t) => t.isActive !== false);
  const map = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  for (const tmpl of active) {
    map.set(tmpl.id, { template: tmpl, children: [], depth: 0 });
  }

  for (const tmpl of active) {
    const node = map.get(tmpl.id)!;
    if (tmpl.parentId && map.has(tmpl.parentId)) {
      const parent = map.get(tmpl.parentId)!;
      parent.children.push(node);
      node.depth = parent.depth + 1;
    } else {
      roots.push(node);
    }
  }

  return roots;
}

function flattenTree(nodes: TreeNode[]): TreeNode[] {
  const result: TreeNode[] = [];
  for (const node of nodes) {
    result.push(node);
    if (node.children.length > 0) {
      result.push(...flattenTree(node.children));
    }
  }
  return result;
}

// ── Component ────────────────────────────────────────────────

export function TemplateBrowser(): React.ReactNode {
  const t = useTranslations("admin.templates");
  const [templates, setTemplates] = useState<CashflowTemplate[]>([]);
  const [activeTab, setActiveTab] = useState<"income" | "expense">("income");

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState<"income" | "expense">("income");
  const [formParentId, setFormParentId] = useState<string | null>(null);
  const [formSortOrder, setFormSortOrder] = useState(0);

  const loadData = useCallback(async (): Promise<void> => {
    try {
      const data = await listTemplates();
      setTemplates(data);
    } catch {
      console.error("Failed to load templates");
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // ── Derived data ─────────────────────────────────────────

  const active = templates.filter((t) => t.isActive !== false);
  const incomeTemplates = active.filter((t) => t.cashflowType === "income");
  const expenseTemplates = active.filter((t) => t.cashflowType === "expense");

  const incomeFlat = flattenTree(buildTree(incomeTemplates));
  const expenseFlat = flattenTree(buildTree(expenseTemplates));

  const currentFlat = activeTab === "income" ? incomeFlat : expenseFlat;

  /** Root templates for parent selection (same type, not self) */
  const parentOptions = active.filter(
    (t) => t.cashflowType === formType && t.parentId === null && t.id !== editId
  );

  // ── Handlers ─────────────────────────────────────────────

  function openCreate(): void {
    setEditId(null);
    setFormName("");
    setFormType(activeTab);
    setFormParentId(null);
    setFormSortOrder(0);
    setDialogOpen(true);
  }

  function openEdit(tmpl: CashflowTemplate): void {
    setEditId(tmpl.id);
    setFormName(tmpl.name);
    setFormType(tmpl.cashflowType as "income" | "expense");
    setFormParentId(tmpl.parentId);
    setFormSortOrder(tmpl.sortOrder ?? 0);
    setDialogOpen(true);
  }

  async function handleSave(): Promise<void> {
    try {
      if (editId) {
        await updateTemplate(editId, {
          name: formName.trim(),
          sortOrder: formSortOrder,
        });
      } else {
        await createTemplate({
          name: formName.trim(),
          cashflowType: formType,
          parentId: formParentId ?? undefined,
          sortOrder: formSortOrder,
        });
      }
      setDialogOpen(false);
      void loadData();
    } catch {
      console.error("Failed to save template");
    }
  }

  async function handleDelete(id: string): Promise<void> {
    try {
      await deleteTemplate(id);
      void loadData();
    } catch {
      console.error("Failed to delete template");
    }
  }

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("description")}
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="mr-1.5 h-4 w-4" />
          {t("addRoot")}
        </Button>
      </div>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(val) => setActiveTab(val as "income" | "expense")}
      >
        <TabsList>
          <TabsTrigger value="income">{t("income")}</TabsTrigger>
          <TabsTrigger value="expense">{t("expense")}</TabsTrigger>
        </TabsList>

        <TabsContent value="income">
          <TemplateList
            items={currentFlat}
            onEdit={openEdit}
            onDelete={handleDelete}
            t={t}
          />
        </TabsContent>

        <TabsContent value="expense">
          <TemplateList
            items={expenseFlat}
            onEdit={openEdit}
            onDelete={handleDelete}
            t={t}
          />
        </TabsContent>
      </Tabs>

      {active.length === 0 && (
        <div className="rounded-md border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">{t("noTemplates")}</p>
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editId ? t("editCategory") : t("newCategory")}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Name */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">{t("name")}</Label>
              <Input
                className="col-span-3"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>

            {/* Type (only on create) */}
            {!editId && (
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">{t("type")}</Label>
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
                    <SelectItem value="income">{t("income")}</SelectItem>
                    <SelectItem value="expense">{t("expense")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Parent category */}
            {!editId && (
              <div className="grid grid-cols-4 items-center gap-4">
                <Label className="text-right">{t("parent")}</Label>
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
                      {t("parentNone")}
                    </SelectItem>
                    {parentOptions.map((opt) => (
                      <SelectItem key={opt.id} value={opt.id}>
                        {opt.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Sort order */}
            <div className="grid grid-cols-4 items-center gap-4">
              <Label className="text-right">{t("sortOrder")}</Label>
              <Input
                className="col-span-3"
                type="number"
                value={formSortOrder}
                onChange={(e) =>
                  setFormSortOrder(parseInt(e.target.value, 10) || 0)
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
            >
              {t("cancel")}
            </Button>
            <Button onClick={() => void handleSave()}>
              {t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Sub-component: template list ─────────────────────────────

interface TemplateListProps {
  items: TreeNode[];
  onEdit: (tmpl: CashflowTemplate) => void;
  onDelete: (id: string) => void;
  t: ReturnType<typeof useTranslations<"admin.templates">>;
}

function TemplateList({
  items,
  onEdit,
  onDelete,
  t,
}: TemplateListProps): React.ReactNode {
  if (items.length === 0) {
    return (
      <div className="py-8 text-center text-sm text-muted-foreground">
        {t("noTemplates")}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {items.map((node) => (
        <div
          key={node.template.id}
          className="flex items-center gap-2 rounded-md border px-3 py-2 hover:bg-muted/50"
          style={{ paddingLeft: `${node.depth * 24 + 12}px` }}
        >
          <span className="flex-1 text-sm font-medium">
            {node.template.name}
          </span>

          <span className="text-xs text-muted-foreground">
            #{node.template.sortOrder}
          </span>

          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => onEdit(node.template)}
            title={t("edit")}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive hover:text-destructive"
            onClick={() => void onDelete(node.template.id)}
            title={t("delete")}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
    </div>
  );
}
