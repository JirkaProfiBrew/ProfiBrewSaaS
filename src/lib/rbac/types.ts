import type { UserRole } from "@/lib/types";

export type Entity =
  | "items"
  | "partners"
  | "contacts"
  | "equipment"
  | "shops"
  | "counters"
  | "recipes"
  | "batches"
  | "orders"
  | "stock"
  | "cashflow"
  | "excise"
  | "settings";

export type Action = "create" | "read" | "update" | "delete";

export type Permission = `${Entity}.${Action}`;

export type PermissionMatrix = Record<UserRole, Permission[]>;
