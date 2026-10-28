import "server-only";
import { and, eq, inArray, lte } from "drizzle-orm";
import { db } from "@/db";
import { leaseResidents, leases, meterReadings, meters, residents, rooms } from "@/db/schema";
import { monthRange } from "@/lib/billing";
import type { OrgContext } from "./auth";

export type Reading = typeof meterReadings.$inferSelect;
export type Meter = typeof meters.$inferSelect;
export type Lease = typeof leases.$inferSelect;

/**
 * The opening and closing reading of one meter for one lease in one billing period.
 *
 * - opening: the move-in reading if the lease started this period, otherwise the latest
 *   confirmed reading from an earlier period (or this period's meter install).
 * - closing: the move-out reading if the lease ended this period, otherwise this period's
 *   periodic reading (draft or confirmed — callers decide whether drafts count).
 */
export function openingAndClosing(meterReadingsDesc: Reading[], period: string, lease: Pick<Lease, "startDate" | "endDate">) {
  const { first, last } = monthRange(period);
  const startsHere = lease.startDate >= first && lease.startDate <= last;
  const endsHere = lease.endDate != null && lease.endDate >= first && lease.endDate <= last;
  const inPeriod = meterReadingsDesc.filter((r) => r.period === period);

  const opening = startsHere
    ? inPeriod.find((r) => r.kind === "move_in")
    : meterReadingsDesc.find((r) => r.status === "confirmed" && (r.period < period || (r.period === period && r.kind === "install")));
  const closing = endsHere ? inPeriod.find((r) => r.kind === "move_out") : inPeriod.find((r) => r.kind === "periodic");

  return { opening: opening ?? null, closing: closing ?? null };
}

/** Leases that cover any part of `period`, with room and primary resident. */
export async function leasesInPeriod(ctx: OrgContext, period: string, { activeOnly = false } = {}) {
  const { first, last } = monthRange(period);
  const rows = await db
    .select({ lease: leases, room: rooms, firstName: residents.firstName, lastName: residents.lastName })
    .from(leases)
    .innerJoin(rooms, eq(rooms.id, leases.roomId))
    .leftJoin(leaseResidents, and(eq(leaseResidents.leaseId, leases.id), eq(leaseResidents.isPrimary, true)))
    .leftJoin(residents, eq(residents.id, leaseResidents.residentId))
    .where(and(eq(leases.orgId, ctx.orgId), eq(rooms.propertyId, ctx.property.id), lte(leases.startDate, last)));

  return rows
    .filter(({ lease }) => !activeOnly || lease.status === "active")
    .filter(({ lease }) => lease.endDate == null || lease.endDate >= first)
    .sort((a, b) => (a.room.floor ?? 0) - (b.room.floor ?? 0) || a.room.number.localeCompare(b.room.number, "th", { numeric: true }));
}

/** Meters of the given rooms and all their readings up to `period`, newest first. */
export async function metersWithReadings(ctx: OrgContext, roomIds: string[], period: string) {
  if (roomIds.length === 0) return { meters: [] as Meter[], readingsByMeter: new Map<string, Reading[]>() };
  const roomMeters = await db
    .select()
    .from(meters)
    .where(and(eq(meters.orgId, ctx.orgId), inArray(meters.roomId, roomIds)));
  const readings = roomMeters.length
    ? await db
        .select()
        .from(meterReadings)
        .where(and(inArray(meterReadings.meterId, roomMeters.map((m) => m.id)), lte(meterReadings.period, period)))
    : [];
  readings.sort((a, b) => b.readAt.getTime() - a.readAt.getTime());

  const readingsByMeter = new Map<string, Reading[]>();
  for (const r of readings) readingsByMeter.set(r.meterId, [...(readingsByMeter.get(r.meterId) ?? []), r]);
  return { meters: roomMeters, readingsByMeter };
}

export type SheetRow = {
  roomId: string;
  roomNumber: string;
  floor: number | null;
  residentName: string | null;
  meters: {
    meterId: string;
    type: "electric" | "water";
    rolloverAt: number | null;
    opening: number | null;
    openingIsMoveIn: boolean;
    current: number | null;
    status: "draft" | "confirmed" | null;
  }[];
};

/** Rows for the meter reading sheet: every occupied room with its opening reading and this period's entry. */
export async function meterSheet(ctx: OrgContext, period: string): Promise<SheetRow[]> {
  const active = await leasesInPeriod(ctx, period, { activeOnly: true });
  const { meters: roomMeters, readingsByMeter } = await metersWithReadings(
    ctx,
    active.map((a) => a.room.id),
    period,
  );

  return active.map(({ lease, room, firstName }) => ({
    roomId: room.id,
    roomNumber: room.number,
    floor: room.floor,
    residentName: firstName,
    meters: roomMeters
      .filter((m) => m.roomId === room.id && m.removedAt == null)
      .sort((a, b) => a.type.localeCompare(b.type))
      .map((m) => {
        const { opening } = openingAndClosing(readingsByMeter.get(m.id) ?? [], period, { startDate: lease.startDate, endDate: null });
        const current = (readingsByMeter.get(m.id) ?? []).find((r) => r.period === period && r.kind === "periodic");
        return {
          meterId: m.id,
          type: m.type,
          rolloverAt: m.rolloverAt,
          opening: opening?.value ?? null,
          openingIsMoveIn: opening?.kind === "move_in",
          current: current?.value ?? null,
          status: current?.status ?? null,
        };
      }),
  }));
}
