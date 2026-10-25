import { describe, expect, it } from "vitest";
import { occupancy, type ProrationSettings } from "./occupancy";

const half: ProrationSettings = { mode: "half_month", halfMonthCutoffDay: 15 };
const oct = "2026-10-01";

describe("occupancy — half_month", () => {
  it("full month for a continuing lease", () => {
    expect(occupancy(oct, { startDate: "2026-01-01", endDate: null }, half)?.factor).toBe(1);
  });

  it("moving in on the 1st is a full month", () => {
    expect(occupancy(oct, { startDate: "2026-10-01", endDate: null }, half)?.factor).toBe(1);
  });

  it("moving in on the cutoff day is still a full month", () => {
    expect(occupancy(oct, { startDate: "2026-10-15", endDate: null }, half)?.factor).toBe(1);
  });

  it("moving in after the cutoff is half a month", () => {
    const o = occupancy(oct, { startDate: "2026-10-18", endDate: null }, half)!;
    expect(o.factor).toBe(0.5);
    expect(o.label).toBe("ครึ่งเดือน");
    expect(o.reason).toContain("เข้าพักวันที่ 18");
  });

  it("moving out on or before the cutoff is half a month", () => {
    expect(occupancy(oct, { startDate: "2026-01-01", endDate: "2026-10-10" }, half)?.factor).toBe(0.5);
    expect(occupancy(oct, { startDate: "2026-01-01", endDate: "2026-10-15" }, half)?.factor).toBe(0.5);
  });

  it("moving out after the cutoff is a full month", () => {
    expect(occupancy(oct, { startDate: "2026-01-01", endDate: "2026-10-20" }, half)?.factor).toBe(1);
  });

  it("uses the configured cutoff day", () => {
    const s = { mode: "half_month" as const, halfMonthCutoffDay: 20 };
    expect(occupancy(oct, { startDate: "2026-10-18", endDate: null }, s)?.factor).toBe(1);
  });
});

describe("occupancy — other modes", () => {
  it("daily counts days stayed, inclusive", () => {
    const o = occupancy(oct, { startDate: "2026-10-18", endDate: null }, { mode: "daily", halfMonthCutoffDay: 15 })!;
    expect(o.days).toBe(14);
    expect(o.factor).toBeCloseTo(14 / 31);
  });

  it("daily handles February", () => {
    const o = occupancy("2027-02-01", { startDate: "2027-02-15", endDate: null }, { mode: "daily", halfMonthCutoffDay: 15 })!;
    expect(o.days).toBe(14);
    expect(o.daysInMonth).toBe(28);
  });

  it("none always bills the full month", () => {
    expect(occupancy(oct, { startDate: "2026-10-28", endDate: null }, { mode: "none", halfMonthCutoffDay: 15 })?.factor).toBe(1);
  });

  it("returns null when the lease does not cover the month", () => {
    expect(occupancy(oct, { startDate: "2026-11-01", endDate: null }, half)).toBeNull();
    expect(occupancy(oct, { startDate: "2026-01-01", endDate: "2026-09-30" }, half)).toBeNull();
  });
});
