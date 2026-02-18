/**
 * Partners module — type definitions.
 */

export type PartnerType = "customer" | "supplier" | "both";

export interface Partner {
  id: string;
  tenantId: string;
  name: string;
  partnerType: PartnerType;
  ico: string | null;
  dic: string | null;
  street: string | null;
  city: string | null;
  zip: string | null;
  country: string;
  phone: string | null;
  email: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
