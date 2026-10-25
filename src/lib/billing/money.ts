/** Money is always an integer number of satang (100 satang = 1 baht). */
export type Satang = number;

export const baht = (amount: number): Satang => Math.round(amount * 100);

export const roundToBaht = (s: Satang): Satang => Math.round(s / 100) * 100;

export function formatBaht(s: Satang): string {
  return (s / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
