import { hasModuleAccess } from "./check";
import { AuthError } from "@/lib/db/with-tenant";

/**
 * Wraps a server action to enforce module access.
 * Returns 403-equivalent error if the tenant doesn't have access.
 */
export async function withModuleAccess<T>(
  tenantId: string,
  moduleSlug: string,
  fn: () => Promise<T>
): Promise<T> {
  const allowed = await hasModuleAccess(tenantId, moduleSlug);
  if (!allowed) {
    throw new AuthError(`Module '${moduleSlug}' is not available on your plan`);
  }
  return fn();
}
