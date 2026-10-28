import { describe, expect, it } from "vitest";
import { dueDateFor, invoicePrefix } from "./issue";

describe("dueDateFor", () => {
  it("uses next month when the due day has passed", () => {
    expect(dueDateFor("2026-10-25", 5)).toBe("2026-11-05");
  });

  it("uses this month when the due day is still ahead", () => {
    expect(dueDateFor("2026-10-01", 5)).toBe("2026-10-05");
  });

  it("rolls over the year", () => {
    expect(dueDateFor("2026-12-26", 5)).toBe("2027-01-05");
  });
});

describe("invoicePrefix", () => {
  it("uses the Buddhist-era year and month", () => {
    expect(invoicePrefix("2026-10-01")).toBe("6910");
    expect(invoicePrefix("2027-01-01")).toBe("7001");
  });
});
