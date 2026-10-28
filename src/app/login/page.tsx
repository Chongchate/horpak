"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/client";
import { Field, Input, Notice, Odometer } from "@/components/ui";
import { signIn, signUp, type AuthState } from "./actions";

export default function LoginPage() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [inState, inAction] = useActionState<AuthState, FormData>(signIn, {});
  const [upState, upAction] = useActionState<AuthState, FormData>(signUp, {});
  const state = mode === "in" ? inState : upState;

  return (
    <main className="grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <Odometer value={2569.1} digits={4} className="text-2xl" />
          <h1 className="mt-5 font-display text-3xl font-bold">Horpak</h1>
          <p className="mt-1 text-muted">จดมิเตอร์ ออกบิล ดูแลห้องพัก ในที่เดียว</p>
        </div>

        <form action={mode === "in" ? inAction : upAction} className="flex flex-col gap-4">
          <Field label="อีเมล">
            <Input name="email" type="email" autoComplete="email" required defaultValue={state.email} />
          </Field>
          <Field label="รหัสผ่าน" hint={mode === "up" ? "อย่างน้อย 8 ตัวอักษร" : undefined}>
            <Input
              name="password"
              type="password"
              autoComplete={mode === "in" ? "current-password" : "new-password"}
              required
              minLength={mode === "up" ? 8 : undefined}
            />
          </Field>

          {state.error && <Notice tone="error">{state.error}</Notice>}
          {state.message && <Notice tone="ok">{state.message}</Notice>}

          <SubmitButton size="lg" pendingLabel={mode === "in" ? "กำลังเข้าสู่ระบบ…" : "กำลังสร้างบัญชี…"}>
            {mode === "in" ? "เข้าสู่ระบบ" : "สร้างบัญชี"}
          </SubmitButton>
        </form>

        <p className="mt-6 text-center text-[15px] text-muted">
          {mode === "in" ? "ยังไม่มีบัญชี? " : "มีบัญชีแล้ว? "}
          <button type="button" onClick={() => setMode(mode === "in" ? "up" : "in")} className="font-medium text-pen hover:underline">
            {mode === "in" ? "สร้างบัญชีใหม่" : "เข้าสู่ระบบ"}
          </button>
        </p>
      </div>
    </main>
  );
}
