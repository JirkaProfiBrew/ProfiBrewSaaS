"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { DetailView } from "@/components/detail-view";
import { FormSection } from "@/components/forms";
import type { FormSectionDef, FormMode } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { usePartner, useContacts, useAddresses, useBankAccounts } from "../hooks";
import {
  createPartner,
  updatePartner,
  deletePartner,
  createContact,
  updateContact,
  deleteContact,
  createAddress,
  updateAddress,
  deleteAddress,
  createBankAccount,
  updateBankAccount,
  deleteBankAccount,
  lookupAres,
} from "../actions";
import type {
  Partner,
  Contact,
  ContactCreate,
  Address,
  AddressCreate,
  BankAccount,
  BankAccountCreate,
} from "../types";

// ── Props ───────────────────────────────────────────────────────

interface PartnerDetailProps {
  id: string;
  backHref?: string;
}

// ── Component ───────────────────────────────────────────────────

export function PartnerDetail({
  id,
  backHref = "/brewery/partners",
}: PartnerDetailProps): React.ReactNode {
  const t = useTranslations("partners");
  const tCommon = useTranslations("common");
  const router = useRouter();

  const isNew = id === "new";
  const { data: partner, isLoading } = usePartner(id);

  // ── Partner form state ──────────────────────────────────────

  const [values, setValues] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [aresLoading, setAresLoading] = useState(false);

  // Initialize form values from loaded partner
  useEffect(() => {
    if (isNew) {
      setValues({
        name: "",
        isCustomer: true,
        isSupplier: false,
        legalForm: "",
        ico: "",
        dic: "",
        email: "",
        phone: "",
        mobile: "",
        web: "",
        addressStreet: "",
        addressCity: "",
        addressZip: "",
        countryId: "",
        paymentTerms: 14,
        creditLimit: "",
        notes: "",
        isActive: true,
      });
    } else if (partner) {
      setValues({
        name: partner.name,
        isCustomer: partner.isCustomer,
        isSupplier: partner.isSupplier,
        legalForm: partner.legalForm ?? "",
        ico: partner.ico ?? "",
        dic: partner.dic ?? "",
        email: partner.email ?? "",
        phone: partner.phone ?? "",
        mobile: partner.mobile ?? "",
        web: partner.web ?? "",
        addressStreet: partner.addressStreet ?? "",
        addressCity: partner.addressCity ?? "",
        addressZip: partner.addressZip ?? "",
        countryId: partner.countryId ?? "",
        paymentTerms: partner.paymentTerms,
        creditLimit: partner.creditLimit ?? "",
        notes: partner.notes ?? "",
        isActive: partner.isActive,
      });
    }
  }, [partner, isNew]);

  const handleChange = useCallback((key: string, value: unknown): void => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  // ── Save handler ────────────────────────────────────────────

  const handleSave = useCallback(async (): Promise<void> => {
    const name = values["name"];
    if (!name || (typeof name === "string" && name.trim() === "")) {
      setErrors({ name: t("detail.fields.name") + " is required" });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: String(values["name"] ?? ""),
        isCustomer: values["isCustomer"] === true,
        isSupplier: values["isSupplier"] === true,
        legalForm: (values["legalForm"] as string) || null,
        ico: (values["ico"] as string) || null,
        dic: (values["dic"] as string) || null,
        legalFormCode: null,
        email: (values["email"] as string) || null,
        phone: (values["phone"] as string) || null,
        mobile: (values["mobile"] as string) || null,
        web: (values["web"] as string) || null,
        addressStreet: (values["addressStreet"] as string) || null,
        addressCity: (values["addressCity"] as string) || null,
        addressZip: (values["addressZip"] as string) || null,
        countryId: (values["countryId"] as string) || null,
        paymentTerms: typeof values["paymentTerms"] === "number" ? values["paymentTerms"] : 14,
        creditLimit: (values["creditLimit"] as string) || null,
        logoUrl: null,
        notes: (values["notes"] as string) || null,
        isActive: values["isActive"] === true,
      };

      if (isNew) {
        await createPartner(payload);
      } else {
        await updatePartner(id, payload);
      }
      toast.success(tCommon("saved"));
      router.push(backHref);
    } catch (err: unknown) {
      console.error("Failed to save partner:", err);
      toast.error(tCommon("saveFailed"));
    } finally {
      setSaving(false);
    }
  }, [values, isNew, id, router, backHref, t, tCommon]);

  // ── Delete handler ──────────────────────────────────────────

  const handleDelete = useCallback(async (): Promise<void> => {
    if (isNew) return;
    try {
      await deletePartner(id);
      toast.success(t("detail.actions.delete"));
      router.push(backHref);
    } catch (err: unknown) {
      console.error("Failed to delete partner:", err);
      toast.error(t("detail.actions.delete") + " failed");
    }
  }, [id, isNew, router, backHref, t]);

  // ── ARES lookup ─────────────────────────────────────────────

  const handleAresLookup = useCallback(async (): Promise<void> => {
    const ico = values["ico"];
    if (!ico || typeof ico !== "string" || !/^\d{8}$/.test(ico)) return;

    setAresLoading(true);
    try {
      const result = await lookupAres(ico);
      if (result) {
        setValues((prev) => ({
          ...prev,
          name: result.name || prev["name"],
          dic: result.dic || prev["dic"],
          addressStreet: result.street || prev["addressStreet"],
          addressCity: result.city || prev["addressCity"],
          addressZip: result.zip || prev["addressZip"],
          countryId: "CZ",
          legalForm: result.legalForm === "101" ? "individual" : "legal_entity",
        }));
        toast.success(t("detail.actions.aresSuccess"));
      } else {
        toast.error(t("detail.actions.aresNotFound"));
      }
    } catch {
      toast.error(t("detail.actions.aresError"));
    } finally {
      setAresLoading(false);
    }
  }, [values, t]);

  // ── Cancel handler ──────────────────────────────────────────

  const handleCancel = useCallback((): void => {
    router.push(backHref);
  }, [router, backHref]);

  // ── Form section definitions ────────────────────────────────

  const mode: FormMode = isNew ? "create" : "edit";
  const icoValue = values["ico"];
  const showAresButton =
    typeof icoValue === "string" && /^\d{8}$/.test(icoValue);

  const basicInfoSection: FormSectionDef = useMemo(
    () => ({
      columns: 4,
      fields: [
        {
          key: "name",
          label: t("detail.fields.name"),
          type: "text" as const,
          required: true,
          gridSpan: 2,
        },
        {
          key: "legalForm",
          label: t("detail.fields.legalForm"),
          type: "select" as const,
          options: [
            { value: "individual", label: t("detail.legalForm.individual") },
            { value: "legal_entity", label: t("detail.legalForm.legal_entity") },
          ],
        },
        {
          key: "ico",
          label: t("detail.fields.ico"),
          type: "text" as const,
          placeholder: "12345678",
        },
        {
          key: "dic",
          label: t("detail.fields.dic"),
          type: "text" as const,
          placeholder: "CZ12345678",
        },
        {
          key: "isCustomer",
          label: t("detail.fields.isCustomer"),
          type: "toggle" as const,
        },
        {
          key: "isSupplier",
          label: t("detail.fields.isSupplier"),
          type: "toggle" as const,
        },
        {
          key: "email",
          label: t("detail.fields.email"),
          type: "text" as const,
        },
        {
          key: "phone",
          label: t("detail.fields.phone"),
          type: "text" as const,
        },
        {
          key: "mobile",
          label: t("detail.fields.mobile"),
          type: "text" as const,
        },
        {
          key: "web",
          label: t("detail.fields.web"),
          type: "text" as const,
        },
        {
          key: "addressStreet",
          label: t("detail.fields.addressStreet"),
          type: "text" as const,
          gridSpan: 2,
        },
        {
          key: "addressCity",
          label: t("detail.fields.addressCity"),
          type: "text" as const,
        },
        {
          key: "addressZip",
          label: t("detail.fields.addressZip"),
          type: "text" as const,
        },
        {
          key: "countryId",
          label: t("detail.fields.countryId"),
          type: "select" as const,
          options: [
            { value: "CZ", label: "CZ" },
            { value: "SK", label: "SK" },
            { value: "PL", label: "PL" },
            { value: "DE", label: "DE" },
            { value: "AT", label: "AT" },
          ],
        },
        {
          key: "paymentTerms",
          label: t("detail.fields.paymentTerms"),
          type: "number" as const,
          suffix: "dní",
        },
        {
          key: "creditLimit",
          label: t("detail.fields.creditLimit"),
          type: "currency" as const,
          prefix: "CZK",
        },
      ],
    }),
    [t]
  );

  // ── Tabs ────────────────────────────────────────────────────

  const tabs = useMemo(
    () => [
      {
        key: "basic",
        label: t("detail.tabs.basic"),
        content: (
          <div className="space-y-6">
            <FormSection
              section={basicInfoSection}
              values={values}
              errors={errors}
              mode={mode}
              onChange={handleChange}
            />
            {showAresButton && (
              <Button
                type="button"
                variant="outline"
                onClick={() => { void handleAresLookup(); }}
                disabled={aresLoading}
              >
                {aresLoading ? tCommon("loading") : t("detail.actions.aresLookup")}
              </Button>
            )}
          </div>
        ),
      },
      {
        key: "contacts",
        label: t("detail.tabs.contacts"),
        content: <ContactsTab partnerId={id} />,
      },
      {
        key: "addresses",
        label: t("detail.tabs.addresses"),
        content: <AddressesTab partnerId={id} />,
      },
      {
        key: "bankAccounts",
        label: t("detail.tabs.bankAccounts"),
        content: <BankAccountsTab partnerId={id} />,
      },
      {
        key: "notes",
        label: t("detail.tabs.notes"),
        content: (
          <NotesTab
            notes={typeof values["notes"] === "string" ? values["notes"] : ""}
            onChange={(val) => handleChange("notes", val)}
            label={t("detail.fields.notes")}
          />
        ),
      },
    ],
    [
      t,
      tCommon,
      basicInfoSection,
      values,
      errors,
      mode,
      handleChange,
      showAresButton,
      handleAresLookup,
      aresLoading,
      id,
    ]
  );

  // ── Actions ─────────────────────────────────────────────────

  const actions = useMemo(() => {
    if (isNew) return [];
    return [
      {
        key: "delete",
        label: t("detail.actions.delete"),
        icon: Trash2,
        variant: "destructive" as const,
        onClick: handleDelete,
      },
    ];
  }, [isNew, t, handleDelete]);

  // ── Render ──────────────────────────────────────────────────

  const title = isNew
    ? t("detail.newTitle")
    : partner?.name ?? t("detail.title");

  return (
    <div className="p-6">
      <DetailView
        title={title}
        backHref={backHref}
        tabs={tabs}
        actions={actions}
        isLoading={!isNew && isLoading}
        onSave={handleSave}
        onCancel={handleCancel}
        saveLabel={saving ? tCommon("loading") : t("detail.actions.save")}
        cancelLabel={t("detail.actions.cancel")}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// CONTACTS TAB
// ═══════════════════════════════════════════════════════════════

function ContactsTab({ partnerId }: { partnerId: string }): React.ReactNode {
  const t = useTranslations("partners");
  const tCommon = useTranslations("common");
  const { data: contactsList, isLoading, mutate } = useContacts(partnerId);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [formValues, setFormValues] = useState<Record<string, unknown>>({});

  const isNewPartner = partnerId === "new";

  const handleFormChange = useCallback((key: string, value: unknown): void => {
    setFormValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const openCreate = useCallback((): void => {
    setEditingContact(null);
    setFormValues({
      name: "",
      position: "",
      email: "",
      phone: "",
      mobile: "",
      isPrimary: false,
      notes: "",
    });
    setDialogOpen(true);
  }, []);

  const openEdit = useCallback((contact: Contact): void => {
    setEditingContact(contact);
    setFormValues({
      name: contact.name,
      position: contact.position ?? "",
      email: contact.email ?? "",
      phone: contact.phone ?? "",
      mobile: contact.mobile ?? "",
      isPrimary: contact.isPrimary,
      notes: contact.notes ?? "",
    });
    setDialogOpen(true);
  }, []);

  const handleSave = useCallback(async (): Promise<void> => {
    try {
      if (editingContact) {
        await updateContact(editingContact.id, {
          partnerId,
          name: String(formValues["name"] ?? ""),
          position: (formValues["position"] as string) || null,
          email: (formValues["email"] as string) || null,
          phone: (formValues["phone"] as string) || null,
          mobile: (formValues["mobile"] as string) || null,
          isPrimary: formValues["isPrimary"] === true,
          notes: (formValues["notes"] as string) || null,
        });
      } else {
        const data: ContactCreate = {
          partnerId,
          name: String(formValues["name"] ?? ""),
          position: (formValues["position"] as string) || null,
          email: (formValues["email"] as string) || null,
          phone: (formValues["phone"] as string) || null,
          mobile: (formValues["mobile"] as string) || null,
          isPrimary: formValues["isPrimary"] === true,
          notes: (formValues["notes"] as string) || null,
        };
        await createContact(data);
      }
      setDialogOpen(false);
      mutate();
    } catch (err: unknown) {
      console.error("Failed to save contact:", err);
      toast.error(tCommon("save") + " failed");
    }
  }, [editingContact, formValues, partnerId, mutate, tCommon]);

  const handleDeleteContact = useCallback(
    async (contactId: string): Promise<void> => {
      try {
        await deleteContact(contactId);
        mutate();
      } catch (err: unknown) {
        console.error("Failed to delete contact:", err);
        toast.error(tCommon("delete") + " failed");
      }
    },
    [mutate, tCommon]
  );

  const contactFormSection: FormSectionDef = useMemo(
    () => ({
      columns: 2,
      fields: [
        { key: "name", label: t("contacts.fields.name"), type: "text" as const, required: true, gridSpan: 2 },
        { key: "position", label: t("contacts.fields.position"), type: "text" as const },
        { key: "email", label: t("contacts.fields.email"), type: "text" as const },
        { key: "phone", label: t("contacts.fields.phone"), type: "text" as const },
        { key: "mobile", label: t("contacts.fields.mobile"), type: "text" as const },
        { key: "isPrimary", label: t("contacts.fields.isPrimary"), type: "toggle" as const },
        { key: "notes", label: t("contacts.fields.notes"), type: "textarea" as const, gridSpan: 2 },
      ],
    }),
    [t]
  );

  if (isNewPartner) {
    return (
      <p className="text-muted-foreground text-sm">
        {tCommon("save")} partner first.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{t("contacts.title")}</h3>
        <Button variant="outline" size="sm" onClick={openCreate}>
          {t("contacts.add")}
        </Button>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">{tCommon("loading")}</p>
      ) : contactsList.length === 0 ? (
        <p className="text-muted-foreground text-sm">{tCommon("noResults")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("contacts.columns.name")}</TableHead>
              <TableHead>{t("contacts.columns.position")}</TableHead>
              <TableHead>{t("contacts.columns.email")}</TableHead>
              <TableHead>{t("contacts.columns.phone")}</TableHead>
              <TableHead>{t("contacts.columns.isPrimary")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {contactsList.map((contact) => (
              <TableRow
                key={contact.id}
                className="cursor-pointer"
                onClick={() => openEdit(contact)}
              >
                <TableCell>{contact.name}</TableCell>
                <TableCell>{contact.position ?? ""}</TableCell>
                <TableCell>{contact.email ?? ""}</TableCell>
                <TableCell>{contact.phone ?? ""}</TableCell>
                <TableCell>
                  {contact.isPrimary && (
                    <Badge variant="default">
                      {t("contacts.columns.isPrimary")}
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleDeleteContact(contact.id);
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingContact
                ? t("contacts.columns.name")
                : t("contacts.add")}
            </DialogTitle>
          </DialogHeader>
          <FormSection
            section={contactFormSection}
            values={formValues}
            mode={editingContact ? "edit" : "create"}
            onChange={handleFormChange}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {tCommon("cancel")}
            </Button>
            <Button onClick={handleSave}>{tCommon("save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// ADDRESSES TAB
// ═══════════════════════════════════════════════════════════════

function AddressesTab({ partnerId }: { partnerId: string }): React.ReactNode {
  const t = useTranslations("partners");
  const tCommon = useTranslations("common");
  const { data: addressesList, isLoading, mutate } = useAddresses(partnerId);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAddress, setEditingAddress] = useState<Address | null>(null);
  const [formValues, setFormValues] = useState<Record<string, unknown>>({});

  const isNewPartner = partnerId === "new";

  const handleFormChange = useCallback((key: string, value: unknown): void => {
    setFormValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const openCreate = useCallback((): void => {
    setEditingAddress(null);
    setFormValues({
      addressType: "billing",
      label: "",
      street: "",
      city: "",
      zip: "",
      countryId: "",
      isDefault: false,
    });
    setDialogOpen(true);
  }, []);

  const openEdit = useCallback((address: Address): void => {
    setEditingAddress(address);
    setFormValues({
      addressType: address.addressType,
      label: address.label ?? "",
      street: address.street ?? "",
      city: address.city ?? "",
      zip: address.zip ?? "",
      countryId: address.countryId ?? "",
      isDefault: address.isDefault,
    });
    setDialogOpen(true);
  }, []);

  const handleSave = useCallback(async (): Promise<void> => {
    try {
      if (editingAddress) {
        await updateAddress(editingAddress.id, {
          partnerId,
          addressType: String(formValues["addressType"] ?? "billing"),
          label: (formValues["label"] as string) || null,
          street: (formValues["street"] as string) || null,
          city: (formValues["city"] as string) || null,
          zip: (formValues["zip"] as string) || null,
          countryId: (formValues["countryId"] as string) || null,
          isDefault: formValues["isDefault"] === true,
        });
      } else {
        const data: AddressCreate = {
          partnerId,
          addressType: String(formValues["addressType"] ?? "billing"),
          label: (formValues["label"] as string) || null,
          street: (formValues["street"] as string) || null,
          city: (formValues["city"] as string) || null,
          zip: (formValues["zip"] as string) || null,
          countryId: (formValues["countryId"] as string) || null,
          isDefault: formValues["isDefault"] === true,
        };
        await createAddress(data);
      }
      setDialogOpen(false);
      mutate();
    } catch (err: unknown) {
      console.error("Failed to save address:", err);
      toast.error(tCommon("save") + " failed");
    }
  }, [editingAddress, formValues, partnerId, mutate, tCommon]);

  const handleDeleteAddress = useCallback(
    async (addressId: string): Promise<void> => {
      try {
        await deleteAddress(addressId);
        mutate();
      } catch (err: unknown) {
        console.error("Failed to delete address:", err);
        toast.error(tCommon("delete") + " failed");
      }
    },
    [mutate, tCommon]
  );

  const addressTypeLabel = useCallback(
    (type: string): string => {
      const labels: Record<string, string> = {
        billing: t("addresses.addressType.billing"),
        delivery: t("addresses.addressType.delivery"),
        other: t("addresses.addressType.other"),
      };
      return labels[type] ?? type;
    },
    [t]
  );

  const addressFormSection: FormSectionDef = useMemo(
    () => ({
      columns: 2,
      fields: [
        {
          key: "addressType",
          label: t("addresses.fields.addressType"),
          type: "select" as const,
          required: true,
          options: [
            { value: "billing", label: t("addresses.addressType.billing") },
            { value: "delivery", label: t("addresses.addressType.delivery") },
            { value: "other", label: t("addresses.addressType.other") },
          ],
        },
        { key: "label", label: t("addresses.fields.label"), type: "text" as const },
        { key: "street", label: t("addresses.fields.street"), type: "text" as const, gridSpan: 2 },
        { key: "city", label: t("addresses.fields.city"), type: "text" as const },
        { key: "zip", label: t("addresses.fields.zip"), type: "text" as const },
        {
          key: "countryId",
          label: t("addresses.fields.countryId"),
          type: "select" as const,
          options: [
            { value: "CZ", label: "CZ" },
            { value: "SK", label: "SK" },
            { value: "PL", label: "PL" },
            { value: "DE", label: "DE" },
            { value: "AT", label: "AT" },
          ],
        },
        { key: "isDefault", label: t("addresses.fields.isDefault"), type: "toggle" as const },
      ],
    }),
    [t]
  );

  if (isNewPartner) {
    return (
      <p className="text-muted-foreground text-sm">
        {tCommon("save")} partner first.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{t("addresses.title")}</h3>
        <Button variant="outline" size="sm" onClick={openCreate}>
          {t("addresses.add")}
        </Button>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">{tCommon("loading")}</p>
      ) : addressesList.length === 0 ? (
        <p className="text-muted-foreground text-sm">{tCommon("noResults")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("addresses.columns.addressType")}</TableHead>
              <TableHead>{t("addresses.columns.label")}</TableHead>
              <TableHead>{t("addresses.columns.street")}</TableHead>
              <TableHead>{t("addresses.columns.city")}</TableHead>
              <TableHead>{t("addresses.columns.zip")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {addressesList.map((address) => (
              <TableRow
                key={address.id}
                className="cursor-pointer"
                onClick={() => openEdit(address)}
              >
                <TableCell>
                  <Badge variant="outline">
                    {addressTypeLabel(address.addressType)}
                  </Badge>
                </TableCell>
                <TableCell>{address.label ?? ""}</TableCell>
                <TableCell>{address.street ?? ""}</TableCell>
                <TableCell>{address.city ?? ""}</TableCell>
                <TableCell>{address.zip ?? ""}</TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleDeleteAddress(address.id);
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingAddress
                ? t("addresses.columns.addressType")
                : t("addresses.add")}
            </DialogTitle>
          </DialogHeader>
          <FormSection
            section={addressFormSection}
            values={formValues}
            mode={editingAddress ? "edit" : "create"}
            onChange={handleFormChange}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {tCommon("cancel")}
            </Button>
            <Button onClick={handleSave}>{tCommon("save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// BANK ACCOUNTS TAB
// ═══════════════════════════════════════════════════════════════

function BankAccountsTab({
  partnerId,
}: {
  partnerId: string;
}): React.ReactNode {
  const t = useTranslations("partners");
  const tCommon = useTranslations("common");
  const { data: bankAccountsList, isLoading, mutate } = useBankAccounts(partnerId);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null);
  const [formValues, setFormValues] = useState<Record<string, unknown>>({});

  const isNewPartner = partnerId === "new";

  const handleFormChange = useCallback((key: string, value: unknown): void => {
    setFormValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const openCreate = useCallback((): void => {
    setEditingAccount(null);
    setFormValues({
      bankName: "",
      accountNumber: "",
      iban: "",
      swift: "",
      isDefault: false,
    });
    setDialogOpen(true);
  }, []);

  const openEdit = useCallback((account: BankAccount): void => {
    setEditingAccount(account);
    setFormValues({
      bankName: account.bankName ?? "",
      accountNumber: account.accountNumber ?? "",
      iban: account.iban ?? "",
      swift: account.swift ?? "",
      isDefault: account.isDefault,
    });
    setDialogOpen(true);
  }, []);

  const handleSave = useCallback(async (): Promise<void> => {
    try {
      if (editingAccount) {
        await updateBankAccount(editingAccount.id, {
          partnerId,
          bankName: (formValues["bankName"] as string) || null,
          accountNumber: (formValues["accountNumber"] as string) || null,
          iban: (formValues["iban"] as string) || null,
          swift: (formValues["swift"] as string) || null,
          isDefault: formValues["isDefault"] === true,
        });
      } else {
        const data: BankAccountCreate = {
          partnerId,
          bankName: (formValues["bankName"] as string) || null,
          accountNumber: (formValues["accountNumber"] as string) || null,
          iban: (formValues["iban"] as string) || null,
          swift: (formValues["swift"] as string) || null,
          isDefault: formValues["isDefault"] === true,
        };
        await createBankAccount(data);
      }
      setDialogOpen(false);
      mutate();
    } catch (err: unknown) {
      console.error("Failed to save bank account:", err);
      toast.error(tCommon("save") + " failed");
    }
  }, [editingAccount, formValues, partnerId, mutate, tCommon]);

  const handleDeleteAccount = useCallback(
    async (accountId: string): Promise<void> => {
      try {
        await deleteBankAccount(accountId);
        mutate();
      } catch (err: unknown) {
        console.error("Failed to delete bank account:", err);
        toast.error(tCommon("delete") + " failed");
      }
    },
    [mutate, tCommon]
  );

  const bankAccountFormSection: FormSectionDef = useMemo(
    () => ({
      columns: 2,
      fields: [
        { key: "bankName", label: t("bankAccounts.fields.bankName"), type: "text" as const, gridSpan: 2 },
        { key: "accountNumber", label: t("bankAccounts.fields.accountNumber"), type: "text" as const },
        { key: "iban", label: t("bankAccounts.fields.iban"), type: "text" as const },
        { key: "swift", label: t("bankAccounts.fields.swift"), type: "text" as const },
        { key: "isDefault", label: t("bankAccounts.fields.isDefault"), type: "toggle" as const },
      ],
    }),
    [t]
  );

  if (isNewPartner) {
    return (
      <p className="text-muted-foreground text-sm">
        {tCommon("save")} partner first.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{t("bankAccounts.title")}</h3>
        <Button variant="outline" size="sm" onClick={openCreate}>
          {t("bankAccounts.add")}
        </Button>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">{tCommon("loading")}</p>
      ) : bankAccountsList.length === 0 ? (
        <p className="text-muted-foreground text-sm">{tCommon("noResults")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("bankAccounts.columns.bankName")}</TableHead>
              <TableHead>{t("bankAccounts.columns.accountNumber")}</TableHead>
              <TableHead>{t("bankAccounts.columns.iban")}</TableHead>
              <TableHead>{t("bankAccounts.columns.isDefault")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {bankAccountsList.map((account) => (
              <TableRow
                key={account.id}
                className="cursor-pointer"
                onClick={() => openEdit(account)}
              >
                <TableCell>{account.bankName ?? ""}</TableCell>
                <TableCell>{account.accountNumber ?? ""}</TableCell>
                <TableCell>{account.iban ?? ""}</TableCell>
                <TableCell>
                  {account.isDefault && (
                    <Badge variant="default">
                      {t("bankAccounts.columns.isDefault")}
                    </Badge>
                  )}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleDeleteAccount(account.id);
                    }}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingAccount
                ? t("bankAccounts.columns.bankName")
                : t("bankAccounts.add")}
            </DialogTitle>
          </DialogHeader>
          <FormSection
            section={bankAccountFormSection}
            values={formValues}
            mode={editingAccount ? "edit" : "create"}
            onChange={handleFormChange}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {tCommon("cancel")}
            </Button>
            <Button onClick={handleSave}>{tCommon("save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// NOTES TAB
// ═══════════════════════════════════════════════════════════════

interface NotesTabProps {
  notes: string;
  onChange: (value: string) => void;
  label: string;
}

function NotesTab({ notes, onChange, label }: NotesTabProps): React.ReactNode {
  return (
    <div className="space-y-2">
      <h3 className="text-lg font-semibold">{label}</h3>
      <Textarea
        value={notes}
        onChange={(e) => onChange(e.target.value)}
        rows={10}
        className="min-h-[200px]"
      />
    </div>
  );
}
