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
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil, Trash2, ChevronRight } from "lucide-react";
import {
  listTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
} from "../actions";
import type { CashflowTemplate } from "../actions";

interface TreeNode {
  template: CashflowTemplate;
  children: TreeNode[];
}

function buildTree(templates: CashflowTemplate[]): TreeNode[] {
  const active = templates.filter((t) => t.isActive !== false);
  const map = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  for (const tmpl of active) {
    map.set(tmpl.id, { template: tmpl, children: [] });
  }

  for (const tmpl of active) {
    const node = map.get(tmpl.id)!;
    if (tmpl.parentId && map.has(tmpl.parentId)) {
      map.get(tmpl.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

interface EditDialogState {
  open: boolean;
  mode: "create" | "edit" | "child";
  parentId?: string;
  editId?: string;
  name: string;
  cashflowType: string;
  sortOrder: number;
}

const initialDialogState: EditDialogState = {
  open: false,
  mode: "create",
  name: "",
  cashflowType: "expense",
  sortOrder: 0,
};

export function TemplateBrowser(): React.ReactNode {
  const t = useTranslations("admin.templates");
  const [templates, setTemplates] = useState<CashflowTemplate[]>([]);
  const [dialog, setDialog] = useState<EditDialogState>(initialDialogState);

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

  function openCreate(): void {
    setDialog({
      ...initialDialogState,
      open: true,
      mode: "create",
    });
  }

  function openChild(parentId: string): void {
    const parent = templates.find((t) => t.id === parentId);
    setDialog({
      ...initialDialogState,
      open: true,
      mode: "child",
      parentId,
      cashflowType: parent?.cashflowType ?? "expense",
    });
  }

  function openEdit(tmpl: CashflowTemplate): void {
    setDialog({
      open: true,
      mode: "edit",
      editId: tmpl.id,
      name: tmpl.name,
      cashflowType: tmpl.cashflowType,
      sortOrder: tmpl.sortOrder ?? 0,
    });
  }

  async function handleSave(): Promise<void> {
    try {
      if (dialog.mode === "edit" && dialog.editId) {
        await updateTemplate(dialog.editId, {
          name: dialog.name,
          sortOrder: dialog.sortOrder,
        });
      } else {
        await createTemplate({
          name: dialog.name,
          cashflowType: dialog.cashflowType,
          parentId: dialog.parentId,
          sortOrder: dialog.sortOrder,
        });
      }
      setDialog(initialDialogState);
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

  function renderNode(node: TreeNode, depth: number): React.ReactNode {
    const tmpl = node.template;
    return (
      <div key={tmpl.id}>
        <div
          className="flex items-center gap-2 py-2 px-3 hover:bg-muted/50 rounded-md"
          style={{ paddingLeft: `${depth * 24 + 12}px` }}
        >
          {node.children.length > 0 && (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="flex-1 text-sm">{tmpl.name}</span>
          <Badge variant="outline" className="text-xs">
            {tmpl.cashflowType === "income" ? t("income") : t("expense")}
          </Badge>
          <span className="text-xs text-muted-foreground">
            #{tmpl.sortOrder}
          </span>
          {depth === 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => openChild(tmpl.id)}
              title={t("addChild")}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openEdit(tmpl)}
            title={t("edit")}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void handleDelete(tmpl.id)}
            title={t("delete")}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
        {node.children.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  }

  const tree = buildTree(templates);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <Button size="sm" onClick={openCreate}>
          <Plus className="mr-1.5 h-4 w-4" />
          {t("addRoot")}
        </Button>
      </div>

      {tree.length === 0 ? (
        <p className="text-muted-foreground">{t("noTemplates")}</p>
      ) : (
        <div className="border rounded-md divide-y">
          {tree.map((node) => renderNode(node, 0))}
        </div>
      )}

      <Dialog
        open={dialog.open}
        onOpenChange={(open) =>
          setDialog((prev) => ({ ...prev, open }))
        }
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dialog.mode === "edit"
                ? t("editCategory")
                : dialog.mode === "child"
                  ? t("newSubcategory")
                  : t("newCategory")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{t("name")}</Label>
              <Input
                value={dialog.name}
                onChange={(e) =>
                  setDialog((prev) => ({ ...prev, name: e.target.value }))
                }
              />
            </div>
            {dialog.mode !== "edit" && dialog.mode !== "child" && (
              <div className="space-y-2">
                <Label>{t("type")}</Label>
                <Select
                  value={dialog.cashflowType}
                  onValueChange={(v) =>
                    setDialog((prev) => ({ ...prev, cashflowType: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="income">{t("income")}</SelectItem>
                    <SelectItem value="expense">{t("expense")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>{t("sortOrder")}</Label>
              <Input
                type="number"
                value={dialog.sortOrder}
                onChange={(e) =>
                  setDialog((prev) => ({
                    ...prev,
                    sortOrder: parseInt(e.target.value, 10) || 0,
                  }))
                }
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => setDialog(initialDialogState)}
              >
                {t("cancel")}
              </Button>
              <Button onClick={() => void handleSave()}>
                {t("save")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
