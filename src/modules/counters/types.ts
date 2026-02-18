/**
 * Counters module — type definitions.
 */

export interface Counter {
  id: string;
  tenantId: string;
  entity: string;
  prefix: string;
  includeYear: boolean;
  currentNumber: number;
  padding: number;
  separator: string;
  resetYearly: boolean;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export type CounterUpdate = Pick<
  Counter,
  "prefix" | "includeYear" | "padding" | "separator" | "resetYearly"
>;
