import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { leaseResidents, leases, meterReadings, meters, residents, roomCharges, rooms } from "@/db/schema";
import type { OrgContext } from "./auth";

export type RoomRow = Awaited<ReturnType<typeof listRooms>>[number];

/** All rooms with their active lease and primary resident. */
export async function listRooms(ctx: OrgContext) {
  const rows = await db
    .select({
      id: rooms.id,
      number: rooms.number,
      floor: rooms.floor,
      baseRent: rooms.baseRent,
      status: rooms.status,
      leaseId: leases.id,
      rent: leases.rent,
      startDate: leases.startDate,
      firstName: residents.firstName,
      lastName: residents.lastName,
    })
    .from(rooms)
    .leftJoin(leases, and(eq(leases.roomId, rooms.id), eq(leases.status, "active")))
    .leftJoin(leaseResidents, and(eq(leaseResidents.leaseId, leases.id), eq(leaseResidents.isPrimary, true)))
    .leftJoin(residents, eq(residents.id, leaseResidents.residentId))
    .where(and(eq(rooms.orgId, ctx.orgId), eq(rooms.propertyId, ctx.property.id)));

  return rows.sort((a, b) => (a.floor ?? 0) - (b.floor ?? 0) || a.number.localeCompare(b.number, "th", { numeric: true }));
}

export async function getRoom(ctx: OrgContext, roomId: string) {
  const [room] = await db
    .select()
    .from(rooms)
    .where(and(eq(rooms.id, roomId), eq(rooms.orgId, ctx.orgId)));
  if (!room) return null;

  const [lease] = await db
    .select()
    .from(leases)
    .where(and(eq(leases.roomId, roomId), eq(leases.status, "active"), eq(leases.orgId, ctx.orgId)));

  const people = lease
    ? await db
        .select({ resident: residents, isPrimary: leaseResidents.isPrimary })
        .from(leaseResidents)
        .innerJoin(residents, eq(residents.id, leaseResidents.residentId))
        .where(eq(leaseResidents.leaseId, lease.id))
        .orderBy(desc(leaseResidents.isPrimary))
    : [];

  const roomMeters = await db
    .select()
    .from(meters)
    .where(and(eq(meters.roomId, roomId), eq(meters.orgId, ctx.orgId)))
    .orderBy(asc(meters.type));
  const activeMeters = roomMeters.filter((m) => m.removedAt == null);

  const readings = activeMeters.length
    ? await db
        .select()
        .from(meterReadings)
        .where(inArray(meterReadings.meterId, activeMeters.map((m) => m.id)))
        .orderBy(desc(meterReadings.readAt))
        .limit(40)
    : [];

  const overrides = await db.select().from(roomCharges).where(and(eq(roomCharges.roomId, roomId), eq(roomCharges.orgId, ctx.orgId)));

  return {
    room,
    lease: lease ?? null,
    people,
    meters: activeMeters.map((m) => ({ ...m, last: readings.find((r) => r.meterId === m.id) ?? null })),
    overrides,
  };
}
