export interface PilotInvitation {
  id: string;
  token: string;
  email: string;
  planSlug: string;
  trialDays: number;
  priceOverride: string | null;
  notes: string | null;
  status: "pending" | "sent" | "registered" | "expired";
  sentAt: Date | null;
  registeredAt: Date | null;
  registeredTenantId: string | null;
  expiresAt: Date | null;
  createdBy: string;
  createdAt: Date | null;
}

export interface CreateInvitationInput {
  email: string;
  planSlug?: string;
  trialDays?: number;
  priceOverride?: string;
  notes?: string;
}
