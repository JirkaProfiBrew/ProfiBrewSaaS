/**
 * Partners module — type definitions.
 * Full implementation in Sprint 1.
 */

export interface Partner {
  id: string;
  tenantId: string;
  name: string;
  partnerType: "customer" | "supplier" | "both";
  ico: string | null;
  dic: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}
