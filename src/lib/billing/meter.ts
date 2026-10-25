/**
 * Meter usage. Readings are worked in hundredths of a unit ("centi-units")
 * so 1350.5 - 1234.0 never picks up floating-point noise.
 */

/** Usage of one physical meter within a billing period. A meter swap mid-period gives two segments. */
export type MeterSegment = {
  meterId: string;
  prev: number;
  curr: number;
  multiplier?: number;
  /** Value where the dial wraps back to 0, e.g. 10000 for a 4-digit meter. */
  rolloverAt?: number | null;
};

export type SegmentUsage = MeterSegment & { units: number; rolledOver: boolean };

export class MeterReadingError extends Error {}

export const toCenti = (v: number) => Math.round(v * 100);

export function segmentUsage(seg: MeterSegment): SegmentUsage {
  const prev = toCenti(seg.prev);
  const curr = toCenti(seg.curr);
  let diff: number;
  let rolledOver = false;

  if (curr >= prev) {
    diff = curr - prev;
  } else if (seg.rolloverAt != null) {
    diff = toCenti(seg.rolloverAt) - prev + curr;
    rolledOver = true;
  } else {
    throw new MeterReadingError(
      `เลขมิเตอร์ปัจจุบัน (${seg.curr}) น้อยกว่าเลขก่อนหน้า (${seg.prev}) — ตรวจการจดเลข หรือกำหนดจุดวนรอบของมิเตอร์`,
    );
  }

  const centiUnits = Math.round(diff * (seg.multiplier ?? 1));
  return { ...seg, units: centiUnits / 100, rolledOver };
}

export function totalUsage(segments: MeterSegment[]): { units: number; segments: SegmentUsage[] } {
  const usages = segments.map(segmentUsage);
  const centi = usages.reduce((sum, u) => sum + toCenti(u.units), 0);
  return { units: centi / 100, segments: usages };
}
