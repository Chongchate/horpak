import "server-only";
import { and, asc, eq, inArray, lt, max, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  chargeTypes,
  invoiceItems,
  invoiceSequences,
  invoices,
  leaseCharges,
  paymentAllocations,
  payments,
  rateTiers,
  roomCharges,
} from "@/db/schema";
import {
  dueDateFor,
  generateInvoiceItems,
  invoicePrefix,
  invoiceTotal,
  mergeWithDraft,
  monthRange,
  validateItems,
  type InvoiceItemDraft,
  type MeterSegment,
  type PastInvoice,
  type RatePlan,
  type UtilityInput,
} from "@/lib/billing";
import type { OrgContext } from "./auth";
import { ratesFor, type RatePlanRow } from "./queries";
import { leasesInPeriod, metersWithReadings, openingAndClosing } from "./readings";

export type InvoiceRow = typeof invoices.$inferSelect;
export type ItemRow = typeof invoiceItems.$inferSelect;

export type GenerateResult = {
  created: number;
  updated: number;
  skipped: { room: string; reason: string }[];
  warnings: { room: string; message: string }[];
};

const UTILITY_LABEL = { electric: "ไฟ", water: "น้ำ" } as const;

async function toRatePlan(row: RatePlanRow): Promise<RatePlan> {
  if (row.method === "flat") return { method: "flat", flatAmount: row.flatAmount ?? 0 };
  if (row.method === "tiered") {
    const tiers = await db.select().from(rateTiers).where(eq(rateTiers.ratePlanId, row.id)).orderBy(asc(rateTiers.fromUnit));
    return { method: "tiered", tiers, minCharge: row.minCharge };
  }
  return { method: "per_unit", unitPrice: row.unitPrice ?? 0, minCharge: row.minCharge };
}

export function itemFromRow(r: ItemRow): InvoiceItemDraft {
  return {
    itemKey: r.itemKey,
    type: r.type,
    source: r.source,
    description: r.description,
    quantity: r.quantity,
    unitPrice: r.unitPrice,
    calculatedAmount: r.calculatedAmount,
    amount: r.amount,
    overrideReason: r.overrideReason,
    excluded: r.excluded,
    chargeTypeId: r.chargeTypeId,
    meta: (r.meta as Record<string, unknown> | null) ?? undefined,
  };
}

function itemRows(orgId: string, invoiceId: string, items: InvoiceItemDraft[]): (typeof invoiceItems.$inferInsert)[] {
  return items.map((i, sortOrder) => ({
    orgId,
    invoiceId,
    itemKey: i.itemKey,
    type: i.type,
    source: i.source,
    description: i.description,
    quantity: i.quantity ?? null,
    unitPrice: i.unitPrice ?? null,
    calculatedAmount: i.calculatedAmount,
    amount: i.amount,
    overrideReason: i.overrideReason ?? null,
    excluded: i.excluded,
    chargeTypeId: i.chargeTypeId ?? null,
    meta: i.meta ?? null,
    sortOrder,
  }));
}

/**
 * Creates or refreshes draft invoices for every lease in the period.
 * Leases already issued are left alone; a lease whose meters are not confirmed is skipped.
 */
export async function generateDrafts(ctx: OrgContext, period: string, asOf: string, onlyLeaseId?: string): Promise<GenerateResult> {
  const result: GenerateResult = { created: 0, updated: 0, skipped: [], warnings: [] };
  const { first } = monthRange(period);
  const leaseRows = (await leasesInPeriod(ctx, period)).filter((l) => !onlyLeaseId || l.lease.id === onlyLeaseId);
  if (leaseRows.length === 0) return result;

  const leaseIds = leaseRows.map((l) => l.lease.id);
  const roomIds = leaseRows.map((l) => l.room.id);
  const p = ctx.property;

  const [rates, types, overrides, extras, existing, past, meterData] = await Promise.all([
    ratesFor(ctx, period),
    db.select().from(chargeTypes).where(and(eq(chargeTypes.orgId, ctx.orgId), eq(chargeTypes.propertyId, p.id))),
    db.select().from(roomCharges).where(and(eq(roomCharges.orgId, ctx.orgId), inArray(roomCharges.roomId, roomIds))),
    db.select().from(leaseCharges).where(and(eq(leaseCharges.orgId, ctx.orgId), inArray(leaseCharges.leaseId, leaseIds))),
    db
      .select()
      .from(invoices)
      .where(and(eq(invoices.orgId, ctx.orgId), eq(invoices.period, period), inArray(invoices.leaseId, leaseIds), ne(invoices.status, "void"))),
    pastInvoicesFor(ctx.orgId, leaseIds, period),
    metersWithReadings(ctx, roomIds, period),
  ]);
  const plans = {
    electric: rates.electric ? await toRatePlan(rates.electric) : null,
    water: rates.water ? await toRatePlan(rates.water) : null,
  };

  for (const { lease, room } of leaseRows) {
    const label = `ห้อง ${room.number}`;
    const current = existing.find((i) => i.leaseId === lease.id);
    if (current && current.status !== "draft") {
      result.skipped.push({ room: label, reason: "ออกบิลแล้ว" });
      continue;
    }

    // utilities from confirmed readings
    const utilities: UtilityInput[] = [];
    const problems: string[] = [];
    for (const utility of ["electric", "water"] as const) {
      const plan = plans[utility];
      if (!plan) {
        problems.push(`ยังไม่ได้ตั้งราคาค่า${UTILITY_LABEL[utility]}`);
        continue;
      }
      const segments: MeterSegment[] = [];
      const roomMeters = meterData.meters.filter(
        (m) => m.roomId === room.id && m.type === utility && (m.removedAt == null || m.removedAt >= first),
      );
      for (const m of roomMeters) {
        const readings = (meterData.readingsByMeter.get(m.id) ?? []).filter((r) => r.status === "confirmed");
        const { opening, closing } = openingAndClosing(readings, period, lease);
        if (opening && closing) {
          segments.push({ meterId: m.id, prev: opening.value, curr: closing.value, multiplier: m.multiplier, rolloverAt: m.rolloverAt });
        }
      }
      if (segments.length === 0 && plan.method !== "flat") {
        problems.push(`ยังไม่ได้ยืนยันเลขมิเตอร์${UTILITY_LABEL[utility]}`);
        continue;
      }
      utilities.push({ utility, segments, rate: plan });
    }
    if (problems.length) {
      result.skipped.push({ room: label, reason: problems.join(", ") });
      continue;
    }

    let generated;
    try {
      generated = generateInvoiceItems({
        period,
        asOf,
        proration: { mode: p.prorationMode, halfMonthCutoffDay: p.halfMonthCutoffDay },
        lateFee: { mode: p.lateFeeMode, amount: p.lateFeeAmount, max: p.lateFeeMax, graceDays: p.lateFeeGraceDays },
        lease: { rent: lease.rent, startDate: lease.startDate, endDate: lease.endDate },
        utilities,
        chargeTypes: types,
        roomCharges: overrides.filter((o) => o.roomId === room.id),
        leaseCharges: extras.filter((e) => e.leaseId === lease.id),
        pastInvoices: past.filter((x) => x.leaseId === lease.id),
      });
    } catch (e) {
      result.skipped.push({ room: label, reason: e instanceof Error ? e.message : "คำนวณไม่ได้" });
      continue;
    }
    for (const message of generated.warnings) result.warnings.push({ room: label, message });

    await db.transaction(async (tx) => {
      let invoiceId: string;
      let items = generated.items;
      if (current) {
        invoiceId = current.id;
        const old = await tx.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, current.id));
        const merged = mergeWithDraft(generated.items, old.map(itemFromRow));
        items = merged.items.map((i) => (merged.staleOverrides.includes(i.itemKey) ? { ...i, meta: { ...i.meta, staleOverride: true } } : i));
        await tx.delete(invoiceItems).where(eq(invoiceItems.invoiceId, current.id));
        await tx.update(invoices).set({ total: invoiceTotal(items), updatedAt: new Date() }).where(eq(invoices.id, current.id));
        result.updated++;
      } else {
        [{ id: invoiceId }] = await tx
          .insert(invoices)
          .values({ orgId: ctx.orgId, leaseId: lease.id, roomId: room.id, period, total: invoiceTotal(items) })
          .returning({ id: invoices.id });
        result.created++;
      }
      await tx.insert(invoiceItems).values(itemRows(ctx.orgId, invoiceId, items));
    });
  }
  return result;
}

/** Earlier issued invoices of these leases that have not had a late fee yet. */
async function pastInvoicesFor(orgId: string, leaseIds: string[], period: string): Promise<(PastInvoice & { leaseId: string })[]> {
  const rows = await db
    .select({
      id: invoices.id,
      leaseId: invoices.leaseId,
      invoiceNo: invoices.invoiceNo,
      dueDate: invoices.dueDate,
      status: invoices.status,
      lastPaidAt: max(payments.paidAt),
    })
    .from(invoices)
    .leftJoin(paymentAllocations, eq(paymentAllocations.invoiceId, invoices.id))
    .leftJoin(payments, and(eq(payments.id, paymentAllocations.paymentId), eq(payments.status, "approved")))
    .where(
      and(
        eq(invoices.orgId, orgId),
        inArray(invoices.leaseId, leaseIds),
        lt(invoices.period, period),
        inArray(invoices.status, ["issued", "partially_paid", "paid"]),
        eq(invoices.lateFeeBilled, false),
      ),
    )
    .groupBy(invoices.id);

  return rows
    .filter((r) => r.dueDate && r.invoiceNo)
    .map((r) => ({
      id: r.id,
      leaseId: r.leaseId,
      invoiceNo: r.invoiceNo!,
      dueDate: r.dueDate!,
      fullyPaidOn: r.status === "paid" && r.lastPaidAt ? r.lastPaidAt.toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" }) : null,
      lateFeeBilled: false,
    }));
}

export async function getInvoice(ctx: OrgContext, id: string) {
  const [invoice] = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.id, id), eq(invoices.orgId, ctx.orgId)));
  if (!invoice) return null;
  const items = await db.select().from(invoiceItems).where(eq(invoiceItems.invoiceId, id)).orderBy(asc(invoiceItems.sortOrder));
  return { invoice, items };
}

/** Recomputes a draft's total after its items changed. */
export async function saveDraftItems(ctx: OrgContext, invoiceId: string, items: InvoiceItemDraft[]) {
  await db.transaction(async (tx) => {
    await tx.delete(invoiceItems).where(eq(invoiceItems.invoiceId, invoiceId));
    if (items.length) await tx.insert(invoiceItems).values(itemRows(ctx.orgId, invoiceId, items));
    await tx
      .update(invoices)
      .set({ total: invoiceTotal(items), updatedAt: new Date() })
      .where(and(eq(invoices.id, invoiceId), eq(invoices.orgId, ctx.orgId)));
  });
}

export async function issueInvoice(ctx: OrgContext, invoiceId: string, issueDate: string): Promise<{ error?: string }> {
  const data = await getInvoice(ctx, invoiceId);
  if (!data) return { error: "ไม่พบบิล" };
  if (data.invoice.status !== "draft") return { error: "บิลนี้ออกไปแล้ว" };
  const items = data.items.map(itemFromRow);
  const errors = validateItems(items);
  if (errors.length) return { error: errors.join("\n") };

  const prefix = invoicePrefix(data.invoice.period);
  await db.transaction(async (tx) => {
    const [{ lastNo }] = await tx
      .insert(invoiceSequences)
      .values({ orgId: ctx.orgId, prefix, lastNo: 1 })
      .onConflictDoUpdate({ target: [invoiceSequences.orgId, invoiceSequences.prefix], set: { lastNo: sql`${invoiceSequences.lastNo} + 1` } })
      .returning({ lastNo: invoiceSequences.lastNo });

    await tx
      .update(invoices)
      .set({
        status: "issued",
        invoiceNo: `${prefix}-${String(lastNo).padStart(3, "0")}`,
        issueDate,
        dueDate: dueDateFor(issueDate, ctx.property.dueDay),
        total: invoiceTotal(items),
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, invoiceId));

    const billedLateFees = items
      .filter((i) => i.type === "late_fee" && !i.excluded && typeof i.meta?.invoiceId === "string")
      .map((i) => i.meta!.invoiceId as string);
    if (billedLateFees.length) {
      await tx
        .update(invoices)
        .set({ lateFeeBilled: true })
        .where(and(eq(invoices.orgId, ctx.orgId), inArray(invoices.id, billedLateFees)));
    }
  });
  return {};
}
