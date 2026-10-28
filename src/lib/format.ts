import type { Satang } from "@/lib/billing";

/** "1250.5" or "1,250.50" → 125050 satang. Returns null if not a number. */
export function parseBaht(input: FormDataEntryValue | null | undefined): Satang | null {
  if (input == null) return null;
  const s = String(input).replace(/,/g, "").trim();
  if (s === "" || !/^-?\d+(\.\d{0,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}

/** Satang → "1250.50" for prefilling inputs. */
export const bahtInput = (s: Satang | null | undefined) => (s == null ? "" : (s / 100).toFixed(2).replace(/\.00$/, ""));

export function parseNumber(input: FormDataEntryValue | null | undefined): number | null {
  if (input == null) return null;
  const s = String(input).replace(/,/g, "").trim();
  if (s === "" || !Number.isFinite(Number(s))) return null;
  return Number(s);
}

/** "2026-10" (URL) → "2026-10-01" (period). Falls back to the current month. */
export function periodFromParam(param: string | string[] | undefined): string {
  const p = Array.isArray(param) ? param[0] : param;
  return p && /^\d{4}-\d{2}$/.test(p) ? `${p}-01` : currentPeriod();
}

export function currentPeriod(today = new Date()): string {
  const bkk = new Date(today.toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
  return `${bkk.getFullYear()}-${String(bkk.getMonth() + 1).padStart(2, "0")}-01`;
}

export function todayISO(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
}

export const periodParam = (period: string) => period.slice(0, 7);

export function shiftPeriod(period: string, months: number): string {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + months, 1));
  return d.toISOString().slice(0, 10);
}

/** "2026-10-01" → "ตุลาคม 2569" */
export function monthLabel(period: string, style: "long" | "short" = "long"): string {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("th-TH", { month: style, year: "numeric", timeZone: "UTC" });
}

/** "2026-10-18" → "18 ต.ค. 69" */
export function dateLabel(d: string | null | undefined): string {
  if (!d) return "–";
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
}

export function unitsLabel(n: number): string {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
