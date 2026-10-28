"use server";

import { and, desc, eq, lte, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { leases, meterReadings, meters } from "@/db/schema";
import { requireOrg } from "@/server/auth";
import { openingAndClosing } from "@/server/readings";

export type SaveReadingResult = { ok: true; status: "draft" | null } | { ok: false; error: string };

/**
 * Saves (or clears) this period's reading for one meter as a draft.
 * Readings lower than the opening are rejected unless the meter has a rollover point.
 */
export async function saveReading(meterId: string, period: string, raw: string): Promise<SaveReadingResult> {
  const ctx = await requireOrg();
  if (!/^\d{4}-\d{2}-01$/.test(period)) return { ok: false, error: "รอบบิลไม่ถูกต้อง" };
  const [meter] = await db
    .select()
    .from(meters)
    .where(and(eq(meters.id, meterId), eq(meters.orgId, ctx.orgId)));
  if (!meter) return { ok: false, error: "ไม่พบมิเตอร์" };

  const periodicHere = and(eq(meterReadings.meterId, meterId), eq(meterReadings.period, period), eq(meterReadings.kind, "periodic"));
  const text = raw.replace(/,/g, "").trim();

  if (text === "") {
    await db.delete(meterReadings).where(periodicHere);
    return { ok: true, status: null };
  }

  const value = Number(text);
  if (!Number.isFinite(value) || value < 0) return { ok: false, error: "ใส่ตัวเลข" };

  const [[lease], readings] = await Promise.all([
    db
      .select({ startDate: leases.startDate })
      .from(leases)
      .where(and(eq(leases.roomId, meter.roomId), eq(leases.status, "active"))),
    db
      .select()
      .from(meterReadings)
      .where(and(eq(meterReadings.meterId, meterId), lte(meterReadings.period, period)))
      .orderBy(desc(meterReadings.readAt)),
  ]);
  const opening = lease ? openingAndClosing(readings, period, { startDate: lease.startDate, endDate: null }).opening : null;
  if (opening && value < opening.value && meter.rolloverAt == null) {
    return { ok: false, error: `น้อยกว่าเลขครั้งก่อน (${opening.value})` };
  }

  // No revalidatePath: the sheet keeps its own state, and saving runs on every blur so it must stay fast.
  await db
    .insert(meterReadings)
    .values({ orgId: ctx.orgId, meterId, period, value, kind: "periodic", status: "draft", recordedBy: ctx.userId })
    .onConflictDoUpdate({
      target: [meterReadings.meterId, meterReadings.period],
      targetWhere: sql`kind = 'periodic'`,
      set: { value, status: "draft", readAt: new Date(), recordedBy: ctx.userId },
    });
  return { ok: true, status: "draft" };
}

/** Confirms every draft reading of the period so it can be billed. */
export async function confirmReadings(period: string): Promise<{ confirmed: number }> {
  const ctx = await requireOrg();
  const updated = await db
    .update(meterReadings)
    .set({ status: "confirmed" })
    .where(
      and(
        eq(meterReadings.orgId, ctx.orgId),
        eq(meterReadings.period, period),
        eq(meterReadings.kind, "periodic"),
        eq(meterReadings.status, "draft"),
      ),
    )
    .returning({ id: meterReadings.id });
  revalidatePath("/invoices");
  return { confirmed: updated.length };
}
