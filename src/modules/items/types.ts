/**
 * Items module — type definitions.
 * Represents brew materials, production items, sale items, etc.
 * Drizzle decimal columns return strings — all numeric fields are string | null.
 */

export interface Item {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  brand: string | null;
  isBrewMaterial: boolean;
  isProductionItem: boolean;
  isSaleItem: boolean;
  isExciseRelevant: boolean;
  stockCategory: string | null;
  issueMode: string;
  unitId: string | null;
  recipeUnitId: string | null;
  baseUnitAmount: string | null;
  baseItemId: string | null;
  baseItemQuantity: string | null;
  materialType: string | null;
  alpha: string | null;
  ebc: string | null;
  extractPercent: string | null;
  packagingType: string | null;
  volumeL: string | null;
  abv: string | null;
  plato: string | null;
  ean: string | null;
  costPrice: string | null;
  avgPrice: string | null;
  salePrice: string | null;
  overheadManual: boolean;
  overheadPrice: string | null;
  packagingCost: string | null;
  fillingCost: string | null;
  posAvailable: boolean;
  webAvailable: boolean;
  color: string | null;
  imageUrl: string | null;
  notes: string | null;
  isActive: boolean;
  isFromLibrary: boolean;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export type ItemCreate = Omit<
  Item,
  "id" | "tenantId" | "createdAt" | "updatedAt" | "code" | "avgPrice"
>;

export type ItemUpdate = Partial<ItemCreate> & { id: string };
