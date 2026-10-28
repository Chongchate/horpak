"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; message?: string; email?: string };

function credentials(formData: FormData) {
  return { email: String(formData.get("email") ?? "").trim(), password: String(formData.get("password") ?? "") };
}

export async function signIn(_: AuthState, formData: FormData): Promise<AuthState> {
  const { email, password } = credentials(formData);
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return {
      email,
      error: error.code === "email_not_confirmed" ? "ยังไม่ได้ยืนยันอีเมล — เปิดลิงก์ในอีเมลก่อน" : "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
    };
  }
  redirect("/rooms");
}

export async function signUp(_: AuthState, formData: FormData): Promise<AuthState> {
  const { email, password } = credentials(formData);
  if (password.length < 8) return { email, error: "รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร" };

  const origin = (await headers()).get("origin") ?? "";
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });
  if (error) return { email, error: error.message };

  // Email confirmation off → already signed in.
  if (data.session) redirect("/onboarding");
  return { email, message: `ส่งลิงก์ยืนยันไปที่ ${email} แล้ว เปิดลิงก์ในอีเมลเพื่อเริ่มใช้งาน` };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
