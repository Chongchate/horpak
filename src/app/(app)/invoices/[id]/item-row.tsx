"use client";

import { useEffect, useState } from "react";
import { ActionForm, SubmitButton } from "@/components/client";
import { Input, MoneyInput, cn } from "@/components/ui";
import { formatBaht } from "@/lib/billing";
import { bahtInput } from "@/lib/format";
import { excludeItemAction, includeItemAction, overrideItemAction, removeManualItemAction } from "../actions";

export type ItemView = {
  itemKey: string;
  type: string;
  source: "auto" | "manual";
  description: string;
  calculatedAmount: number | null;
  amount: number;
  overrideReason: string | null;
  excluded: boolean;
  stale: boolean;
  reason: string | null;
};

const ACCENT: Record<string, string> = { electric: "bg-volt", water: "bg-aqua" };

export function ItemRow({ item, invoiceId, editable }: { item: ItemView; invoiceId: string; editable: boolean }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  // Waiving swaps the form for another, so also close whenever the saved line changes.
  useEffect(close, [item.amount, item.excluded]);
  const overridden = item.source === "auto" && !item.excluded && item.amount !== item.calculatedAmount;

  return (
    <li className="py-3">
      <div className="flex items-start gap-3">
        <span aria-hidden className={cn("mt-2 size-1.5 shrink-0 rounded-full", ACCENT[item.type] ?? "bg-line-strong")} />
        <div className="min-w-0 flex-1">
          <p className={cn("text-[15px]", item.excluded && "text-faint line-through")}>{item.description}</p>
          {item.reason && !overridden && <p className="text-sm text-muted">{item.reason}</p>}
          {overridden && (
            <p className="text-sm text-hold">
              ระบบคำนวณ {formatBaht(item.calculatedAmount ?? 0)} แก้เป็น {formatBaht(item.amount)} เพราะ{item.overrideReason}
            </p>
          )}
          {item.excluded && <p className="text-sm text-muted">ยกเว้น: {item.overrideReason}</p>}
          {item.stale && <p className="text-sm text-alert">ยอดที่ระบบคำนวณเปลี่ยนไปหลังคุณแก้ ตรวจอีกครั้ง</p>}
          {item.source === "manual" && <p className="text-sm text-muted">เพิ่มเอง</p>}
        </div>
        <span className={cn("shrink-0 text-right font-medium tabular-nums", item.excluded && "text-faint line-through", item.amount < 0 && "text-ok")}>
          {formatBaht(item.amount)}
        </span>
        {editable && (
          <button type="button" onClick={() => setOpen(!open)} className="shrink-0 text-sm text-pen hover:underline" aria-expanded={open}>
            {open ? "ปิด" : "แก้"}
          </button>
        )}
      </div>

      {editable && open && (
        <div className="ml-4.5 mt-3 flex flex-col gap-3 rounded-lg bg-paper p-3">
          {item.excluded ? (
            <ActionForm action={includeItemAction} onSuccess={close} footer={<SubmitButton size="sm" variant="secondary">เก็บรายการนี้</SubmitButton>}>
              <Hidden invoiceId={invoiceId} itemKey={item.itemKey} />
            </ActionForm>
          ) : (
            <>
              <ActionForm action={overrideItemAction} onSuccess={close} className="flex flex-col gap-2" footer={<SubmitButton size="sm">บันทึกยอด</SubmitButton>}>
                <Hidden invoiceId={invoiceId} itemKey={item.itemKey} />
                <div className="grid gap-2 sm:grid-cols-[9rem_1fr]">
                  <MoneyInput name="amount" defaultValue={bahtInput(item.amount)} aria-label="ยอดใหม่" />
                  {item.source === "auto" && (
                    <Input name="reason" placeholder="เหตุผล เช่น ลดพิเศษให้" defaultValue={item.overrideReason ?? ""} aria-label="เหตุผล" />
                  )}
                </div>
              </ActionForm>
              {item.source === "auto" ? (
                <ActionForm action={excludeItemAction} onSuccess={close} className="flex flex-col gap-2 border-t border-line pt-3" footer={<SubmitButton size="sm" variant="danger">ยกเว้นรายการนี้</SubmitButton>}>
                  <Hidden invoiceId={invoiceId} itemKey={item.itemKey} />
                  <Input name="reason" placeholder="เหตุผลที่ยกเว้น" required aria-label="เหตุผลที่ยกเว้น" />
                </ActionForm>
              ) : (
                <ActionForm action={removeManualItemAction} onSuccess={close} className="border-t border-line pt-3" footer={<SubmitButton size="sm" variant="danger">ลบรายการ</SubmitButton>}>
                  <Hidden invoiceId={invoiceId} itemKey={item.itemKey} />
                </ActionForm>
              )}
            </>
          )}
        </div>
      )}
    </li>
  );
}

function Hidden({ invoiceId, itemKey }: { invoiceId: string; itemKey: string }) {
  return (
    <>
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <input type="hidden" name="itemKey" value={itemKey} />
    </>
  );
}
