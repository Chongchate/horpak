"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/client";
import { db } from "@/db";
import { invoices } from "@/db/schema";
import { DraftEditError, excludeItem, includeItem, manualItem, overrideAmount, type InvoiceItemType } from "@/lib/billing";
import { parseBaht, todayISO } from "@/lib/format";
import { requireOrg, type OrgContext } from "@/server/auth";
import { generateDrafts, getInvoice, issueInvoice, itemFromRow, saveDraftItems } from "@/server/billing";

export async function generateForPeriod(_: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireOrg();
  const period = String(formData.get("period"));
  const r = await generateDrafts(ctx, period, todayISO());
  revalidatePath("/invoices");

  const lines: string[] = [];
  if (r.created || r.updated) {
    lines.push([r.created && `สร้างบิลใหม่ ${r.created} ใบ`, r.updated && `คำนวณบิลร่างใหม่ ${r.updated} ใบ`].filter(Boolean).join(" "));
  }
  for (const s of r.skipped.filter((s) => s.reason !== "ออกบิลแล้ว")) lines.push(`${s.room}: ${s.reason}`);
  for (const w of r.warnings) lines.push(`${w.room}: ${w.message}`);
  if (lines.length === 0) return { ok: "บิลทุกห้องออกไปแล้ว" };
  return r.created || r.updated ? { ok: lines.join("\n") } : { error: lines.join("\n") };
}

export async function issueAllDrafts(_: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireOrg();
  const period = String(formData.get("period"));
  const drafts = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(and(eq(invoices.orgId, ctx.orgId), eq(invoices.period, period), eq(invoices.status, "draft")));

  const failed: string[] = [];
  for (const d of drafts) {
    const r = await issueInvoice(ctx, d.id, todayISO());
    if (r.error) failed.push(r.error);
  }
  revalidatePath("/invoices");
  const issued = drafts.length - failed.length;
  return failed.length ? { error: `ออกบิลได้ ${issued} ใบ อีก ${failed.length} ใบต้องแก้ก่อน:\n${failed.join("\n")}` } : { ok: `ออกบิล ${issued} ใบแล้ว` };
}

// ---------------------------------------------------------------------------
// single invoice

async function loadDraft(ctx: OrgContext, invoiceId: string) {
  const data = await getInvoice(ctx, invoiceId);
  if (!data) throw new DraftEditError("ไม่พบบิล");
  if (data.invoice.status !== "draft") throw new DraftEditError("บิลที่ออกแล้วแก้ไม่ได้ ยกเลิกบิลแล้วออกใหม่แทน");
  return { invoice: data.invoice, items: data.items.map(itemFromRow) };
}

/** Wraps an edit of a draft's items: load, change, save, revalidate. */
async function editDraft(formData: FormData, change: (items: ReturnType<typeof itemFromRow>[]) => ReturnType<typeof itemFromRow>[]): Promise<ActionState> {
  const ctx = await requireOrg();
  const invoiceId = String(formData.get("invoiceId"));
  try {
    const { items } = await loadDraft(ctx, invoiceId);
    await saveDraftItems(ctx, invoiceId, change(items));
  } catch (e) {
    if (e instanceof DraftEditError) return { error: e.message };
    throw e;
  }
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  return { ok: "บันทึกแล้ว" };
}

export async function overrideItemAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const key = String(formData.get("itemKey"));
  const amount = parseBaht(formData.get("amount"));
  if (amount == null) return { error: "ใส่จำนวนเงิน" };
  return editDraft(formData, (items) =>
    items.map((i) => {
      if (i.itemKey !== key) return i;
      const edited = overrideAmount(includeItem(i), amount, String(formData.get("reason") ?? ""));
      return { ...edited, meta: { ...edited.meta, staleOverride: undefined } };
    }),
  );
}

export async function excludeItemAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const key = String(formData.get("itemKey"));
  return editDraft(formData, (items) => items.map((i) => (i.itemKey === key ? excludeItem(i, String(formData.get("reason") ?? "")) : i)));
}

export async function includeItemAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const key = String(formData.get("itemKey"));
  return editDraft(formData, (items) => items.map((i) => (i.itemKey === key ? includeItem(i) : i)));
}

export async function removeManualItemAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const key = String(formData.get("itemKey"));
  return editDraft(formData, (items) => items.filter((i) => !(i.itemKey === key && i.source === "manual")));
}

const MANUAL_TYPES: InvoiceItemType[] = ["fine", "charge", "discount", "adjustment"];

export async function addManualItemAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const type = String(formData.get("type")) as InvoiceItemType;
  const description = String(formData.get("description") ?? "").trim();
  let amount = parseBaht(formData.get("amount"));
  if (!MANUAL_TYPES.includes(type)) return { error: "เลือกประเภทรายการ" };
  if (!description) return { error: "ใส่รายละเอียด" };
  if (amount == null || amount === 0) return { error: "ใส่จำนวนเงิน" };
  if (type === "discount") amount = -Math.abs(amount);
  return editDraft(formData, (items) => [...items, manualItem({ type, description, amount: amount! })]);
}

export async function regenerateInvoice(_: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireOrg();
  const invoiceId = String(formData.get("invoiceId"));
  const data = await getInvoice(ctx, invoiceId);
  if (!data || data.invoice.status !== "draft") return { error: "คำนวณใหม่ได้เฉพาะบิลร่าง" };
  const r = await generateDrafts(ctx, data.invoice.period, todayISO(), data.invoice.leaseId);
  revalidatePath(`/invoices/${invoiceId}`);
  if (r.skipped.length) return { error: r.skipped.map((s) => s.reason).join("\n") };
  return { ok: r.warnings.length ? r.warnings.map((w) => w.message).join("\n") : "คำนวณใหม่แล้ว รายการที่คุณแก้ไว้ยังอยู่" };
}

export async function issueInvoiceAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireOrg();
  const invoiceId = String(formData.get("invoiceId"));
  const r = await issueInvoice(ctx, invoiceId, todayISO());
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  return r.error ? { error: r.error } : { ok: "ออกบิลแล้ว" };
}

export async function voidInvoiceAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireOrg();
  const invoiceId = String(formData.get("invoiceId"));
  const reason = String(formData.get("reason") ?? "").trim();
  if (!reason) return { error: "ใส่เหตุผลที่ยกเลิก" };
  const data = await getInvoice(ctx, invoiceId);
  if (!data || data.invoice.status === "draft" || data.invoice.status === "void") return { error: "ยกเลิกได้เฉพาะบิลที่ออกแล้ว" };
  if (data.invoice.paidAmount > 0) return { error: "บิลนี้มีการชำระเงินแล้ว ยกเลิกไม่ได้" };

  // late fees this invoice charged become chargeable again
  const lateFeeFor = data.items
    .filter((i) => i.type === "late_fee" && !i.excluded)
    .map((i) => (i.meta as { invoiceId?: string } | null)?.invoiceId)
    .filter((x): x is string => !!x);

  await db.transaction(async (tx) => {
    await tx.update(invoices).set({ status: "void", voidedReason: reason, updatedAt: new Date() }).where(eq(invoices.id, invoiceId));
    if (lateFeeFor.length) {
      await tx.update(invoices).set({ lateFeeBilled: false }).where(and(eq(invoices.orgId, ctx.orgId), inArray(invoices.id, lateFeeFor)));
    }
  });
  revalidatePath(`/invoices/${invoiceId}`);
  revalidatePath("/invoices");
  return { ok: "ยกเลิกบิลแล้ว สร้างบิลใหม่ได้จากหน้ารายการบิล" };
}
