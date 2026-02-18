import type { UserRole } from "@/lib/types";
import type { Permission, Entity, Action } from "./types";

/**
 * Permission matrix — defines which roles can perform which actions on which entities.
 *
 * Based on SYSTEM-DESIGN.md section 3.3 and sprint-1-spec Phase 1G.
 *
 * Legend: C=create, R=read, U=update, D=delete
 * | Entity     | owner | admin | brewer | sales | viewer |
 * |------------|-------|-------|--------|-------|--------|
 * | items      | CRUD  | CRUD  | CRU    | R     | R      |
 * | partners   | CRUD  | CRUD  | R      | CRUD  | R      |
 * | contacts   | CRUD  | CRUD  | R      | CRUD  | R      |
 * | equipment  | CRUD  | CRUD  | CRU    | R     | R      |
 * | shops      | CRUD  | CRU   | R      | R     | R      |
 * | counters   | CRUD  | R     | -      | -     | -      |
 * | recipes    | CRUD  | CRUD  | CRUD   | R     | R      |
 * | batches    | CRUD  | CRUD  | CRUD   | R     | R      |
 * | orders     | CRUD  | CRUD  | R      | CRUD  | R      |
 * | stock      | CRUD  | CRUD  | CRU    | R     | R      |
 * | cashflow   | CRUD  | CRUD  | R      | CRU   | R      |
 * | excise     | CRUD  | CRUD  | CRU    | R     | R      |
 * | settings   | CRUD  | CRU   | R      | R     | R      |
 */

function allActions(entity: Entity): Permission[] {
  return [
    `${entity}.create`,
    `${entity}.read`,
    `${entity}.update`,
    `${entity}.delete`,
  ];
}

function cru(entity: Entity): Permission[] {
  return [
    `${entity}.create`,
    `${entity}.read`,
    `${entity}.update`,
  ];
}

function readOnly(entity: Entity): Permission[] {
  return [`${entity}.read`];
}

const entities: Entity[] = [
  "items",
  "partners",
  "contacts",
  "equipment",
  "shops",
  "counters",
  "recipes",
  "batches",
  "orders",
  "stock",
  "cashflow",
  "excise",
  "settings",
];

const ownerPermissions: Permission[] = entities.flatMap(allActions);

const adminPermissions: Permission[] = [
  ...allActions("items"),
  ...allActions("partners"),
  ...allActions("contacts"),
  ...allActions("equipment"),
  ...cru("shops"),
  ...readOnly("counters"),
  ...allActions("recipes"),
  ...allActions("batches"),
  ...allActions("orders"),
  ...allActions("stock"),
  ...allActions("cashflow"),
  ...allActions("excise"),
  ...cru("settings"),
];

const brewerPermissions: Permission[] = [
  ...cru("items"),
  ...readOnly("partners"),
  ...readOnly("contacts"),
  ...cru("equipment"),
  ...readOnly("shops"),
  ...allActions("recipes"),
  ...allActions("batches"),
  ...readOnly("orders"),
  ...cru("stock"),
  ...readOnly("cashflow"),
  ...cru("excise"),
  ...readOnly("settings"),
];

const salesPermissions: Permission[] = [
  ...readOnly("items"),
  ...allActions("partners"),
  ...allActions("contacts"),
  ...readOnly("equipment"),
  ...readOnly("shops"),
  ...readOnly("recipes"),
  ...readOnly("batches"),
  ...allActions("orders"),
  ...readOnly("stock"),
  ...cru("cashflow"),
  ...readOnly("excise"),
  ...readOnly("settings"),
];

const viewerPermissions: Permission[] = entities.flatMap(readOnly);

// Manager has same permissions as admin
const managerPermissions: Permission[] = adminPermissions;

const permissionsByRole: Record<UserRole, Permission[]> = {
  owner: ownerPermissions,
  admin: adminPermissions,
  manager: managerPermissions,
  brewer: brewerPermissions,
  sales: salesPermissions,
  viewer: viewerPermissions,
};

/**
 * Check if a user role has a specific permission.
 */
export function hasPermission(
  userRole: UserRole,
  permission: Permission
): boolean {
  const rolePermissions = permissionsByRole[userRole];
  return rolePermissions.includes(permission);
}

/**
 * Check if a user role can perform an action on an entity.
 */
export function canPerform(
  userRole: UserRole,
  entity: Entity,
  action: Action
): boolean {
  return hasPermission(userRole, `${entity}.${action}`);
}
