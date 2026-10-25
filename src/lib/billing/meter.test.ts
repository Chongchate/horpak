import { describe, expect, it } from "vitest";
import { MeterReadingError, segmentUsage, totalUsage } from "./meter";

describe("segmentUsage", () => {
  it("subtracts readings", () => {
    expect(segmentUsage({ meterId: "m", prev: 1234.0, curr: 1350.5 }).units).toBe(116.5);
  });

  it("has no floating-point noise", () => {
    expect(segmentUsage({ meterId: "m", prev: 100.1, curr: 100.3 }).units).toBe(0.2);
  });

  it("handles a meter that wrapped past its last digit", () => {
    const u = segmentUsage({ meterId: "m", prev: 9990, curr: 15, rolloverAt: 10000 });
    expect(u.units).toBe(25);
    expect(u.rolledOver).toBe(true);
  });

  it("rejects a lower reading when the meter has no rollover point", () => {
    expect(() => segmentUsage({ meterId: "m", prev: 500, curr: 499 })).toThrow(MeterReadingError);
  });

  it("applies the CT multiplier", () => {
    expect(segmentUsage({ meterId: "m", prev: 10, curr: 12.5, multiplier: 40 }).units).toBe(100);
  });
});

describe("totalUsage", () => {
  it("sums the old and new meter when swapped mid-period", () => {
    const { units } = totalUsage([
      { meterId: "old", prev: 5000, curr: 5030.5 }, // removed at 5030.5
      { meterId: "new", prev: 0, curr: 12.3 }, // installed at 0
    ]);
    expect(units).toBe(42.8);
  });
});
