import { describe, expect, it } from "vitest";
import { invoiceTotal } from "./draft";
import { generateInvoiceItems, type BillingInput } from "./generate";
import { baht } from "./money";

const COMMON_FEE = "ct-common";
const INTERNET = "ct-internet";

/** Room 203, moving in 18 Oct, property bills half a month after the 15th. */
const base = (over: Partial<BillingInput> = {}): BillingInput => ({
  period: "2026-10-01",
  asOf: "2026-10-25",
  proration: { mode: "half_month", halfMonthCutoffDay: 15 },
  lateFee: { mode: "off", amount: 0, graceDays: 0 },
  lease: { rent: baht(3500), startDate: "2026-10-18", endDate: null },
  utilities: [
    { utility: "electric", segments: [{ meterId: "e1", prev: 1000, curr: 1045 }], rate: { method: "per_unit", unitPrice: baht(8) } },
    { utility: "water", segments: [{ meterId: "w1", prev: 200, curr: 203 }], rate: { method: "per_unit", unitPrice: baht(18), minCharge: baht(100) } },
  ],
  chargeTypes: [
    { id: COMMON_FEE, name: "ค่าส่วนกลาง", defaultAmount: baht(300), applyByDefault: true, prorate: false, active: true },
    { id: INTERNET, name: "อินเทอร์เน็ต", defaultAmount: baht(200), applyByDefault: false, prorate: false, active: true },
  ],
  roomCharges: [],
  leaseCharges: [],
  pastInvoices: [],
  ...over,
});

const byKey = (input: BillingInput) => Object.fromEntries(generateInvoiceItems(input).items.map((i) => [i.itemKey, i]));

describe("generateInvoiceItems", () => {
  it("builds the mid-month move-in bill", () => {
    const { items, warnings } = generateInvoiceItems(base());
    expect(items.map((i) => [i.itemKey, i.amount])).toEqual([
      ["rent", baht(1750)],
      ["utility:electric", baht(360)],
      ["utility:water", baht(100)],
      [`charge:${COMMON_FEE}`, baht(300)],
    ]);
    expect(items[0].description).toBe("ค่าเช่าห้อง (ครึ่งเดือน)");
    expect(items[2].description).toContain("คิดขั้นต่ำ");
    expect(invoiceTotal(items)).toBe(baht(2510));
    expect(warnings).toEqual([]);
  });

  it("every auto line starts with amount = calculatedAmount", () => {
    for (const i of generateInvoiceItems(base()).items) {
      expect(i.source).toBe("auto");
      expect(i.amount).toBe(i.calculatedAmount);
    }
  });

  it("bills full rent for a continuing lease", () => {
    expect(byKey(base({ lease: { rent: baht(3500), startDate: "2026-01-01", endDate: null } })).rent.amount).toBe(baht(3500));
  });

  it("rounds prorated rent to whole baht", () => {
    const items = byKey(base({ lease: { rent: baht(3555), startDate: "2026-10-18", endDate: null } }));
    expect(items.rent.amount).toBe(baht(1778));
  });

  describe("ค่าส่วนกลาง per room", () => {
    it("can be turned off for a room", () => {
      const items = byKey(base({ roomCharges: [{ chargeTypeId: COMMON_FEE, enabled: false, amount: null }] }));
      expect(items[`charge:${COMMON_FEE}`]).toBeUndefined();
    });

    it("can have a different amount for a room", () => {
      const items = byKey(base({ roomCharges: [{ chargeTypeId: COMMON_FEE, enabled: true, amount: baht(150) }] }));
      expect(items[`charge:${COMMON_FEE}`].amount).toBe(baht(150));
    });

    it("an off-by-default charge can be turned on for a room", () => {
      const items = byKey(base({ roomCharges: [{ chargeTypeId: INTERNET, enabled: true, amount: null }] }));
      expect(items[`charge:${INTERNET}`].amount).toBe(baht(200));
    });

    it("follows rent proration when the charge type says so", () => {
      const input = base();
      input.chargeTypes[0].prorate = true;
      const item = byKey(input)[`charge:${COMMON_FEE}`];
      expect(item.amount).toBe(baht(150));
      expect(item.description).toBe("ค่าส่วนกลาง (ครึ่งเดือน)");
    });

    it("skips inactive charge types", () => {
      const input = base();
      input.chargeTypes[0].active = false;
      expect(byKey(input)[`charge:${COMMON_FEE}`]).toBeUndefined();
    });
  });

  it("includes lease charges active in the month only", () => {
    const items = byKey(
      base({
        leaseCharges: [
          { id: "p1", name: "ที่จอดรถ", amount: baht(500), startDate: "2026-10-18", endDate: null },
          { id: "p2", name: "ที่จอดรถเก่า", amount: baht(500), startDate: "2026-01-01", endDate: "2026-09-30" },
        ],
      }),
    );
    expect(items["lease_charge:p1"].amount).toBe(baht(500));
    expect(items["lease_charge:p2"]).toBeUndefined();
  });

  it("describes a meter swap as one line with combined units", () => {
    const input = base();
    input.utilities[0].segments = [
      { meterId: "old", prev: 1000, curr: 1020 },
      { meterId: "new", prev: 0, curr: 25 },
    ];
    const item = byKey(input)["utility:electric"];
    expect(item.quantity).toBe(45);
    expect(item.description).toContain("เปลี่ยนมิเตอร์");
  });

  it("warns instead of failing when a meter reading is missing", () => {
    const input = base();
    input.utilities[1].segments = [];
    const { items, warnings } = generateInvoiceItems(input);
    expect(items.find((i) => i.itemKey === "utility:water")).toBeUndefined();
    expect(warnings).toEqual(["ค่าน้ำ: ยังไม่มีเลขมิเตอร์ของรอบนี้"]);
  });

  it("warns when a meter rolled over", () => {
    const input = base();
    input.utilities[0].segments = [{ meterId: "e1", prev: 9990, curr: 20, rolloverAt: 10000 }];
    expect(generateInvoiceItems(input).warnings[0]).toContain("มิเตอร์วนรอบ");
  });

  describe("late fee", () => {
    const pastInvoices = [
      { id: "sep", invoiceNo: "INV-2609-0007", dueDate: "2026-10-05", fullyPaidOn: "2026-10-08", lateFeeBilled: false },
    ];

    it("is not suggested when the property has late fees off", () => {
      expect(byKey(base({ pastInvoices }))["late_fee:sep"]).toBeUndefined();
    });

    it("is suggested when enabled", () => {
      const item = byKey(base({ pastInvoices, lateFee: { mode: "per_day", amount: baht(50), graceDays: 0 } }))["late_fee:sep"];
      expect(item.amount).toBe(baht(150));
      expect(item.description).toBe("ค่าปรับชำระล่าช้า บิล INV-2609-0007 (3 วัน)");
    });
  });

  it("throws when the lease does not cover the period", () => {
    expect(() => generateInvoiceItems(base({ lease: { rent: 1, startDate: "2026-11-01", endDate: null } }))).toThrow();
  });
});
