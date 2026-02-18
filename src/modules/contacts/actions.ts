"use server";

import { withTenant } from "@/lib/db/with-tenant";
import { db } from "@/lib/db";
import { contacts } from "@/../drizzle/schema/partners";
import { partners } from "@/../drizzle/schema/partners";
import { eq, and, or, ilike } from "drizzle-orm";
import type { ContactWithPartner } from "./types";

/**
 * Get all contacts across all partners (flat list).
 * Joins with partners to include partner name.
 */
export async function getAllContacts(filter?: {
  search?: string;
}): Promise<ContactWithPartner[]> {
  return withTenant(async (tenantId) => {
    const rows = await db
      .select({
        id: contacts.id,
        tenantId: contacts.tenantId,
        partnerId: contacts.partnerId,
        partnerName: partners.name,
        name: contacts.name,
        position: contacts.position,
        email: contacts.email,
        phone: contacts.phone,
        mobile: contacts.mobile,
        isPrimary: contacts.isPrimary,
        notes: contacts.notes,
        createdAt: contacts.createdAt,
        updatedAt: contacts.updatedAt,
      })
      .from(contacts)
      .innerJoin(partners, eq(partners.id, contacts.partnerId))
      .where(
        and(
          eq(contacts.tenantId, tenantId),
          filter?.search
            ? or(
                ilike(contacts.name, `%${filter.search}%`),
                ilike(contacts.email, `%${filter.search}%`),
                ilike(partners.name, `%${filter.search}%`)
              )
            : undefined
        )
      );

    return rows as ContactWithPartner[];
  });
}
