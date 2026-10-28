import "server-only";
import { asc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "@/db";
import { members, organizations, properties } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";

/** The signed-in user's id, or a redirect to /login. */
export const requireUserId = cache(async (): Promise<string> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const sub = data?.claims?.sub;
  if (!sub) redirect("/login");
  return sub;
});

export type OrgContext = {
  userId: string;
  orgId: string;
  orgName: string;
  role: "owner" | "admin" | "staff";
  property: typeof properties.$inferSelect;
};

/**
 * The org and property the current user works in. Server code talks to the DB as
 * the owner role (bypassing RLS), so every query must filter by `ctx.orgId`.
 * The UI manages one property per org for now.
 */
export const requireOrg = cache(async (): Promise<OrgContext> => {
  const userId = await requireUserId();
  // One round trip: membership, org and its first property together.
  const [row] = await db
    .select({ orgId: members.orgId, role: members.role, orgName: organizations.name, property: properties })
    .from(members)
    .innerJoin(organizations, eq(organizations.id, members.orgId))
    .innerJoin(properties, eq(properties.orgId, members.orgId))
    .where(eq(members.userId, userId))
    .orderBy(asc(members.createdAt), asc(properties.createdAt))
    .limit(1);
  if (!row) redirect("/onboarding");

  return { userId, orgId: row.orgId, orgName: row.orgName, role: row.role, property: row.property };
});
