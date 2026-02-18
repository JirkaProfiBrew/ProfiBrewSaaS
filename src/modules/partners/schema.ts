/**
 * Partners module — Zod validation schemas.
 */

import { z } from "zod";

/** Schema for creating a new partner. Name is required. */
export const partnerCreateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  isCustomer: z.boolean().optional().default(false),
  isSupplier: z.boolean().optional().default(false),
  legalForm: z.string().nullable().optional(),
  ico: z
    .string()
    .nullable()
    .optional()
    .refine(
      (val) => !val || /^\d{8}$/.test(val),
      { message: "IČO must be exactly 8 digits" }
    ),
  dic: z.string().nullable().optional(),
  legalFormCode: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  mobile: z.string().nullable().optional(),
  web: z.string().url().nullable().optional(),
  addressStreet: z.string().nullable().optional(),
  addressCity: z.string().nullable().optional(),
  addressZip: z.string().nullable().optional(),
  countryId: z.string().uuid().nullable().optional(),
  paymentTerms: z.number().int().min(0).optional().default(14),
  creditLimit: z.string().nullable().optional(),
  logoUrl: z.string().url().nullable().optional(),
  notes: z.string().nullable().optional(),
  isActive: z.boolean().optional().default(true),
});

/** Schema for updating an existing partner. All fields optional except id. */
export const partnerUpdateSchema = partnerCreateSchema.partial().extend({
  id: z.string().uuid(),
});

/** Schema for creating a new contact. Name is required. */
export const contactCreateSchema = z.object({
  partnerId: z.string().uuid(),
  name: z.string().min(1, "Name is required"),
  position: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().nullable().optional(),
  mobile: z.string().nullable().optional(),
  isPrimary: z.boolean().optional().default(false),
  notes: z.string().nullable().optional(),
});

/** Schema for updating a contact. */
export const contactUpdateSchema = contactCreateSchema.partial().extend({
  id: z.string().uuid(),
});

/** Schema for creating an address. addressType is required. */
export const addressCreateSchema = z.object({
  partnerId: z.string().uuid(),
  addressType: z.enum(["billing", "delivery", "other"]),
  label: z.string().nullable().optional(),
  street: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  zip: z.string().nullable().optional(),
  countryId: z.string().uuid().nullable().optional(),
  isDefault: z.boolean().optional().default(false),
});

/** Schema for updating an address. */
export const addressUpdateSchema = addressCreateSchema.partial().extend({
  id: z.string().uuid(),
});

/** Schema for creating a bank account. At least one of accountNumber or iban. */
export const bankAccountCreateSchema = z
  .object({
    partnerId: z.string().uuid(),
    bankName: z.string().nullable().optional(),
    accountNumber: z.string().nullable().optional(),
    iban: z.string().nullable().optional(),
    swift: z.string().nullable().optional(),
    isDefault: z.boolean().optional().default(false),
  })
  .refine(
    (data) =>
      (data.accountNumber !== null && data.accountNumber !== undefined && data.accountNumber !== "") ||
      (data.iban !== null && data.iban !== undefined && data.iban !== ""),
    { message: "At least one of account number or IBAN is required" }
  );

/** Schema for updating a bank account. */
export const bankAccountUpdateSchema = z
  .object({
    id: z.string().uuid(),
    partnerId: z.string().uuid().optional(),
    bankName: z.string().nullable().optional(),
    accountNumber: z.string().nullable().optional(),
    iban: z.string().nullable().optional(),
    swift: z.string().nullable().optional(),
    isDefault: z.boolean().optional(),
  })
  .refine(
    (data) => {
      // If both are explicitly set to empty, fail
      const hasAccount = data.accountNumber === undefined || (data.accountNumber !== null && data.accountNumber !== "");
      const hasIban = data.iban === undefined || (data.iban !== null && data.iban !== "");
      return hasAccount || hasIban;
    },
    { message: "At least one of account number or IBAN is required" }
  );

export type PartnerCreateInput = z.infer<typeof partnerCreateSchema>;
export type PartnerUpdateInput = z.infer<typeof partnerUpdateSchema>;
export type ContactCreateInput = z.infer<typeof contactCreateSchema>;
export type ContactUpdateInput = z.infer<typeof contactUpdateSchema>;
export type AddressCreateInput = z.infer<typeof addressCreateSchema>;
export type AddressUpdateInput = z.infer<typeof addressUpdateSchema>;
export type BankAccountCreateInput = z.infer<typeof bankAccountCreateSchema>;
export type BankAccountUpdateInput = z.infer<typeof bankAccountUpdateSchema>;
