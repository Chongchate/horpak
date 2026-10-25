/**
 * Editing a draft invoice: overrides, waivers, manual lines, and regenerating
 * without losing the owner's edits. Issued invoices are never passed here.
 */
import type { Satang } from "./money";
import type { InvoiceItemDraft, InvoiceItemType } from "./types";

export class DraftEditError extends Error {}

/** An auto line the owner has changed or waived. */
export const isOverridden = (item: InvoiceItemDraft) =>
  item.source === "auto" && (item.excluded || item.amount !== item.calculatedAmount);

/** Change the billed amount of a line. A reason is required when it differs from the calculated amount. */
export function overrideAmount(item: InvoiceItemDraft, amount: Satang, reason?: string): InvoiceItemDraft {
  const resetsToCalculated = item.source === "auto" && amount === item.calculatedAmount;
  if (item.source === "auto" && !resetsToCalculated && !reason?.trim()) {
    throw new DraftEditError("กรุณาระบุเหตุผลที่แก้ยอด");
  }
  return { ...item, amount, overrideReason: resetsToCalculated ? null : (reason?.trim() ?? item.overrideReason) };
}

/** Waive a line (e.g. forgive a late fee). It stays on record but is not billed. */
export function excludeItem(item: InvoiceItemDraft, reason: string): InvoiceItemDraft {
  if (!reason.trim()) throw new DraftEditError("กรุณาระบุเหตุผลที่ยกเว้น");
  return { ...item, excluded: true, overrideReason: reason.trim() };
}

export function includeItem(item: InvoiceItemDraft): InvoiceItemDraft {
  return { ...item, excluded: false, overrideReason: item.amount === item.calculatedAmount ? null : item.overrideReason };
}

/** A line the owner adds by hand: a fine, a one-off fee, a discount (negative amount). */
export function manualItem(input: {
  type: InvoiceItemType;
  description: string;
  amount: Satang;
  quantity?: number | null;
  unitPrice?: Satang | null;
}): InvoiceItemDraft {
  return {
    itemKey: `manual:${crypto.randomUUID()}`,
    source: "manual",
    calculatedAmount: null,
    excluded: false,
    ...input,
  };
}

/**
 * Regenerate a draft (e.g. after a meter reading was corrected) while keeping
 * the owner's edits: manual lines stay, overridden/waived auto lines keep the
 * owner's amount. Auto lines that are no longer generated are dropped.
 *
 * `staleOverrides` lists keys whose calculated amount changed under an override,
 * so the UI can ask the owner to re-check them.
 */
export function mergeWithDraft(
  generated: InvoiceItemDraft[],
  existing: InvoiceItemDraft[],
): { items: InvoiceItemDraft[]; staleOverrides: string[] } {
  const byKey = new Map(existing.map((i) => [i.itemKey, i]));
  const staleOverrides: string[] = [];

  const items = generated.map((g) => {
    const e = byKey.get(g.itemKey);
    if (!e || !isOverridden(e)) return g;
    if (e.calculatedAmount !== g.calculatedAmount) staleOverrides.push(g.itemKey);
    return { ...g, amount: e.amount, excluded: e.excluded, overrideReason: e.overrideReason };
  });

  items.push(...existing.filter((i) => i.source === "manual"));
  return { items, staleOverrides };
}

const MAY_BE_NEGATIVE: InvoiceItemType[] = ["discount", "adjustment"];

/** Problems that must be fixed before a draft can be issued. */
export function validateItems(items: InvoiceItemDraft[]): string[] {
  const errors: string[] = [];
  for (const i of items) {
    if (!Number.isInteger(i.amount)) errors.push(`${i.description}: ยอดเงินต้องเป็นจำนวนเต็มสตางค์`);
    if (i.amount < 0 && !MAY_BE_NEGATIVE.includes(i.type)) errors.push(`${i.description}: ยอดเงินติดลบไม่ได้`);
    if (isOverridden(i) && !i.overrideReason?.trim()) errors.push(`${i.description}: ต้องระบุเหตุผลที่แก้ยอด`);
    if (!i.description.trim()) errors.push("มีรายการที่ไม่มีคำอธิบาย");
  }
  if (invoiceTotal(items) < 0) errors.push("ยอดรวมบิลติดลบไม่ได้");
  return errors;
}

export function invoiceTotal(items: InvoiceItemDraft[]): Satang {
  return items.reduce((sum, i) => (i.excluded ? sum : sum + i.amount), 0);
}

export function paymentStatus(total: Satang, paid: Satang): "issued" | "partially_paid" | "paid" {
  if (paid <= 0) return "issued";
  return paid >= total ? "paid" : "partially_paid";
}
