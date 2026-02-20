"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Trash2, ExternalLink } from "lucide-react";
import { toast } from "sonner";

import { DetailView } from "@/components/detail-view";
import { FormSection } from "@/components/forms";
import type { FormSectionDef, FormMode } from "@/components/forms";
import type { DetailViewAction } from "@/components/detail-view";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";

import { useOrderDetail } from "../hooks";
import {
  createOrder,
  updateOrder,
  deleteOrder,
  getPartnerOptions,
  getContactOptions,
  getShopOptions,
  getWarehouseOptions,
} from "../actions";
import { OrderStatusBadge } from "./OrderStatusBadge";
import { OrderStatusActions } from "./OrderStatusActions";
import { OrderItemsTable } from "./OrderItemsTable";
import { OrderSummary } from "./OrderSummary";
import { CreateStockIssueDialog } from "./CreateStockIssueDialog";

// ── Types ────────────────────────────────────────────────────

interface OrderDetailProps {
  id: string;
}

// ── Component ────────────────────────────────────────────────

export function OrderDetail({ id }: OrderDetailProps): React.ReactNode {
  const t = useTranslations("orders");
  const tCommon = useTranslations("common");
  const router = useRouter();

  const isNew = id === "new";
  const { data: orderDetail, isLoading, mutate } = useOrderDetail(id);

  // Options for selects
  const [partnerOptions, setPartnerOptions] = useState<
    Array<{ value: string; label: string }>
  >([]);
  const [contactOptions, setContactOptions] = useState<
    Array<{ value: string; label: string }>
  >([]);
  const [shopOptions, setShopOptions] = useState<
    Array<{ value: string; label: string }>
  >([]);
  const [warehouseOptions, setWarehouseOptions] = useState<
    Array<{ value: string; label: string }>
  >([]);

  // Form values
  const [values, setValues] = useState<Record<string, unknown>>({
    partnerId: null,
    contactId: null,
    orderDate: new Date().toISOString().slice(0, 10),
    deliveryDate: null,
    shopId: null,
    warehouseId: null,
    notes: null,
    internalNotes: null,
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState("header");

  // Load select options on mount
  useEffect(() => {
    let cancelled = false;

    Promise.all([getPartnerOptions(), getShopOptions(), getWarehouseOptions()])
      .then(([partOpts, shopOpts, whOpts]) => {
        if (!cancelled) {
          setPartnerOptions(partOpts);
          setShopOptions(shopOpts);
          setWarehouseOptions(whOpts);
        }
      })
      .catch((error: unknown) => {
        console.error("Failed to load options:", error);
      });

    return (): void => {
      cancelled = true;
    };
  }, []);

  // Load contact options when partnerId changes
  useEffect(() => {
    const partnerId = values.partnerId;
    if (!partnerId || typeof partnerId !== "string") {
      setContactOptions([]);
      return;
    }

    let cancelled = false;
    getContactOptions(partnerId)
      .then((opts) => {
        if (!cancelled) {
          setContactOptions(opts);
        }
      })
      .catch((error: unknown) => {
        console.error("Failed to load contact options:", error);
      });

    return (): void => {
      cancelled = true;
    };
  }, [values.partnerId]);

  // Populate form when data loads (edit mode)
  useEffect(() => {
    if (orderDetail) {
      setValues({
        orderNumber: orderDetail.orderNumber,
        partnerId: orderDetail.partnerId,
        partnerName: orderDetail.partnerName,
        contactId: orderDetail.contactId,
        orderDate: orderDetail.orderDate
          ? new Date(orderDetail.orderDate).toISOString().split("T")[0]
          : null,
        deliveryDate: orderDetail.deliveryDate
          ? new Date(orderDetail.deliveryDate).toISOString().split("T")[0]
          : null,
        shopId: orderDetail.shopId,
        warehouseId: orderDetail.warehouseId,
        notes: orderDetail.notes,
        internalNotes: orderDetail.internalNotes,
      });
    }
  }, [orderDetail]);

  const isDraft = isNew || orderDetail?.status === "draft";
  const mode: FormMode = isDraft ? "edit" : "readonly";

  // ── Create form section ──────────────────────────────────

  const createFormSection: FormSectionDef = useMemo(
    () => ({
      title: t("detail.newTitle"),
      columns: 2,
      fields: [
        {
          key: "partnerId",
          label: t("form.partner"),
          type: "select",
          options: partnerOptions,
          placeholder: t("form.partnerPlaceholder"),
          required: true,
        },
        {
          key: "orderDate",
          label: t("form.orderDate"),
          type: "date",
        },
        {
          key: "deliveryDate",
          label: t("form.deliveryDate"),
          type: "date",
        },
        {
          key: "shopId",
          label: t("form.shop"),
          type: "select",
          options: shopOptions,
          placeholder: t("form.shopPlaceholder"),
        },
        {
          key: "warehouseId",
          label: t("form.warehouse"),
          type: "select",
          options: warehouseOptions,
          placeholder: t("form.warehousePlaceholder"),
        },
        {
          key: "notes",
          label: t("form.notes"),
          type: "textarea",
          gridSpan: 2,
        },
        {
          key: "internalNotes",
          label: t("form.internalNotes"),
          type: "textarea",
          gridSpan: 2,
        },
      ],
    }),
    [t, partnerOptions, shopOptions, warehouseOptions]
  );

  // ── Edit form section (header tab) ──────────────────────

  const editFormSection: FormSectionDef = useMemo(
    () => ({
      title: t("tabs.header"),
      columns: 2,
      fields: [
        {
          key: "orderNumber",
          label: t("form.orderNumber"),
          type: "text",
          disabled: true,
        },
        {
          key: "partnerId",
          label: t("form.partner"),
          type: isDraft ? "select" : "text",
          options: isDraft ? partnerOptions : undefined,
          placeholder: t("form.partnerPlaceholder"),
          disabled: !isDraft,
          // In non-draft mode, show partner name as text
          ...(isDraft ? {} : {}),
        },
        {
          key: "contactId",
          label: t("form.contact"),
          type: "select",
          options: contactOptions,
          placeholder: t("form.contactPlaceholder"),
        },
        {
          key: "orderDate",
          label: t("form.orderDate"),
          type: "date",
          disabled: !isDraft,
        },
        {
          key: "deliveryDate",
          label: t("form.deliveryDate"),
          type: "date",
        },
        {
          key: "shopId",
          label: t("form.shop"),
          type: "select",
          options: shopOptions,
          placeholder: t("form.shopPlaceholder"),
        },
        {
          key: "warehouseId",
          label: t("form.warehouse"),
          type: "select",
          options: warehouseOptions,
          placeholder: t("form.warehousePlaceholder"),
        },
        {
          key: "notes",
          label: t("form.notes"),
          type: "textarea",
          gridSpan: 2,
        },
        {
          key: "internalNotes",
          label: t("form.internalNotes"),
          type: "textarea",
          gridSpan: 2,
        },
      ],
    }),
    [t, isDraft, partnerOptions, contactOptions, shopOptions, warehouseOptions]
  );

  // ── Handlers ──────────────────────────────────────────────

  const handleChange = useCallback(
    (key: string, value: unknown): void => {
      setValues((prev) => ({ ...prev, [key]: value }));
      if (errors[key]) {
        setErrors((prev) => {
          const next = { ...prev };
          delete next[key];
          return next;
        });
      }
    },
    [errors]
  );

  const handleSave = useCallback(async (): Promise<void> => {
    try {
      if (isNew) {
        // Validate required fields
        if (!values.partnerId) {
          setErrors({ partnerId: t("form.partnerPlaceholder") });
          return;
        }

        const result = await createOrder({
          partnerId: String(values.partnerId),
          contactId: values.contactId ? String(values.contactId) : null,
          orderDate: values.orderDate ? String(values.orderDate) : undefined,
          deliveryDate: values.deliveryDate
            ? String(values.deliveryDate)
            : null,
          shopId: values.shopId ? String(values.shopId) : null,
          warehouseId: values.warehouseId
            ? String(values.warehouseId)
            : null,
          notes: values.notes ? String(values.notes) : null,
          internalNotes: values.internalNotes
            ? String(values.internalNotes)
            : null,
        });

        if ("error" in result) {
          toast.error(t("messages.saveFailed"));
          return;
        }

        toast.success(t("messages.created"));
        router.push(`/sales/orders/${result.id}`);
      } else {
        const result = await updateOrder(id, {
          partnerId: values.partnerId ? String(values.partnerId) : undefined,
          contactId: values.contactId ? String(values.contactId) : null,
          deliveryDate: values.deliveryDate
            ? String(values.deliveryDate)
            : null,
          shopId: values.shopId ? String(values.shopId) : null,
          warehouseId: values.warehouseId
            ? String(values.warehouseId)
            : null,
          notes: values.notes ? String(values.notes) : null,
          internalNotes: values.internalNotes
            ? String(values.internalNotes)
            : null,
        });

        if ("error" in result) {
          if (result.error === "NOT_DRAFT") {
            toast.error(t("messages.onlyDraft"));
          } else {
            toast.error(t("messages.saveFailed"));
          }
          return;
        }

        toast.success(t("messages.saved"));
        mutate();
      }
    } catch (error: unknown) {
      console.error("Failed to save order:", error);
      toast.error(t("messages.saveFailed"));
    }
  }, [isNew, id, values, router, t, mutate]);

  const handleDelete = useCallback(async (): Promise<void> => {
    try {
      const result = await deleteOrder(id);
      if ("error" in result) {
        if (result.error === "NOT_DRAFT") {
          toast.error(t("messages.onlyDraft"));
        } else {
          toast.error(t("messages.deleteError"));
        }
        return;
      }
      toast.success(t("messages.deleted"));
      router.push("/sales/orders");
    } catch (error: unknown) {
      console.error("Failed to delete order:", error);
      toast.error(t("messages.deleteError"));
    }
  }, [id, router, t]);

  const handleCancel = useCallback((): void => {
    router.push("/sales/orders");
  }, [router]);

  const handleTransition = useCallback((): void => {
    mutate();
  }, [mutate]);

  const handleItemsMutate = useCallback((): void => {
    mutate();
  }, [mutate]);

  // Header actions (delete only for draft edit mode)
  const actions: DetailViewAction[] = useMemo(() => {
    if (isNew || !isDraft) return [];
    return [
      {
        key: "delete",
        label: t("actions.delete"),
        icon: Trash2,
        variant: "destructive" as const,
        onClick: () => {
          void handleDelete();
        },
      },
    ];
  }, [isNew, isDraft, t, handleDelete]);

  // ── NEW mode ──────────────────────────────────────────────

  if (isNew) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <DetailView
          title={t("detail.newTitle")}
          backHref="/sales/orders"
          isLoading={false}
          onSave={() => {
            void handleSave();
          }}
          onCancel={handleCancel}
          saveLabel={t("actions.save")}
          cancelLabel={t("actions.cancel")}
        >
          <FormSection
            section={createFormSection}
            values={values}
            errors={errors}
            mode="create"
            onChange={handleChange}
          />
        </DetailView>
      </div>
    );
  }

  // ── EDIT mode ─────────────────────────────────────────────

  const order = orderDetail;
  const title = order
    ? `${order.orderNumber}${order.partnerName ? ` — ${order.partnerName}` : ""}`
    : t("detail.title");

  return (
    <div className="flex flex-col gap-6 p-6">
      <DetailView
        title={title}
        backHref="/sales/orders"
        actions={actions}
        isLoading={isLoading}
        onSave={
          isDraft
            ? () => {
                void handleSave();
              }
            : undefined
        }
        onCancel={handleCancel}
        saveLabel={t("actions.save")}
        cancelLabel={t("actions.cancel")}
      >
        {/* Status badge and status actions */}
        {order && (
          <div className="mb-4 flex items-center gap-3">
            <OrderStatusBadge status={order.status} />
            <OrderStatusActions
              orderId={id}
              currentStatus={order.status}
              hasItems={(order.items ?? []).length > 0}
              onTransition={handleTransition}
            />
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList>
            <TabsTrigger value="header">{t("tabs.header")}</TabsTrigger>
            <TabsTrigger value="items">{t("tabs.items")}</TabsTrigger>
            <TabsTrigger value="stockIssue">
              {t("tabs.stockIssue")}
            </TabsTrigger>
            <TabsTrigger value="cashflow">{t("tabs.cashflow")}</TabsTrigger>
          </TabsList>

          {/* Tab 1: Header */}
          <TabsContent value="header" className="mt-4">
            <FormSection
              section={editFormSection}
              values={values}
              errors={errors}
              mode={mode}
              onChange={handleChange}
            />
          </TabsContent>

          {/* Tab 2: Items + Summary */}
          <TabsContent value="items" className="mt-4">
            <div className="space-y-6">
              <OrderItemsTable
                orderId={id}
                items={order?.items ?? []}
                isDraft={isDraft}
                onMutate={handleItemsMutate}
              />
              {order && (
                <OrderSummary
                  totalExclVat={order.totalExclVat}
                  totalVat={order.totalVat}
                  totalInclVat={order.totalInclVat}
                  totalDeposit={order.totalDeposit}
                />
              )}
            </div>
          </TabsContent>

          {/* Tab 3: Stock Issue */}
          <TabsContent value="stockIssue" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {t("stockIssueTab.title")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {order?.stockIssueId ? (
                  <div className="flex items-center gap-3">
                    <p className="text-sm text-muted-foreground">
                      {t("stockIssueTab.linked")}
                    </p>
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/stock/issues/${order.stockIssueId}`}>
                        <ExternalLink className="mr-1 size-4" />
                        {t("stockIssueTab.viewIssue")}
                      </Link>
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">
                        {t("stockIssueTab.noIssue")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {t("stockIssueTab.createHint")}
                      </p>
                    </div>
                    {order && order.status !== "draft" && order.status !== "cancelled" && (
                      <CreateStockIssueDialog
                        orderId={id}
                        onCreated={() => mutate()}
                      />
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab 4: Cash Flow */}
          <TabsContent value="cashflow" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {t("cashflowTab.title")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {order?.cashflowId ? (
                  <div className="flex items-center gap-3">
                    <p className="text-sm text-muted-foreground">
                      {t("cashflowTab.linked")}
                    </p>
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/finance/cashflow/${order.cashflowId}`}>
                        <ExternalLink className="mr-1 size-4" />
                        {t("cashflowTab.viewCashflow")}
                      </Link>
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">
                      {t("cashflowTab.noCashflow")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t("cashflowTab.createHint")}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </DetailView>
    </div>
  );
}
