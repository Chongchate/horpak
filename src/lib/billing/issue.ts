import type { ISODate } from "./dates";

/** Due date: the property's due day in the issue month if it is still ahead, otherwise next month. */
export function dueDateFor(issueDate: ISODate, dueDay: number): ISODate {
  const [y, m, d] = issueDate.split("-").map(Number);
  const monthOffset = d < dueDay ? 0 : 1;
  return new Date(Date.UTC(y, m - 1 + monthOffset, dueDay)).toISOString().slice(0, 10);
}

/** Invoice number prefix from the billing period: "2026-10-01" → "6910" (Buddhist-era year + month). */
export const invoicePrefix = (period: ISODate) => `${(Number(period.slice(0, 4)) + 543) % 100}${period.slice(5, 7)}`;
