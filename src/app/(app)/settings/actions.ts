"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/client";
import { db } from "@/db";
import { chargeTypes, properties, ratePlans } from "@/db/schema";
import { bahtInput, currentPeriod, parseBaht, parseNumber } from "@/lib/format";
import { requireOrg } from "@/server/auth";

const SAVED = { ok: "บันทึกแล้ว" };

function dayOfMonth(v: FormDataEntryValue | null): number | null {
  const n = parseNumber(v);
  return n != null && Number.isInteger(n) && n >= 1 && n <= 28 ? n : null;
}

export async function saveProperty(_: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireOrg();
  const name = String(formData.get("name") ?? "").trim();
  const billingDay = dayOfMonth(formData.get("billingDay"));
  const dueDay = dayOfMonth(formData.get("dueDay"));
  if (!name) return { error: "กรุณาใส่ชื่อหอพัก" };
  if (!billingDay || !dueDay) return { error: "วันที่ต้องอยู่ระหว่าง 1–28" };

  await db
    .update(properties)
    .set({
      name,
      address: String(formData.get("address") ?? "").trim() || null,
      promptpayId: String(formData.get("promptpayId") ?? "").replace(/[\s-]/g, "") || null,
      billingDay,
      dueDay,
      updatedAt: new Date(),
    })
    .where(and(eq(properties.id, ctx.property.id), eq(properties.orgId, ctx.orgId)));
  revalidatePath("/", "layout");
  return SAVED;
}

export async function saveBillingRules(_: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireOrg();
  const prorationMode = String(formData.get("prorationMode")) as "none" | "half_month" | "daily";
  const lateFeeMode = String(formData.get("lateFeeMode")) as "off" | "per_day" | "fixed";
  const cutoff = dayOfMonth(formData.get("halfMonthCutoffDay"));
  if (lateFeeMode === "off") {
    // the amount fields are hidden while off; keep whatever was saved before
    formData.set("lateFeeAmount", bahtInput(ctx.property.lateFeeAmount || null));
    formData.set("lateFeeMax", bahtInput(ctx.property.lateFeeMax));
    formData.set("lateFeeGraceDays", String(ctx.property.lateFeeGraceDays));
  }
  const lateFeeAmount = parseBaht(formData.get("lateFeeAmount")) ?? 0;
  const lateFeeMax = parseBaht(formData.get("lateFeeMax"));
  const grace = parseNumber(formData.get("lateFeeGraceDays")) ?? 0;

  if (!["none", "half_month", "daily"].includes(prorationMode)) return { error: "เลือกวิธีคิดค่าเช่า" };
  if (!["off", "per_day", "fixed"].includes(lateFeeMode)) return { error: "เลือกวิธีคิดค่าปรับ" };
  if (prorationMode === "half_month" && !cutoff) return { error: "วันตัดรอบต้องอยู่ระหว่าง 1–28" };
  if (lateFeeMode !== "off" && lateFeeAmount <= 0) return { error: "ใส่จำนวนค่าปรับ" };

  await db
    .update(properties)
    .set({
      prorationMode,
      halfMonthCutoffDay: cutoff ?? ctx.property.halfMonthCutoffDay,
      lateFeeMode,
      lateFeeAmount,
      lateFeeMax: lateFeeMode === "fixed" ? null : lateFeeMax,
      lateFeeGraceDays: Math.max(0, Math.floor(grace)),
      updatedAt: new Date(),
    })
    .where(and(eq(properties.id, ctx.property.id), eq(properties.orgId, ctx.orgId)));
  revalidatePath("/settings");
  return SAVED;
}

/**
 * Rate changes never edit history: a new plan starts this month. Editing again
 * within the same month updates that month's plan.
 */
export async function saveRate(_: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireOrg();
  const utility = String(formData.get("utility")) as "electric" | "water";
  const method = String(formData.get("method")) as "per_unit" | "flat";
  const unitPrice = parseBaht(formData.get("unitPrice"));
  const minCharge = parseBaht(formData.get("minCharge"));
  const flatAmount = parseBaht(formData.get("flatAmount"));

  if (!["electric", "water"].includes(utility) || !["per_unit", "flat"].includes(method)) return { error: "ข้อมูลไม่ถูกต้อง" };
  if (method === "per_unit" && !unitPrice) return { error: "ใส่ราคาต่อหน่วย" };
  if (method === "flat" && !flatAmount) return { error: "ใส่ราคาเหมาจ่าย" };

  const effectiveFrom = currentPeriod();
  const values = {
    method,
    unitPrice: method === "per_unit" ? unitPrice : null,
    minCharge: method === "per_unit" ? minCharge : null,
    flatAmount: method === "flat" ? flatAmount : null,
  };
  const where = and(
    eq(ratePlans.orgId, ctx.orgId),
    eq(ratePlans.propertyId, ctx.property.id),
    eq(ratePlans.utility, utility),
    eq(ratePlans.effectiveFrom, effectiveFrom),
  );
  const updated = await db.update(ratePlans).set(values).where(where).returning({ id: ratePlans.id });
  if (updated.length === 0) {
    await db.insert(ratePlans).values({ orgId: ctx.orgId, propertyId: ctx.property.id, utility, effectiveFrom, ...values });
  }
  revalidatePath("/settings");
  return { ok: "บันทึกแล้ว ใช้กับบิลตั้งแต่เดือนนี้" };
}

export async function saveChargeType(_: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireOrg();
  const id = String(formData.get("id") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const defaultAmount = parseBaht(formData.get("defaultAmount"));
  if (!name) return { error: "ใส่ชื่อค่าบริการ" };
  if (defaultAmount == null || defaultAmount < 0) return { error: "ใส่จำนวนเงิน" };

  const values = {
    name,
    defaultAmount,
    applyByDefault: formData.get("applyByDefault") === "on",
    prorate: formData.get("prorate") === "on",
    active: id ? formData.get("active") === "on" : true,
  };
  if (id) {
    await db
      .update(chargeTypes)
      .set({ ...values, updatedAt: new Date() })
      .where(and(eq(chargeTypes.id, id), eq(chargeTypes.orgId, ctx.orgId)));
  } else {
    await db.insert(chargeTypes).values({ orgId: ctx.orgId, propertyId: ctx.property.id, ...values });
  }
  revalidatePath("/settings");
  return id ? SAVED : { ok: `เพิ่ม${name}แล้ว` };
}
