export { hasPermission, canPerform } from "./check";
export { withPermission, ForbiddenError } from "./middleware";
export { usePermission, usePermissions } from "./hooks";
export type { Permission, Entity, Action, PermissionMatrix } from "./types";
