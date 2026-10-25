import { toCenti } from "./meter";
import type { Satang } from "./money";

export type RateTier = { fromUnit: number; toUnit: number | null; unitPrice: Satang };

export type RatePlan =
  | { method: "per_unit"; unitPrice: Satang; minCharge?: Satang | null }
  | { method: "tiered"; tiers: RateTier[]; minCharge?: Satang | null }
  | { method: "flat"; flatAmount: Satang };

export type UtilityCharge = { amount: Satang; minChargeApplied: boolean };

/**
 * Price `units` of usage under a rate plan.
 * Tiers are cumulative bands (fromUnit, toUnit]: 0–150 @3, 150–400 @4, 400+ @5.
 */
export function utilityCharge(units: number, plan: RatePlan): UtilityCharge {
  if (plan.method === "flat") return { amount: plan.flatAmount, minChargeApplied: false };

  const centi = toCenti(units);
  let raw: number;

  if (plan.method === "per_unit") {
    raw = (centi * plan.unitPrice) / 100;
  } else {
    raw = 0;
    for (const tier of plan.tiers) {
      const from = toCenti(tier.fromUnit);
      const to = tier.toUnit == null ? Infinity : toCenti(tier.toUnit);
      const span = Math.max(0, Math.min(centi, to) - from);
      raw += (span * tier.unitPrice) / 100;
    }
  }

  const amount = Math.round(raw);
  const min = plan.minCharge ?? 0;
  return amount < min ? { amount: min, minChargeApplied: true } : { amount, minChargeApplied: false };
}
