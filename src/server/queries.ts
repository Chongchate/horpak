import "server-only";
import { and, asc, desc, eq, lte } from "drizzle-orm";
import { db } from "@/db";
import { chargeTypes, ratePlans } from "@/db/schema";
import type { OrgContext } from "./auth";

export type RatePlanRow = typeof ratePlans.$inferSelect;

/** The rate plan in force for each utility in `period`. */
export async function ratesFor(ctx: OrgContext, period: string): Promise<Record<"electric" | "water", RatePlanRow | undefined>> {
  const rows = await db
    .select()
    .from(ratePlans)
    .where(and(eq(ratePlans.orgId, ctx.orgId), eq(ratePlans.propertyId, ctx.property.id), lte(ratePlans.effectiveFrom, period)))
    .orderBy(desc(ratePlans.effectiveFrom));
  return {
    electric: rows.find((r) => r.utility === "electric"),
    water: rows.find((r) => r.utility === "water"),
  };
}

export function listChargeTypes(ctx: OrgContext) {
  return db
    .select()
    .from(chargeTypes)
    .where(and(eq(chargeTypes.orgId, ctx.orgId), eq(chargeTypes.propertyId, ctx.property.id)))
    .orderBy(asc(chargeTypes.createdAt));
}
