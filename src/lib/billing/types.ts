import type { Satang } from "./money";

export type InvoiceItemType =
  | "rent"
  | "electric"
  | "water"
  | "charge"
  | "late_fee"
  | "fine"
  | "discount"
  | "adjustment";

/** Mirrors the `invoice_items` table, minus ids. */
export type InvoiceItemDraft = {
  /** Stable identity across regenerations: "rent", "utility:electric", "charge:<id>", "manual:<uuid>"... */
  itemKey: string;
  type: InvoiceItemType;
  source: "auto" | "manual";
  description: string;
  quantity?: number | null;
  unitPrice?: Satang | null;
  /** What the system computed. null for manual items. */
  calculatedAmount: Satang | null;
  /** What is actually billed. */
  amount: Satang;
  overrideReason?: string | null;
  /** Waived — stays on record but not billed. */
  excluded: boolean;
  chargeTypeId?: string | null;
  meta?: Record<string, unknown>;
};
