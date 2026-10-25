import { daysBetween, type ISODate } from "./dates";
import type { Satang } from "./money";

export type LateFeeSettings = {
  mode: "off" | "per_day" | "fixed";
  amount: Satang;
  max?: Satang | null;
  graceDays: number;
};

/** A previous invoice that may have been paid late. */
export type PastInvoice = {
  id: string;
  invoiceNo: string;
  dueDate: ISODate;
  /** Date the invoice became fully paid; null if still unpaid. */
  fullyPaidOn: ISODate | null;
  /** A late fee for this invoice was already put on a later invoice. */
  lateFeeBilled: boolean;
};

export type LateFee = { days: number; amount: Satang };

/**
 * Suggested late fee for one past invoice, measured until it was paid
 * (or until `asOf` if still unpaid). Charged at most once per invoice.
 */
export function lateFeeFor(inv: PastInvoice, settings: LateFeeSettings, asOf: ISODate): LateFee | null {
  if (settings.mode === "off" || inv.lateFeeBilled) return null;

  const days = daysBetween(inv.dueDate, inv.fullyPaidOn ?? asOf) - settings.graceDays;
  if (days <= 0) return null;

  if (settings.mode === "fixed") return { days, amount: settings.amount };

  const amount = days * settings.amount;
  return { days, amount: settings.max != null ? Math.min(amount, settings.max) : amount };
}
