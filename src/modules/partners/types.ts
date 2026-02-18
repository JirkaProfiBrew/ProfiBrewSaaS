/**
 * Partners module — type definitions.
 * Matches the DB schema in drizzle/schema/partners.ts.
 */

export type PartnerType = "customer" | "supplier" | "both";

/** Helper to get display partner type from flags */
export function getPartnerType(partner: {
  isCustomer: boolean;
  isSupplier: boolean;
}): PartnerType {
  if (partner.isCustomer && partner.isSupplier) return "both";
  if (partner.isCustomer) return "customer";
  return "supplier";
}

export interface Partner {
  id: string;
  tenantId: string;
  name: string;
  isCustomer: boolean;
  isSupplier: boolean;
  legalForm: string | null;
  ico: string | null;
  dic: string | null;
  dicValidated: boolean;
  legalFormCode: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  web: string | null;
  addressStreet: string | null;
  addressCity: string | null;
  addressZip: string | null;
  countryId: string | null;
  paymentTerms: number;
  creditLimit: string | null;
  logoUrl: string | null;
  notes: string | null;
  isActive: boolean;
  lastSyncAt: Date | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export type PartnerCreate = Omit<
  Partner,
  "id" | "tenantId" | "createdAt" | "updatedAt" | "lastSyncAt" | "dicValidated"
>;

export type PartnerUpdate = Partial<PartnerCreate> & { id: string };

export interface Contact {
  id: string;
  tenantId: string;
  partnerId: string;
  name: string;
  position: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  isPrimary: boolean;
  notes: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export type ContactCreate = Omit<
  Contact,
  "id" | "tenantId" | "createdAt" | "updatedAt"
>;

export type ContactUpdate = Partial<ContactCreate> & { id: string };

export interface Address {
  id: string;
  tenantId: string;
  partnerId: string;
  addressType: string;
  label: string | null;
  street: string | null;
  city: string | null;
  zip: string | null;
  countryId: string | null;
  isDefault: boolean;
  createdAt: Date | null;
}

export type AddressCreate = Omit<Address, "id" | "tenantId" | "createdAt">;

export type AddressUpdate = Partial<AddressCreate> & { id: string };

export interface BankAccount {
  id: string;
  tenantId: string;
  partnerId: string;
  bankName: string | null;
  accountNumber: string | null;
  iban: string | null;
  swift: string | null;
  isDefault: boolean;
  createdAt: Date | null;
}

export type BankAccountCreate = Omit<
  BankAccount,
  "id" | "tenantId" | "createdAt"
>;

export type BankAccountUpdate = Partial<BankAccountCreate> & { id: string };
