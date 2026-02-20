/**
 * Orders module — Zod validation schemas.
 * Used for form validation and server action input parsing.
 */

import { z } from "zod";

// -- Order schemas -------------------------------------------------------------

export const orderCreateSchema = z.object({
  partnerId: z.string().uuid("Partner is required"),
  contactId: z.string().uuid().nullable().optional(),
  orderDate: z.string().optional(),
  deliveryDate: z.string().nullable().optional(),
  shopId: z.string().uuid().nullable().optional(),
  warehouseId: z.string().uuid().nullable().optional(),
  notes: z.string().nullable().optional(),
  internalNotes: z.string().nullable().optional(),
});

export const orderUpdateSchema = orderCreateSchema.partial();

// -- Order item schemas --------------------------------------------------------

export const orderItemCreateSchema = z.object({
  itemId: z.string().uuid("Item is required"),
  quantity: z.string().min(1, "Quantity is required"),
  unitPrice: z.string().min(1, "Price is required"),
  vatRate: z.string().optional().default("21"),
  discountPct: z.string().optional().default("0"),
  depositId: z.string().uuid().nullable().optional(),
  depositQty: z.string().optional().default("0"),
  notes: z.string().nullable().optional(),
});

export const orderItemUpdateSchema = orderItemCreateSchema.partial();

// -- Inferred types ------------------------------------------------------------

export type OrderCreateInput = z.infer<typeof orderCreateSchema>;
export type OrderUpdateInput = z.infer<typeof orderUpdateSchema>;
export type OrderItemCreateInput = z.infer<typeof orderItemCreateSchema>;
export type OrderItemUpdateInput = z.infer<typeof orderItemUpdateSchema>;
