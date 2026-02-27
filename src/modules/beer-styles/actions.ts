"use server";

import { db } from "@/lib/db";
import { beerStyleGroups, beerStyles } from "@/../drizzle/schema/beer-styles";
import { asc, eq } from "drizzle-orm";

export interface BeerStyleGroupRow {
  id: string;
  name: string;
  nameCz: string | null;
  imageUrl: string | null;
  sortOrder: number;
  styleCount: number;
}

export interface BeerStyleRow {
  id: string;
  styleGroupId: string;
  bjcpNumber: string | null;
  bjcpCategory: string | null;
  name: string;
  groupName: string;
  groupNameCz: string | null;
  groupImageUrl: string | null;
  abvMin: string | null;
  abvMax: string | null;
  ibuMin: string | null;
  ibuMax: string | null;
  ebcMin: string | null;
  ebcMax: string | null;
  ogMin: string | null;
  ogMax: string | null;
  fgMin: string | null;
  fgMax: string | null;
  appearance: string | null;
  aroma: string | null;
  flavor: string | null;
  comments: string | null;
  impression: string | null;
  mouthfeel: string | null;
  history: string | null;
  ingredients: string | null;
  styleComparison: string | null;
  commercialExamples: string | null;
  origin: string | null;
  styleFamily: string | null;
}

export async function getBeerStylesForBrowser(): Promise<BeerStyleRow[]> {
  const rows = await db
    .select({
      style: beerStyles,
      groupName: beerStyleGroups.name,
      groupNameCz: beerStyleGroups.nameCz,
      groupImageUrl: beerStyleGroups.imageUrl,
      groupSortOrder: beerStyleGroups.sortOrder,
    })
    .from(beerStyles)
    .innerJoin(beerStyleGroups, eq(beerStyles.styleGroupId, beerStyleGroups.id))
    .orderBy(asc(beerStyleGroups.sortOrder), asc(beerStyles.bjcpNumber));

  return rows.map((row): BeerStyleRow => ({
    id: row.style.id,
    styleGroupId: row.style.styleGroupId,
    bjcpNumber: row.style.bjcpNumber,
    bjcpCategory: row.style.bjcpCategory,
    name: row.style.name,
    groupName: row.groupName,
    groupNameCz: row.groupNameCz,
    groupImageUrl: row.groupImageUrl,
    abvMin: row.style.abvMin,
    abvMax: row.style.abvMax,
    ibuMin: row.style.ibuMin,
    ibuMax: row.style.ibuMax,
    ebcMin: row.style.ebcMin,
    ebcMax: row.style.ebcMax,
    ogMin: row.style.ogMin,
    ogMax: row.style.ogMax,
    fgMin: row.style.fgMin,
    fgMax: row.style.fgMax,
    appearance: row.style.appearance,
    aroma: row.style.aroma,
    flavor: row.style.flavor,
    comments: row.style.comments,
    impression: row.style.impression,
    mouthfeel: row.style.mouthfeel,
    history: row.style.history,
    ingredients: row.style.ingredients,
    styleComparison: row.style.styleComparison,
    commercialExamples: row.style.commercialExamples,
    origin: row.style.origin,
    styleFamily: row.style.styleFamily,
  }));
}

export async function getBeerStyleGroupsForBrowser(): Promise<BeerStyleGroupRow[]> {
  const groups = await db
    .select()
    .from(beerStyleGroups)
    .orderBy(asc(beerStyleGroups.sortOrder));

  const styleCounts = await db
    .select({
      styleGroupId: beerStyles.styleGroupId,
    })
    .from(beerStyles);

  const countMap = new Map<string, number>();
  for (const row of styleCounts) {
    countMap.set(row.styleGroupId, (countMap.get(row.styleGroupId) ?? 0) + 1);
  }

  return groups.map((g): BeerStyleGroupRow => ({
    id: g.id,
    name: g.name,
    nameCz: g.nameCz,
    imageUrl: g.imageUrl,
    sortOrder: g.sortOrder ?? 0,
    styleCount: countMap.get(g.id) ?? 0,
  }));
}
