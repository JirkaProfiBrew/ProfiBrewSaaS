/**
 * Cashflows module -- Zod validation schemas.
 * Used for form validation and server action input parsing.
 * Note: This project uses Zod v4. The `required_error` param is replaced by `error`.
 */

import { z } from "zod";

// -- Cashflow schemas ----------------------------------------------------------

export const cashflowCreateSchema = z.object({
  cashflowType: z.enum(["income", "expense"]),
  categoryId: z.string().uuid().nullable().optional(),
  amount: z.string().min(1, "Amount is required"),
  currency: z.string().optional().default("CZK"),
  date: z.string().min(1, "Date is required"),
  dueDate: z.string().nullable().optional(),
  status: z
    .enum(["planned", "pending", "paid", "cancelled"])
    .optional()
    .default("planned"),
  partnerId: z.string().uuid().nullable().optional(),
  orderId: z.string().uuid().nullable().optional(),
  stockIssueId: z.string().uuid().nullable().optional(),
  shopId: z.string().uuid().nullable().optional(),
  description: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  isCash: z.boolean().optional().default(false),
});

export const cashflowUpdateSchema = z.object({
  categoryId: z.string().uuid().nullable().optional(),
  amount: z.string().optional(),
  currency: z.string().optional(),
  date: z.string().optional(),
  dueDate: z.string().nullable().optional(),
  status: z.enum(["planned", "pending", "paid", "cancelled"]).optional(),
  partnerId: z.string().uuid().nullable().optional(),
  description: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  isCash: z.boolean().optional(),
});

// -- Template schemas ----------------------------------------------------------

export const templateCreateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  cashflowType: z.enum(["income", "expense"]),
  categoryId: z.string().uuid().nullable().optional(),
  amount: z.string().min(1, "Amount is required"),
  description: z.string().nullable().optional(),
  partnerId: z.string().uuid().nullable().optional(),
  frequency: z.enum(["weekly", "monthly", "quarterly", "yearly"]),
  dayOfMonth: z.number().int().min(1).max(31).nullable().optional(),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().nullable().optional(),
  nextDate: z.string().min(1, "Next date is required"),
});

export const templateUpdateSchema = z.object({
  name: z.string().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  amount: z.string().optional(),
  description: z.string().nullable().optional(),
  partnerId: z.string().uuid().nullable().optional(),
  frequency: z.enum(["weekly", "monthly", "quarterly", "yearly"]).optional(),
  dayOfMonth: z.number().int().min(1).max(31).nullable().optional(),
  endDate: z.string().nullable().optional(),
  nextDate: z.string().optional(),
  isActive: z.boolean().optional(),
});

// -- Inferred types ------------------------------------------------------------

export type CashflowCreateInput = z.infer<typeof cashflowCreateSchema>;
export type CashflowUpdateInput = z.infer<typeof cashflowUpdateSchema>;
export type TemplateCreateInput = z.infer<typeof templateCreateSchema>;
export type TemplateUpdateInput = z.infer<typeof templateUpdateSchema>;
