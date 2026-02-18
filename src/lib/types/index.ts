export type UserRole = "owner" | "admin" | "manager" | "brewer" | "sales" | "viewer";

export interface TenantContextData {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  userRole: UserRole;
  subscription: {
    planSlug: string;
    modules: string[];
    status: string;
  };
}
