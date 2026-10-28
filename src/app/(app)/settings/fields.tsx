"use client";

import { useState } from "react";
import { Field, Input, MoneyInput, cn } from "@/components/ui";

/** Segmented radio control. */
function Segmented<T extends string>({
  name,
  value,
  onChange,
  options,
}: {
  name: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div role="radiogroup" className="inline-flex rounded-lg border border-line-strong bg-paper p-0.5">
      {options.map((o) => (
        <label
          key={o.value}
          className={cn(
            "cursor-pointer rounded-md px-3.5 py-1.5 text-[15px] transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-pen",
            value === o.value ? "bg-surface font-medium text-ink shadow-[0_1px_2px_rgb(23_35_58/0.12)]" : "text-muted hover:text-ink",
          )}
        >
          <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="sr-only" />
          {o.label}
        </label>
      ))}
    </div>
  );
}

export function RateFields({
  defaults,
}: {
  defaults: { method: "per_unit" | "flat"; unitPrice: string; minCharge: string; flatAmount: string };
}) {
  const [method, setMethod] = useState(defaults.method);
  return (
    <div className="flex flex-col gap-3">
      <Segmented
        name="method"
        value={method}
        onChange={setMethod}
        options={[
          { value: "per_unit", label: "คิดต่อหน่วย" },
          { value: "flat", label: "เหมาจ่าย" },
        ]}
      />
      {method === "per_unit" ? (
        <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
          <Field label="ราคาต่อหน่วย">
            <MoneyInput name="unitPrice" defaultValue={defaults.unitPrice} required />
          </Field>
          <Field label="ขั้นต่ำต่อเดือน" hint="เว้นว่างถ้าไม่มี">
            <MoneyInput name="minCharge" defaultValue={defaults.minCharge} />
          </Field>
        </div>
      ) : (
        <Field label="เหมาจ่ายต่อเดือน" className="sm:max-w-[11rem]">
          <MoneyInput name="flatAmount" defaultValue={defaults.flatAmount} required />
        </Field>
      )}
    </div>
  );
}

export function LateFeeFields({
  defaults,
}: {
  defaults: { mode: "off" | "per_day" | "fixed"; amount: string; max: string; graceDays: number };
}) {
  const [mode, setMode] = useState(defaults.mode);
  return (
    <div className="flex flex-col gap-3">
      <Segmented
        name="lateFeeMode"
        value={mode}
        onChange={setMode}
        options={[
          { value: "off", label: "ไม่เก็บ" },
          { value: "per_day", label: "คิดต่อวัน" },
          { value: "fixed", label: "เก็บครั้งเดียว" },
        ]}
      />
      {mode !== "off" && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label={mode === "per_day" ? "วันละ" : "จำนวน"}>
              <MoneyInput name="lateFeeAmount" defaultValue={defaults.amount} required />
            </Field>
            {mode === "per_day" && (
              <Field label="สูงสุด" hint="เว้นว่างถ้าไม่จำกัด">
                <MoneyInput name="lateFeeMax" defaultValue={defaults.max} />
              </Field>
            )}
            <Field label="ผ่อนผัน" hint="วัน หลังครบกำหนด">
              <Input name="lateFeeGraceDays" type="number" min={0} defaultValue={defaults.graceDays} />
            </Field>
          </div>
          <p className="text-sm text-muted">ระบบจะเสนอค่าปรับในบิลเดือนถัดไป คุณเลือกเก็บหรือยกเว้นได้ทุกครั้ง</p>
        </>
      )}
    </div>
  );
}
