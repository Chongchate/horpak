import { dayOfMonth, daysBetween, maxDate, minDate, monthRange, type ISODate } from "./dates";

export type ProrationMode = "none" | "half_month" | "daily";

export type ProrationSettings = { mode: ProrationMode; halfMonthCutoffDay: number };

export type Occupancy = {
  /** Share of a full month to bill: 1, 0.5, or days/daysInMonth. */
  factor: number;
  days: number;
  daysInMonth: number;
  /** Short Thai label for the invoice line, e.g. "ครึ่งเดือน". null when billing a full month. */
  label: string | null;
  reason: string | null;
};

/**
 * How much of the billing month a lease covers.
 * `endDate` is the last day the resident stays (inclusive); null = still staying.
 * Returns null if the lease does not overlap the month at all.
 */
export function occupancy(
  period: ISODate,
  lease: { startDate: ISODate; endDate: ISODate | null },
  settings: ProrationSettings,
): Occupancy | null {
  const { first, last, daysInMonth } = monthRange(period);
  const start = maxDate(lease.startDate, first);
  const end = minDate(lease.endDate ?? last, last);
  if (start > end) return null;

  const days = daysBetween(start, end) + 1;
  const movedIn = lease.startDate > first;
  const movedOut = lease.endDate != null && lease.endDate < last;
  const full: Occupancy = { factor: 1, days, daysInMonth, label: null, reason: null };

  if (!movedIn && !movedOut) return full;

  switch (settings.mode) {
    case "none":
      return full;

    case "daily":
      return { factor: days / daysInMonth, days, daysInMonth, label: `${days} วัน`, reason: `คิดตามวันที่พักจริง ${days}/${daysInMonth} วัน` };

    case "half_month": {
      const cutoff = settings.halfMonthCutoffDay;
      const reasons: string[] = [];
      if (movedIn && dayOfMonth(lease.startDate) > cutoff) {
        reasons.push(`เข้าพักวันที่ ${dayOfMonth(lease.startDate)} (หลังวันที่ ${cutoff})`);
      }
      if (movedOut && dayOfMonth(lease.endDate!) <= cutoff) {
        reasons.push(`ย้ายออกวันที่ ${dayOfMonth(lease.endDate!)} (ไม่เกินวันที่ ${cutoff})`);
      }
      if (reasons.length === 0) return full;
      return { factor: 0.5, days, daysInMonth, label: "ครึ่งเดือน", reason: `${reasons.join(", ")} คิดครึ่งเดือน` };
    }
  }
}
