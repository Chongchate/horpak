"use server";

import { redirect } from "next/navigation";
import { db } from "@/db";
import { chargeTypes, members, organizations, properties, ratePlans } from "@/db/schema";
import { parseBaht } from "@/lib/format";
import { requireUserId } from "@/server/auth";

export type OnboardingState = { error?: string };

/** Rates created at onboarding apply to every past period too. */
const FROM_THE_START = "2000-01-01";

export async function createDorm(_: OnboardingState, formData: FormData): Promise<OnboardingState> {
  const userId = await requireUserId();
  const name = String(formData.get("name") ?? "").trim();
  const electric = parseBaht(formData.get("electric"));
  const electricMin = parseBaht(formData.get("electricMin"));
  const water = parseBaht(formData.get("water"));
  const waterMin = parseBaht(formData.get("waterMin"));
  const commonFee = parseBaht(formData.get("commonFee"));

  if (!name) return { error: "กรุณาใส่ชื่อหอพัก" };
  if (electric == null || water == null) return { error: "กรุณาใส่ค่าไฟและค่าน้ำต่อหน่วย" };

  await db.transaction(async (tx) => {
    const [org] = await tx
      .insert(organizations)
      .values({ name, slug: `${crypto.randomUUID().slice(0, 8)}` })
      .returning({ id: organizations.id });
    await tx.insert(members).values({ orgId: org.id, userId, role: "owner" });
    const [property] = await tx
      .insert(properties)
      .values({ orgId: org.id, name })
      .returning({ id: properties.id });

    await tx.insert(ratePlans).values([
      {
        orgId: org.id,
        propertyId: property.id,
        utility: "electric",
        method: "per_unit",
        unitPrice: electric,
        minCharge: electricMin,
        effectiveFrom: FROM_THE_START,
      },
      {
        orgId: org.id,
        propertyId: property.id,
        utility: "water",
        method: "per_unit",
        unitPrice: water,
        minCharge: waterMin,
        effectiveFrom: FROM_THE_START,
      },
    ]);

    if (commonFee) {
      await tx.insert(chargeTypes).values({ orgId: org.id, propertyId: property.id, name: "ค่าส่วนกลาง", defaultAmount: commonFee });
    }
  });

  redirect("/rooms");
}
