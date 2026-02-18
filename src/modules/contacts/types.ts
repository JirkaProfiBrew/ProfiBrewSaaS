/**
 * Contacts module — type definitions.
 * Contacts are displayed as a flat list across all partners.
 */

export interface ContactWithPartner {
  id: string;
  tenantId: string;
  partnerId: string;
  partnerName: string;
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
