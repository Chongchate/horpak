"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/client";
import { Field, Input, MoneyInput, Notice } from "@/components/ui";
import { createDorm, type OnboardingState } from "./actions";

export function OnboardingForm() {
  const [state, action] = useActionState<OnboardingState, FormData>(createDorm, {});

  return (
    <form action={action} className="mt-8 flex flex-col gap-6">
      <Field label="ชื่อหอพัก">
        <Input name="name" required placeholder="เช่น บ้านสวนแมนชั่น" autoFocus />
      </Field>

      <fieldset className="grid grid-cols-2 gap-4">
        <legend className="mb-3 font-display text-lg font-semibold">ค่าน้ำค่าไฟ</legend>
        <Field label="ค่าไฟ ต่อหน่วย">
          <MoneyInput name="electric" required defaultValue="8" />
        </Field>
        <Field label="ค่าน้ำ ต่อหน่วย">
          <MoneyInput name="water" required defaultValue="18" />
        </Field>
        <Field label="ค่าไฟขั้นต่ำ" hint="เว้นว่างถ้าไม่มี">
          <MoneyInput name="electricMin" placeholder="0" />
        </Field>
        <Field label="ค่าน้ำขั้นต่ำ" hint="เว้นว่างถ้าไม่มี">
          <MoneyInput name="waterMin" placeholder="0" />
        </Field>
      </fieldset>

      <Field label="ค่าส่วนกลาง ต่อเดือน" hint="เว้นว่างถ้าไม่เก็บ เปิดหรือปิดรายห้องได้ภายหลัง">
        <MoneyInput name="commonFee" placeholder="0" />
      </Field>

      {state.error && <Notice tone="error">{state.error}</Notice>}
      <SubmitButton size="lg" pendingLabel="กำลังสร้าง…">
        สร้างหอพัก
      </SubmitButton>
    </form>
  );
}
