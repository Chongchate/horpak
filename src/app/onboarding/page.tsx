import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { members } from "@/db/schema";
import { requireUserId } from "@/server/auth";
import { OnboardingForm } from "./form";

export default async function OnboardingPage() {
  const userId = await requireUserId();
  const [membership] = await db.select().from(members).where(eq(members.userId, userId)).limit(1);
  if (membership) redirect("/rooms");

  return (
    <main className="mx-auto max-w-lg px-4 py-12">
      <h1 className="font-display text-3xl font-bold">ตั้งค่าหอพัก</h1>
      <p className="mt-2 text-muted">ใส่ข้อมูลพื้นฐานก่อน รายละเอียดอื่นแก้ได้ภายหลังในหน้าตั้งค่า</p>
      <OnboardingForm />
    </main>
  );
}
