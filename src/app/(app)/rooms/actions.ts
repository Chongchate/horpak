"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/components/client";
import { db } from "@/db";
import { leaseResidents, leases, meterReadings, meters, residents, roomCharges, rooms } from "@/db/schema";
import { parseBaht, parseNumber, todayISO } from "@/lib/format";
import { requireOrg } from "@/server/auth";
import { listChargeTypes } from "@/server/queries";

const MAX_BATCH = 60;

/** Adds one room, or a run like 101–110 on one floor. Each room gets an electric and a water meter. */
export async function addRooms(_: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireOrg();
  const floor = parseNumber(formData.get("floor"));
  const from = parseNumber(formData.get("from"));
  const to = parseNumber(formData.get("to")) ?? from;
  const baseRent = parseBaht(formData.get("baseRent"));

  if (from == null || to == null || !Number.isInteger(from) || !Number.isInteger(to)) return { error: "ใส่เลขห้องเป็นตัวเลข" };
  if (to < from) return { error: "เลขห้องสุดท้ายต้องไม่น้อยกว่าห้องแรก" };
  if (to - from + 1 > MAX_BATCH) return { error: `เพิ่มได้ครั้งละไม่เกิน ${MAX_BATCH} ห้อง` };
  if (!baseRent) return { error: "ใส่ค่าเช่าต่อเดือน" };

  const numbers = Array.from({ length: to - from + 1 }, (_, i) => String(from + i));
  const today = todayISO();

  const created = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(rooms)
      .values(numbers.map((number) => ({ orgId: ctx.orgId, propertyId: ctx.property.id, number, floor, baseRent })))
      .onConflictDoNothing()
      .returning({ id: rooms.id });
    if (inserted.length) {
      await tx.insert(meters).values(
        inserted.flatMap((r) => [
          { orgId: ctx.orgId, roomId: r.id, type: "electric" as const, installedAt: today },
          { orgId: ctx.orgId, roomId: r.id, type: "water" as const, installedAt: today },
        ]),
      );
    }
    return inserted.length;
  });

  revalidatePath("/rooms");
  const skipped = numbers.length - created;
  return { ok: `เพิ่ม ${created} ห้องแล้ว${skipped ? ` (ข้าม ${skipped} ห้องที่มีอยู่แล้ว)` : ""}` };
}

async function ownRoom(orgId: string, roomId: string) {
  const [room] = await db.select().from(rooms).where(and(eq(rooms.id, roomId), eq(rooms.orgId, orgId)));
  return room ?? null;
}

export async function updateRoom(_: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireOrg();
  const room = await ownRoom(ctx.orgId, String(formData.get("roomId")));
  if (!room) return { error: "ไม่พบห้อง" };

  const number = String(formData.get("number") ?? "").trim();
  const baseRent = parseBaht(formData.get("baseRent"));
  const status = String(formData.get("status") ?? room.status) as typeof room.status;
  if (!number) return { error: "ใส่เลขห้อง" };
  if (!baseRent) return { error: "ใส่ค่าเช่า" };
  if (room.status === "occupied" && status !== "occupied") return { error: "ห้องมีผู้เช่าอยู่ ย้ายผู้เช่าออกก่อนเปลี่ยนสถานะ" };
  if (room.status !== "occupied" && status === "occupied") return { error: "ใช้ปุ่มย้ายเข้าเพื่อเพิ่มผู้เช่า" };

  try {
    await db
      .update(rooms)
      .set({ number, floor: parseNumber(formData.get("floor")), baseRent, status, updatedAt: new Date() })
      .where(eq(rooms.id, room.id));
  } catch {
    return { error: `มีห้อง ${number} อยู่แล้ว` };
  }
  revalidatePath(`/rooms/${room.id}`);
  return { ok: "บันทึกแล้ว" };
}

/** Saves which charges apply to this room. Only differences from the property defaults are stored. */
export async function saveRoomCharges(_: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireOrg();
  const room = await ownRoom(ctx.orgId, String(formData.get("roomId")));
  if (!room) return { error: "ไม่พบห้อง" };

  const types = await listChargeTypes(ctx);
  const rows: (typeof roomCharges.$inferInsert)[] = [];
  for (const ct of types) {
    const enabled = formData.get(`enabled:${ct.id}`) === "on";
    const amount = parseBaht(formData.get(`amount:${ct.id}`));
    const customAmount = amount != null && amount !== ct.defaultAmount ? amount : null;
    if (enabled !== ct.applyByDefault || customAmount != null) {
      rows.push({ orgId: ctx.orgId, roomId: room.id, chargeTypeId: ct.id, enabled, amount: customAmount });
    }
  }

  await db.transaction(async (tx) => {
    await tx.delete(roomCharges).where(and(eq(roomCharges.roomId, room.id), eq(roomCharges.orgId, ctx.orgId)));
    if (rows.length) await tx.insert(roomCharges).values(rows);
  });
  revalidatePath(`/rooms/${room.id}`);
  return { ok: "บันทึกแล้ว" };
}

const periodOf = (date: string) => `${date.slice(0, 7)}-01`;

export async function moveIn(_: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireOrg();
  const room = await ownRoom(ctx.orgId, String(formData.get("roomId")));
  if (!room) return { error: "ไม่พบห้อง" };
  if (room.status === "occupied") return { error: "ห้องนี้มีผู้เช่าอยู่แล้ว" };

  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const startDate = String(formData.get("startDate") ?? "");
  const rent = parseBaht(formData.get("rent"));
  const deposit = parseBaht(formData.get("deposit")) ?? 0;
  const electric = parseNumber(formData.get("electric"));
  const water = parseNumber(formData.get("water"));

  if (!firstName) return { error: "ใส่ชื่อผู้เช่า" };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return { error: "ใส่วันที่เริ่มเช่า" };
  if (!rent) return { error: "ใส่ค่าเช่า" };
  if (electric == null || water == null || electric < 0 || water < 0) return { error: "ใส่เลขมิเตอร์ไฟและน้ำ ณ วันที่เข้าพัก" };

  const roomMeters = await db
    .select()
    .from(meters)
    .where(and(eq(meters.roomId, room.id), eq(meters.orgId, ctx.orgId)));
  const meterOf = (type: "electric" | "water") => roomMeters.find((m) => m.type === type && m.removedAt == null);

  await db.transaction(async (tx) => {
    const [resident] = await tx
      .insert(residents)
      .values({ orgId: ctx.orgId, firstName, lastName, phone: String(formData.get("phone") ?? "").trim() || null })
      .returning({ id: residents.id });
    const [lease] = await tx
      .insert(leases)
      .values({ orgId: ctx.orgId, roomId: room.id, startDate, rent, deposit })
      .returning({ id: leases.id });
    await tx.insert(leaseResidents).values({ orgId: ctx.orgId, leaseId: lease.id, residentId: resident.id, isPrimary: true });

    for (const [type, value] of [["electric", electric], ["water", water]] as const) {
      let meter = meterOf(type);
      if (!meter) {
        [meter] = await tx.insert(meters).values({ orgId: ctx.orgId, roomId: room.id, type, installedAt: startDate }).returning();
      }
      await tx.insert(meterReadings).values({
        orgId: ctx.orgId,
        meterId: meter.id,
        period: periodOf(startDate),
        value,
        kind: "move_in",
        status: "confirmed",
        readAt: new Date(`${startDate}T00:00:00+07:00`),
        recordedBy: ctx.userId,
      });
    }
    await tx.update(rooms).set({ status: "occupied", updatedAt: new Date() }).where(eq(rooms.id, room.id));
  });

  revalidatePath("/rooms");
  revalidatePath(`/rooms/${room.id}`);
  return { ok: "บันทึกผู้เช่าแล้ว" };
}

export async function updateLeaseRent(_: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireOrg();
  const rent = parseBaht(formData.get("rent"));
  if (!rent) return { error: "ใส่ค่าเช่า" };
  const updated = await db
    .update(leases)
    .set({ rent, updatedAt: new Date() })
    .where(and(eq(leases.id, String(formData.get("leaseId"))), eq(leases.orgId, ctx.orgId), eq(leases.status, "active")))
    .returning({ roomId: leases.roomId });
  if (!updated.length) return { error: "ไม่พบสัญญา" };
  revalidatePath(`/rooms/${updated[0].roomId}`);
  return { ok: "บันทึกแล้ว ใช้กับบิลรอบถัดไป" };
}

export async function moveOut(_: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireOrg();
  const [lease] = await db
    .select()
    .from(leases)
    .where(and(eq(leases.id, String(formData.get("leaseId"))), eq(leases.orgId, ctx.orgId), eq(leases.status, "active")));
  if (!lease) return { error: "ไม่พบสัญญา" };

  const date = String(formData.get("date") ?? "");
  const electric = parseNumber(formData.get("electric"));
  const water = parseNumber(formData.get("water"));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "ใส่วันที่ย้ายออก" };
  if (date < lease.startDate) return { error: "วันที่ย้ายออกต้องไม่ก่อนวันที่เข้าพัก" };
  if (electric == null || water == null) return { error: "ใส่เลขมิเตอร์ไฟและน้ำ ณ วันที่ย้ายออก" };

  const roomMeters = await db
    .select()
    .from(meters)
    .where(and(eq(meters.roomId, lease.roomId), eq(meters.orgId, ctx.orgId)));

  await db.transaction(async (tx) => {
    for (const [type, value] of [["electric", electric], ["water", water]] as const) {
      const meter = roomMeters.find((m) => m.type === type && m.removedAt == null);
      if (!meter) continue;
      await tx.insert(meterReadings).values({
        orgId: ctx.orgId,
        meterId: meter.id,
        period: periodOf(date),
        value,
        kind: "move_out",
        status: "confirmed",
        readAt: new Date(`${date}T23:59:00+07:00`),
        recordedBy: ctx.userId,
      });
    }
    await tx.update(leases).set({ status: "ended", endDate: date, movedOutAt: date, updatedAt: new Date() }).where(eq(leases.id, lease.id));
    await tx.update(rooms).set({ status: "vacant", updatedAt: new Date() }).where(eq(rooms.id, lease.roomId));
  });

  revalidatePath("/rooms");
  redirect(`/rooms/${lease.roomId}`);
}
