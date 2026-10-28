import { monthRange, type ISODate } from "./dates";
import { lateFeeFor, type LateFeeSettings, type PastInvoice } from "./late-fee";
import { totalUsage, type MeterSegment } from "./meter";
import { formatBaht, roundToBaht, type Satang } from "./money";
import { occupancy, type Occupancy, type ProrationSettings } from "./occupancy";
import { utilityCharge, type RatePlan } from "./rates";
import type { InvoiceItemDraft } from "./types";

export type ChargeType = {
  id: string;
  name: string;
  defaultAmount: Satang;
  applyByDefault: boolean;
  prorate: boolean;
  active: boolean;
};

export type RoomChargeOverride = { chargeTypeId: string; enabled: boolean; amount: Satang | null };

export type LeaseCharge = { id: string; name: string; amount: Satang; startDate: ISODate; endDate: ISODate | null };

export type UtilityInput = {
  utility: "electric" | "water";
  /** One segment per meter used in the period (two when a meter was swapped). */
  segments: MeterSegment[];
  rate: RatePlan;
};

export type BillingInput = {
  /** First day of the billing month. */
  period: ISODate;
  /** Date the draft is generated; used to measure late fees on still-unpaid invoices. */
  asOf: ISODate;
  proration: ProrationSettings;
  lateFee: LateFeeSettings;
  /** `endDate` = last day staying (moved_out_at or end of fixed term), null if still staying. */
  lease: { rent: Satang; startDate: ISODate; endDate: ISODate | null };
  utilities: UtilityInput[];
  chargeTypes: ChargeType[];
  roomCharges: RoomChargeOverride[];
  leaseCharges: LeaseCharge[];
  /** Earlier invoices of this lease that are unpaid or were paid after the due date. */
  pastInvoices: PastInvoice[];
};

export type BillingResult = { items: InvoiceItemDraft[]; occupancy: Occupancy; warnings: string[] };

const UTILITY_LABEL = { electric: "ค่าไฟฟ้า", water: "ค่าน้ำ" } as const;

const fmtUnits = (n: number) => n.toLocaleString("th-TH", { maximumFractionDigits: 2 });

/** Satang → "9" or "8.50" (no ".00" noise). */
const fmtPrice = (s: Satang) => formatBaht(s).replace(/\.00$/, "");

function auto(item: Omit<InvoiceItemDraft, "source" | "excluded" | "amount">): InvoiceItemDraft {
  return { ...item, source: "auto", excluded: false, amount: item.calculatedAmount ?? 0 };
}

/** Builds the auto-generated lines of a draft invoice for one lease and month. */
export function generateInvoiceItems(input: BillingInput): BillingResult {
  const occ = occupancy(input.period, input.lease, input.proration);
  if (!occ) throw new Error(`สัญญาไม่ครอบคลุมรอบบิล ${input.period}`);

  const items: InvoiceItemDraft[] = [];
  const warnings: string[] = [];
  const prorated = (amount: Satang) => (occ.factor === 1 ? amount : roundToBaht(amount * occ.factor));
  const suffix = occ.label ? ` (${occ.label})` : "";

  // 1. rent
  items.push(
    auto({
      itemKey: "rent",
      type: "rent",
      description: `ค่าเช่าห้อง${suffix}`,
      calculatedAmount: prorated(input.lease.rent),
      meta: { fullRent: input.lease.rent, factor: occ.factor, reason: occ.reason },
    }),
  );

  // 2. utilities
  for (const u of input.utilities) {
    const label = UTILITY_LABEL[u.utility];
    if (u.rate.method !== "flat" && u.segments.length === 0) {
      warnings.push(`${label}: ยังไม่มีเลขมิเตอร์ของรอบนี้`);
      continue;
    }

    const usage = totalUsage(u.segments);
    const charge = utilityCharge(usage.units, u.rate);
    if (usage.segments.some((s) => s.rolledOver)) {
      warnings.push(`${label}: มิเตอร์วนรอบ (${fmtUnits(usage.units)} หน่วย) — ตรวจว่าไม่ได้จดเลขผิด`);
    }

    // Main line: what is charged. Detail line (meta.reason): the meter readings behind it.
    let description: string;
    if (u.rate.method === "flat") description = `${label} เหมาจ่าย`;
    else if (u.rate.method === "per_unit") description = `${label} ${fmtUnits(usage.units)} หน่วย × ${fmtPrice(u.rate.unitPrice)}`;
    else description = `${label} ${fmtUnits(usage.units)} หน่วย อัตราขั้นบันได`;

    const readings = usage.segments.map((s) => `${fmtUnits(s.prev)} → ${fmtUnits(s.curr)}`).join(", ");
    const details = [
      usage.segments.length > 1 ? `เปลี่ยนมิเตอร์ ${readings}` : readings && `มิเตอร์ ${readings}`,
      charge.minChargeApplied && `ใช้น้อยกว่าขั้นต่ำ คิดขั้นต่ำ ${fmtPrice(charge.amount)} บาท`,
    ].filter(Boolean);

    items.push(
      auto({
        itemKey: `utility:${u.utility}`,
        type: u.utility,
        description,
        quantity: usage.units,
        unitPrice: u.rate.method === "per_unit" ? u.rate.unitPrice : null,
        calculatedAmount: charge.amount,
        meta: { segments: usage.segments, rate: u.rate, minChargeApplied: charge.minChargeApplied, reason: details.join(" ") || null },
      }),
    );
  }

  // 3. property charges with per-room overrides (ค่าส่วนกลาง etc.)
  const overrides = new Map(input.roomCharges.map((rc) => [rc.chargeTypeId, rc]));
  for (const ct of input.chargeTypes) {
    if (!ct.active) continue;
    const rc = overrides.get(ct.id);
    if (!(rc ? rc.enabled : ct.applyByDefault)) continue;

    const full = rc?.amount ?? ct.defaultAmount;
    const amount = ct.prorate ? prorated(full) : full;
    items.push(
      auto({
        itemKey: `charge:${ct.id}`,
        type: "charge",
        description: ct.name + (ct.prorate ? suffix : ""),
        calculatedAmount: amount,
        chargeTypeId: ct.id,
        meta: { fullAmount: full, roomOverride: rc != null },
      }),
    );
  }

  // 4. lease-specific charges
  const month = monthRange(input.period);
  for (const lc of input.leaseCharges) {
    if (lc.startDate > month.last || (lc.endDate != null && lc.endDate < month.first)) continue;
    items.push(auto({ itemKey: `lease_charge:${lc.id}`, type: "charge", description: lc.name, calculatedAmount: lc.amount }));
  }

  // 5. suggested late fees for earlier invoices
  for (const inv of input.pastInvoices) {
    const fee = lateFeeFor(inv, input.lateFee, input.asOf);
    if (!fee) continue;
    items.push(
      auto({
        itemKey: `late_fee:${inv.id}`,
        type: "late_fee",
        description: `ค่าปรับชำระล่าช้า บิล ${inv.invoiceNo} (${fee.days} วัน)`,
        quantity: input.lateFee.mode === "per_day" ? fee.days : null,
        calculatedAmount: fee.amount,
        meta: { invoiceId: inv.id, days: fee.days, stillUnpaid: inv.fullyPaidOn == null },
      }),
    );
  }

  return { items, occupancy: occ, warnings };
}
