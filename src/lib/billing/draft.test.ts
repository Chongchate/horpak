import { describe, expect, it } from "vitest";
import {
  DraftEditError,
  excludeItem,
  includeItem,
  invoiceTotal,
  manualItem,
  mergeWithDraft,
  overrideAmount,
  paymentStatus,
  validateItems,
} from "./draft";
import { baht } from "./money";
import type { InvoiceItemDraft } from "./types";

const autoItem = (itemKey: string, amount: number, type: InvoiceItemDraft["type"] = "charge"): InvoiceItemDraft => ({
  itemKey,
  type,
  source: "auto",
  description: itemKey,
  calculatedAmount: amount,
  amount,
  excluded: false,
});

const rent = autoItem("rent", baht(1750), "rent");
const lateFee = autoItem("late_fee:sep", baht(150), "late_fee");

describe("overrideAmount", () => {
  it("requires a reason to change an auto line", () => {
    expect(() => overrideAmount(rent, baht(1500))).toThrow(DraftEditError);
    expect(() => overrideAmount(rent, baht(1500), "  ")).toThrow(DraftEditError);
  });

  it("records the new amount and reason", () => {
    const edited = overrideAmount(rent, baht(1500), "ลดพิเศษ");
    expect(edited).toMatchObject({ amount: baht(1500), calculatedAmount: baht(1750), overrideReason: "ลดพิเศษ" });
  });

  it("setting it back to the calculated amount clears the reason", () => {
    const edited = overrideAmount(overrideAmount(rent, baht(1500), "ลดพิเศษ"), baht(1750));
    expect(edited.overrideReason).toBeNull();
  });

  it("manual lines need no reason", () => {
    const fine = manualItem({ type: "fine", description: "ค่ากุญแจหาย", amount: baht(200) });
    expect(overrideAmount(fine, baht(250)).amount).toBe(baht(250));
  });
});

describe("excludeItem", () => {
  it("waives a line without deleting it", () => {
    const waived = excludeItem(lateFee, "ลูกค้าเก่า ยกเว้นให้");
    expect(waived.excluded).toBe(true);
    expect(invoiceTotal([rent, waived])).toBe(baht(1750));
    expect(invoiceTotal([rent, includeItem(waived)])).toBe(baht(1900));
  });

  it("requires a reason", () => {
    expect(() => excludeItem(lateFee, "")).toThrow(DraftEditError);
  });
});

describe("mergeWithDraft", () => {
  it("keeps the owner's overrides, waivers and manual lines when regenerating", () => {
    const fine = manualItem({ type: "fine", description: "ค่ากุญแจหาย", amount: baht(200) });
    const existing = [overrideAmount(rent, baht(1500), "ลดพิเศษ"), excludeItem(lateFee, "ยกเว้น"), autoItem("utility:electric", baht(360)), fine];

    // electric reading corrected → new amount
    const generated = [rent, lateFee, autoItem("utility:electric", baht(400))];
    const { items, staleOverrides } = mergeWithDraft(generated, existing);

    expect(items.map((i) => [i.itemKey, i.amount, i.excluded])).toEqual([
      ["rent", baht(1500), false],
      ["late_fee:sep", baht(150), true],
      ["utility:electric", baht(400), false],
      [fine.itemKey, baht(200), false],
    ]);
    expect(staleOverrides).toEqual([]);
  });

  it("flags overrides whose calculation changed underneath them", () => {
    const existing = [overrideAmount(rent, baht(1500), "ลดพิเศษ")];
    const generated = [autoItem("rent", baht(3500), "rent")]; // move-in date corrected
    const { items, staleOverrides } = mergeWithDraft(generated, existing);
    expect(items[0]).toMatchObject({ amount: baht(1500), calculatedAmount: baht(3500) });
    expect(staleOverrides).toEqual(["rent"]);
  });

  it("drops auto lines that are no longer generated", () => {
    const { items } = mergeWithDraft([rent], [rent, autoItem("charge:old", baht(300))]);
    expect(items.map((i) => i.itemKey)).toEqual(["rent"]);
  });
});

describe("validateItems", () => {
  it("accepts a normal draft with a discount", () => {
    expect(validateItems([rent, manualItem({ type: "discount", description: "ส่วนลด", amount: -baht(100) })])).toEqual([]);
  });

  it("rejects negative amounts outside discount/adjustment", () => {
    expect(validateItems([rent, manualItem({ type: "fine", description: "ค่าปรับ", amount: -1 })])).toEqual([
      "ค่าปรับ: ยอดเงินติดลบไม่ได้",
    ]);
  });

  it("rejects an override without a reason", () => {
    expect(validateItems([{ ...rent, amount: baht(1000) }])).toEqual(["rent: ต้องระบุเหตุผลที่แก้ยอด"]);
  });

  it("rejects a negative total", () => {
    expect(validateItems([rent, manualItem({ type: "discount", description: "ส่วนลด", amount: -baht(2000) })])).toContain(
      "ยอดรวมบิลติดลบไม่ได้",
    );
  });
});

describe("paymentStatus", () => {
  it("derives status from paid amount", () => {
    expect(paymentStatus(baht(100), 0)).toBe("issued");
    expect(paymentStatus(baht(100), baht(40))).toBe("partially_paid");
    expect(paymentStatus(baht(100), baht(100))).toBe("paid");
  });
});
