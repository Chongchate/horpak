/** Calendar dates as "YYYY-MM-DD" strings. All math is done in UTC so time zones never shift a day. */
export type ISODate = string;

const DAY_MS = 86_400_000;

function toUtc(d: ISODate): number {
  const [y, m, day] = d.split("-").map(Number);
  return Date.UTC(y, m - 1, day);
}

function fromUtc(ms: number): ISODate {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Whole days from `a` to `b` (b - a). */
export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((toUtc(b) - toUtc(a)) / DAY_MS);
}

export function dayOfMonth(d: ISODate): number {
  return Number(d.slice(8, 10));
}

/** First/last day of the month that `period` falls in. */
export function monthRange(period: ISODate): { first: ISODate; last: ISODate; daysInMonth: number } {
  const [y, m] = period.split("-").map(Number);
  const first = fromUtc(Date.UTC(y, m - 1, 1));
  const last = fromUtc(Date.UTC(y, m, 0));
  return { first, last, daysInMonth: dayOfMonth(last) };
}

export const minDate = (a: ISODate, b: ISODate) => (a < b ? a : b);
export const maxDate = (a: ISODate, b: ISODate) => (a > b ? a : b);
