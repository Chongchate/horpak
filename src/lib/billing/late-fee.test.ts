import { describe, expect, it } from "vitest";
import { lateFeeFor, type LateFeeSettings, type PastInvoice } from "./late-fee";
import { baht } from "./money";

const inv = (over: Partial<PastInvoice> = {}): PastInvoice => ({
  id: "i1",
  invoiceNo: "INV-2609-0001",
  dueDate: "2026-10-05",
  fullyPaidOn: "2026-10-09",
  lateFeeBilled: false,
  ...over,
});

const perDay: LateFeeSettings = { mode: "per_day", amount: baht(50), max: baht(500), graceDays: 0 };
const asOf = "2026-10-25";

describe("lateFeeFor", () => {
  it("is null when late fees are off", () => {
    expect(lateFeeFor(inv(), { ...perDay, mode: "off" }, asOf)).toBeNull();
  });

  it("is null when paid on time", () => {
    expect(lateFeeFor(inv({ fullyPaidOn: "2026-10-05" }), perDay, asOf)).toBeNull();
  });

  it("charges per day late", () => {
    expect(lateFeeFor(inv(), perDay, asOf)).toEqual({ days: 4, amount: baht(200) });
  });

  it("respects grace days", () => {
    expect(lateFeeFor(inv(), { ...perDay, graceDays: 3 }, asOf)).toEqual({ days: 1, amount: baht(50) });
    expect(lateFeeFor(inv(), { ...perDay, graceDays: 4 }, asOf)).toBeNull();
  });

  it("caps at the maximum", () => {
    expect(lateFeeFor(inv({ fullyPaidOn: "2026-10-25" }), perDay, asOf)).toEqual({ days: 20, amount: baht(500) });
  });

  it("measures unpaid invoices up to asOf", () => {
    expect(lateFeeFor(inv({ fullyPaidOn: null }), { ...perDay, max: null }, asOf)).toEqual({ days: 20, amount: baht(1000) });
  });

  it("fixed fee", () => {
    expect(lateFeeFor(inv(), { mode: "fixed", amount: baht(100), graceDays: 0 }, asOf)).toEqual({ days: 4, amount: baht(100) });
  });

  it("is charged only once per invoice", () => {
    expect(lateFeeFor(inv({ lateFeeBilled: true }), perDay, asOf)).toBeNull();
  });
});
