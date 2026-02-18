/**
 * Maps URL path segment to required module slug.
 * Used by middleware + ModuleGuard for subscription access control.
 *
 * "_always" means the route is available regardless of subscription plan.
 */
export const moduleRoutes: Record<string, string> = {
  "/brewery": "brewery",
  "/stock": "stock",
  "/sales": "sales",
  "/finance": "finance",
  "/plan": "plan",
  "/settings": "_always",
  "/dashboard": "_always",
  "/upgrade": "_always",
};
