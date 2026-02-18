"use server";

import { withTenant } from "@/lib/db/with-tenant";
import { db } from "@/lib/db";
import {
  partners,
  contacts,
  addresses,
  partnerBankAccounts,
} from "@/../drizzle/schema/partners";
import { eq, and, or, ilike, sql } from "drizzle-orm";
import type {
  Partner,
  PartnerCreate,
  Contact,
  ContactCreate,
  Address,
  AddressCreate,
  BankAccount,
  BankAccountCreate,
} from "./types";

// ── ARES response types ─────────────────────────────────────────

interface AresAddress {
  textovaAdresa?: string;
  nazevUlice?: string;
  cisloDomovni?: number;
  cisloOrientacni?: number;
  nazevObce?: string;
  psc?: number;
}

interface AresResponse {
  ico?: string;
  obchodniJmeno?: string;
  sidlo?: AresAddress;
  pravniForma?: string;
  financniUrad?: string;
  dic?: string;
}

// ── Partner CRUD ────────────────────────────────────────────────

export async function getPartners(filter?: {
  search?: string;
  isCustomer?: boolean;
  isSupplier?: boolean;
}): Promise<Partner[]> {
  return withTenant(async (tenantId) => {
    const conditions = [eq(partners.tenantId, tenantId)];

    if (filter?.search) {
      const term = `%${filter.search}%`;
      conditions.push(
        or(
          ilike(partners.name, term),
          ilike(partners.ico, term),
          ilike(partners.addressCity, term),
          ilike(partners.email, term)
        ) ?? sql`true`
      );
    }

    if (filter?.isCustomer !== undefined) {
      conditions.push(eq(partners.isCustomer, filter.isCustomer));
    }

    if (filter?.isSupplier !== undefined) {
      conditions.push(eq(partners.isSupplier, filter.isSupplier));
    }

    const rows = await db
      .select()
      .from(partners)
      .where(and(...conditions))
      .orderBy(partners.name);

    return rows.map(mapPartnerRow);
  });
}

export async function getPartnerById(id: string): Promise<Partner | null> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .select()
      .from(partners)
      .where(and(eq(partners.id, id), eq(partners.tenantId, tenantId)))
      .limit(1);

    const row = rows[0];
    if (!row) return null;

    return mapPartnerRow(row);
  });
}

export async function createPartner(data: PartnerCreate): Promise<Partner> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .insert(partners)
      .values({
        tenantId,
        name: data.name,
        isCustomer: data.isCustomer,
        isSupplier: data.isSupplier,
        legalForm: data.legalForm,
        ico: data.ico,
        dic: data.dic,
        legalFormCode: data.legalFormCode,
        email: data.email,
        phone: data.phone,
        mobile: data.mobile,
        web: data.web,
        addressStreet: data.addressStreet,
        addressCity: data.addressCity,
        addressZip: data.addressZip,
        countryId: data.countryId,
        paymentTerms: data.paymentTerms,
        creditLimit: data.creditLimit,
        logoUrl: data.logoUrl,
        notes: data.notes,
        isActive: data.isActive,
      })
      .returning();

    const row = rows[0];
    if (!row) throw new Error("Failed to create partner");
    return mapPartnerRow(row);
  });
}

export async function updatePartner(
  id: string,
  data: Partial<PartnerCreate>
): Promise<Partner> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .update(partners)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(and(eq(partners.id, id), eq(partners.tenantId, tenantId)))
      .returning();

    const row = rows[0];
    if (!row) {
      throw new Error("Partner not found");
    }

    return mapPartnerRow(row);
  });
}

/** Soft delete — sets isActive = false. */
export async function deletePartner(id: string): Promise<void> {
  await withTenant(async (tenantId) => {
    await db
      .update(partners)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(partners.id, id), eq(partners.tenantId, tenantId)));
  });
}

// ── Contact CRUD ────────────────────────────────────────────────

export async function getContactsByPartner(
  partnerId: string
): Promise<Contact[]> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .select()
      .from(contacts)
      .where(
        and(
          eq(contacts.partnerId, partnerId),
          eq(contacts.tenantId, tenantId)
        )
      )
      .orderBy(contacts.name);

    return rows.map(mapContactRow);
  });
}

export async function createContact(data: ContactCreate): Promise<Contact> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .insert(contacts)
      .values({
        tenantId,
        partnerId: data.partnerId,
        name: data.name,
        position: data.position,
        email: data.email,
        phone: data.phone,
        mobile: data.mobile,
        isPrimary: data.isPrimary,
        notes: data.notes,
      })
      .returning();

    const row = rows[0];
    if (!row) throw new Error("Failed to create contact");
    return mapContactRow(row);
  });
}

export async function updateContact(
  id: string,
  data: Partial<ContactCreate>
): Promise<Contact> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .update(contacts)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(and(eq(contacts.id, id), eq(contacts.tenantId, tenantId)))
      .returning();

    const row = rows[0];
    if (!row) {
      throw new Error("Contact not found");
    }

    return mapContactRow(row);
  });
}

/** Hard delete for contacts. */
export async function deleteContact(id: string): Promise<void> {
  await withTenant(async (tenantId) => {
    await db
      .delete(contacts)
      .where(and(eq(contacts.id, id), eq(contacts.tenantId, tenantId)));
  });
}

export async function setPrimaryContact(
  partnerId: string,
  contactId: string
): Promise<void> {
  await withTenant(async (tenantId) => {
    // Clear existing primary
    await db
      .update(contacts)
      .set({ isPrimary: false, updatedAt: new Date() })
      .where(
        and(
          eq(contacts.partnerId, partnerId),
          eq(contacts.tenantId, tenantId)
        )
      );

    // Set new primary
    await db
      .update(contacts)
      .set({ isPrimary: true, updatedAt: new Date() })
      .where(
        and(
          eq(contacts.id, contactId),
          eq(contacts.tenantId, tenantId)
        )
      );
  });
}

// ── Address CRUD ────────────────────────────────────────────────

export async function getAddressesByPartner(
  partnerId: string
): Promise<Address[]> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .select()
      .from(addresses)
      .where(
        and(
          eq(addresses.partnerId, partnerId),
          eq(addresses.tenantId, tenantId)
        )
      )
      .orderBy(addresses.createdAt);

    return rows.map(mapAddressRow);
  });
}

export async function createAddress(data: AddressCreate): Promise<Address> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .insert(addresses)
      .values({
        tenantId,
        partnerId: data.partnerId,
        addressType: data.addressType,
        label: data.label,
        street: data.street,
        city: data.city,
        zip: data.zip,
        countryId: data.countryId,
        isDefault: data.isDefault,
      })
      .returning();

    const row = rows[0];
    if (!row) throw new Error("Failed to create address");
    return mapAddressRow(row);
  });
}

export async function updateAddress(
  id: string,
  data: Partial<AddressCreate>
): Promise<Address> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .update(addresses)
      .set(data)
      .where(and(eq(addresses.id, id), eq(addresses.tenantId, tenantId)))
      .returning();

    const row = rows[0];
    if (!row) {
      throw new Error("Address not found");
    }

    return mapAddressRow(row);
  });
}

export async function deleteAddress(id: string): Promise<void> {
  await withTenant(async (tenantId) => {
    await db
      .delete(addresses)
      .where(and(eq(addresses.id, id), eq(addresses.tenantId, tenantId)));
  });
}

// ── Bank Account CRUD ───────────────────────────────────────────

export async function getBankAccountsByPartner(
  partnerId: string
): Promise<BankAccount[]> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .select()
      .from(partnerBankAccounts)
      .where(
        and(
          eq(partnerBankAccounts.partnerId, partnerId),
          eq(partnerBankAccounts.tenantId, tenantId)
        )
      )
      .orderBy(partnerBankAccounts.createdAt);

    return rows.map(mapBankAccountRow);
  });
}

export async function createBankAccount(
  data: BankAccountCreate
): Promise<BankAccount> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .insert(partnerBankAccounts)
      .values({
        tenantId,
        partnerId: data.partnerId,
        bankName: data.bankName,
        accountNumber: data.accountNumber,
        iban: data.iban,
        swift: data.swift,
        isDefault: data.isDefault,
      })
      .returning();

    const row = rows[0];
    if (!row) throw new Error("Failed to create bank account");
    return mapBankAccountRow(row);
  });
}

export async function updateBankAccount(
  id: string,
  data: Partial<BankAccountCreate>
): Promise<BankAccount> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .update(partnerBankAccounts)
      .set(data)
      .where(
        and(
          eq(partnerBankAccounts.id, id),
          eq(partnerBankAccounts.tenantId, tenantId)
        )
      )
      .returning();

    const row = rows[0];
    if (!row) {
      throw new Error("Bank account not found");
    }

    return mapBankAccountRow(row);
  });
}

export async function deleteBankAccount(id: string): Promise<void> {
  await withTenant(async (tenantId) => {
    await db
      .delete(partnerBankAccounts)
      .where(
        and(
          eq(partnerBankAccounts.id, id),
          eq(partnerBankAccounts.tenantId, tenantId)
        )
      );
  });
}

// ── ARES integration ────────────────────────────────────────────

export interface AresResult {
  name: string;
  street: string;
  city: string;
  zip: string;
  legalForm: string;
}

export async function lookupAres(ico: string): Promise<AresResult | null> {
  try {
    const response = await fetch(
      `https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/${ico}`,
      {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!response.ok) return null;

    const data = (await response.json()) as AresResponse;

    const address = data.sidlo;
    let street = "";
    if (address) {
      const streetName = address.nazevUlice ?? "";
      const houseNum = address.cisloDomovni ? String(address.cisloDomovni) : "";
      const orientNum = address.cisloOrientacni
        ? `/${address.cisloOrientacni}`
        : "";
      street = streetName
        ? `${streetName} ${houseNum}${orientNum}`.trim()
        : address.textovaAdresa ?? "";
    }

    return {
      name: data.obchodniJmeno ?? "",
      street,
      city: address?.nazevObce ?? "",
      zip: address?.psc ? String(address.psc) : "",
      legalForm: data.pravniForma ?? "",
    };
  } catch {
    console.error("ARES lookup failed for ICO:", ico);
    return null;
  }
}

// ── Row mappers ─────────────────────────────────────────────────

type PartnerRow = typeof partners.$inferSelect;
type ContactRow = typeof contacts.$inferSelect;
type AddressRow = typeof addresses.$inferSelect;
type BankAccountRow = typeof partnerBankAccounts.$inferSelect;

function mapPartnerRow(row: PartnerRow): Partner {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    isCustomer: row.isCustomer ?? false,
    isSupplier: row.isSupplier ?? false,
    legalForm: row.legalForm,
    ico: row.ico,
    dic: row.dic,
    dicValidated: row.dicValidated ?? false,
    legalFormCode: row.legalFormCode,
    email: row.email,
    phone: row.phone,
    mobile: row.mobile,
    web: row.web,
    addressStreet: row.addressStreet,
    addressCity: row.addressCity,
    addressZip: row.addressZip,
    countryId: row.countryId,
    paymentTerms: row.paymentTerms ?? 14,
    creditLimit: row.creditLimit,
    logoUrl: row.logoUrl,
    notes: row.notes,
    isActive: row.isActive ?? true,
    lastSyncAt: row.lastSyncAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapContactRow(row: ContactRow): Contact {
  return {
    id: row.id,
    tenantId: row.tenantId,
    partnerId: row.partnerId,
    name: row.name,
    position: row.position,
    email: row.email,
    phone: row.phone,
    mobile: row.mobile,
    isPrimary: row.isPrimary ?? false,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapAddressRow(row: AddressRow): Address {
  return {
    id: row.id,
    tenantId: row.tenantId,
    partnerId: row.partnerId,
    addressType: row.addressType,
    label: row.label,
    street: row.street,
    city: row.city,
    zip: row.zip,
    countryId: row.countryId,
    isDefault: row.isDefault ?? false,
    createdAt: row.createdAt,
  };
}

function mapBankAccountRow(row: BankAccountRow): BankAccount {
  return {
    id: row.id,
    tenantId: row.tenantId,
    partnerId: row.partnerId,
    bankName: row.bankName,
    accountNumber: row.accountNumber,
    iban: row.iban,
    swift: row.swift,
    isDefault: row.isDefault ?? false,
    createdAt: row.createdAt,
  };
}
