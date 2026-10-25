import { describe, expect, it } from "vitest";
import { baht } from "./money";
import { utilityCharge } from "./rates";

describe("utilityCharge", () => {
  it("per unit", () => {
    expect(utilityCharge(116.5, { method: "per_unit", unitPrice: baht(8) })).toEqual({
      amount: baht(932),
      minChargeApplied: false,
    });
  });

  it("uses usage when it is above the minimum", () => {
    expect(utilityCharge(12, { method: "per_unit", unitPrice: baht(18), minCharge: baht(100) }).amount).toBe(baht(216));
  });

  it("charges the minimum when usage is low", () => {
    expect(utilityCharge(3, { method: "per_unit", unitPrice: baht(18), minCharge: baht(100) })).toEqual({
      amount: baht(100),
      minChargeApplied: true,
    });
  });

  it("rounds fractional satang", () => {
    // 0.33 units × 7.77 = 2.5641 baht
    expect(utilityCharge(0.33, { method: "per_unit", unitPrice: baht(7.77) }).amount).toBe(256);
  });

  it("tiered bands", () => {
    const plan = {
      method: "tiered" as const,
      tiers: [
        { fromUnit: 0, toUnit: 150, unitPrice: baht(3) },
        { fromUnit: 150, toUnit: 400, unitPrice: baht(4) },
        { fromUnit: 400, toUnit: null, unitPrice: baht(5) },
      ],
    };
    expect(utilityCharge(100, plan).amount).toBe(baht(300));
    expect(utilityCharge(200, plan).amount).toBe(baht(450 + 200));
    expect(utilityCharge(500, plan).amount).toBe(baht(450 + 1000 + 500));
  });

  it("flat", () => {
    expect(utilityCharge(999, { method: "flat", flatAmount: baht(150) }).amount).toBe(baht(150));
  });
});
