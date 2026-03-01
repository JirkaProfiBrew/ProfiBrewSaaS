export type UserRole = "owner" | "admin" | "manager" | "brewer" | "sales" | "viewer";

export interface TenantContextData {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  userRole: UserRole;
  isSuperadmin: boolean;
  subscription: {
    planSlug: string;
    modules: string[];
    status: string;
  };
}
