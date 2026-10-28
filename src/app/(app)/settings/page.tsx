import { ActionForm, SubmitButton } from "@/components/client";
import { Checkbox, Field, Input, MoneyInput, PageHeader, Section } from "@/components/ui";
import { formatBaht } from "@/lib/billing";
import { bahtInput, currentPeriod, monthLabel } from "@/lib/format";
import { requireOrg } from "@/server/auth";
import { listChargeTypes, ratesFor, type RatePlanRow } from "@/server/queries";
import { saveBillingRules, saveChargeType, saveProperty, saveRate } from "./actions";
import { LateFeeFields, RateFields } from "./fields";

export default async function SettingsPage() {
  const ctx = await requireOrg();
  const p = ctx.property;
  const [rates, charges] = await Promise.all([ratesFor(ctx, currentPeriod()), listChargeTypes(ctx)]);

  return (
    <div className="max-w-3xl">
      <PageHeader title="ตั้งค่า" description="กติกาการคิดเงินของหอพัก ใช้กับบิลที่สร้างหลังบันทึก บิลที่ออกไปแล้วไม่เปลี่ยน" />

      <div className="flex flex-col gap-6">
        <Section title="ข้อมูลหอพัก">
          <ActionForm action={saveProperty} className="flex flex-col gap-4" footer={<SubmitButton>บันทึก</SubmitButton>}>
            <Field label="ชื่อหอพัก">
              <Input name="name" defaultValue={p.name} required />
            </Field>
            <Field label="ที่อยู่" hint="แสดงบนบิล">
              <Input name="address" defaultValue={p.address ?? ""} />
            </Field>
            <Field label="พร้อมเพย์รับเงิน" hint="เบอร์มือถือหรือเลขประจำตัวผู้เสียภาษี ใช้สร้าง QR บนบิล" className="sm:max-w-sm">
              <Input name="promptpayId" inputMode="numeric" defaultValue={p.promptpayId ?? ""} />
            </Field>
            <div className="grid grid-cols-2 gap-4 sm:max-w-sm">
              <Field label="วันจดมิเตอร์" hint="วันที่ของทุกเดือน">
                <Input name="billingDay" type="number" min={1} max={28} defaultValue={p.billingDay} />
              </Field>
              <Field label="ครบกำหนดชำระ" hint="วันที่ของเดือนถัดไป">
                <Input name="dueDay" type="number" min={1} max={28} defaultValue={p.dueDay} />
              </Field>
            </div>
          </ActionForm>
        </Section>

        <Section title="ค่าเช่าและค่าปรับ">
          <ActionForm action={saveBillingRules} className="flex flex-col gap-6" footer={<SubmitButton>บันทึก</SubmitButton>}>
            <fieldset className="flex flex-col gap-2.5">
              <legend className="mb-2.5 text-[15px] font-medium">ผู้เช่าเข้าหรือออกกลางเดือน</legend>
              <Radio name="prorationMode" value="half_month" checked={p.prorationMode === "half_month"} label="คิดครึ่งเดือน">
                เมื่อเข้าพักหลังวันที่{" "}
                <input
                  name="halfMonthCutoffDay"
                  type="number"
                  min={1}
                  max={28}
                  defaultValue={p.halfMonthCutoffDay}
                  aria-label="วันตัดรอบ"
                  className="mx-1 inline-block h-8 w-14 rounded-md border border-line-strong bg-surface text-center align-middle text-[15px] text-ink focus:border-pen focus:outline-none focus:ring-2 focus:ring-pen/20"
                />{" "}
                หรือย้ายออกไม่เกินวันนั้น
              </Radio>
              <Radio name="prorationMode" value="daily" checked={p.prorationMode === "daily"} label="คิดตามจำนวนวันที่อยู่จริง" />
              <Radio name="prorationMode" value="none" checked={p.prorationMode === "none"} label="คิดเต็มเดือนเสมอ" />
            </fieldset>

            <div className="flex flex-col gap-2.5 border-t border-line pt-5">
              <h3 className="text-[15px] font-medium">ค่าปรับชำระล่าช้า</h3>
              <LateFeeFields
                defaults={{
                  mode: p.lateFeeMode,
                  amount: bahtInput(p.lateFeeAmount || null),
                  max: bahtInput(p.lateFeeMax),
                  graceDays: p.lateFeeGraceDays,
                }}
              />
            </div>
          </ActionForm>
        </Section>

        <Section title="ค่าน้ำค่าไฟ" description={`แก้ราคาแล้วจะใช้ตั้งแต่บิลรอบ${monthLabel(currentPeriod())}`}>
          <div className="flex flex-col gap-6">
            <RateForm utility="electric" label="ค่าไฟ" plan={rates.electric} />
            <div className="border-t border-line" />
            <RateForm utility="water" label="ค่าน้ำ" plan={rates.water} />
          </div>
        </Section>

        <Section title="ค่าบริการรายเดือน" description="เช่น ค่าส่วนกลาง อินเทอร์เน็ต ค่าขยะ เปิดหรือปิดรายห้องได้ที่หน้าห้อง">
          <div className="flex flex-col divide-y divide-line">
            {charges.map((c) => (
              <ActionForm
                key={c.id}
                action={saveChargeType}
                className="flex flex-col gap-3 py-4 first:pt-0"
                footer={
                  <SubmitButton variant="secondary" size="sm">
                    บันทึก
                  </SubmitButton>
                }
              >
                <input type="hidden" name="id" value={c.id} />
                <div className="grid grid-cols-[1fr_9rem] gap-3 sm:max-w-md">
                  <Input name="name" defaultValue={c.name} aria-label="ชื่อค่าบริการ" />
                  <MoneyInput name="defaultAmount" defaultValue={bahtInput(c.defaultAmount)} aria-label="จำนวนเงิน" />
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-2">
                  <Checkbox name="applyByDefault" defaultChecked={c.applyByDefault} label="ทุกห้องเก็บ" />
                  <Checkbox name="prorate" defaultChecked={c.prorate} label="คิดครึ่งเดือนตามค่าเช่า" />
                  <Checkbox name="active" defaultChecked={c.active} label="ใช้งาน" />
                </div>
              </ActionForm>
            ))}
            <ActionForm action={saveChargeType} className="flex flex-col gap-3 pt-4" footer={<SubmitButton size="sm">เพิ่มค่าบริการ</SubmitButton>}>
              <div className="grid grid-cols-[1fr_9rem] gap-3 sm:max-w-md">
                <Input name="name" placeholder="ชื่อ เช่น อินเทอร์เน็ต" aria-label="ชื่อค่าบริการใหม่" />
                <MoneyInput name="defaultAmount" placeholder="0" aria-label="จำนวนเงิน" />
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                <Checkbox name="applyByDefault" defaultChecked label="ทุกห้องเก็บ" />
                <Checkbox name="prorate" label="คิดครึ่งเดือนตามค่าเช่า" />
              </div>
            </ActionForm>
          </div>
        </Section>
      </div>
    </div>
  );
}

function Radio({
  label,
  children,
  checked,
  ...props
}: { name: string; value: string; label: string; checked: boolean; children?: React.ReactNode }) {
  return (
    <label className="flex items-start gap-3 rounded-lg border border-line px-4 py-3 has-[:checked]:border-pen has-[:checked]:bg-pen-wash/50">
      <input type="radio" className="mt-1.5 size-4 shrink-0 accent-pen" defaultChecked={checked} {...props} />
      <span className="flex flex-col gap-1">
        <span className="text-[15px]">{label}</span>
        {children && <span className="text-sm leading-9 text-muted">{children}</span>}
      </span>
    </label>
  );
}

function RateForm({ utility, label, plan }: { utility: "electric" | "water"; label: string; plan?: RatePlanRow }) {
  const current =
    plan?.method === "flat"
      ? `เหมาจ่าย ${formatBaht(plan.flatAmount ?? 0)} บาท`
      : plan
        ? `หน่วยละ ${formatBaht(plan.unitPrice ?? 0)} บาท${plan.minCharge ? ` ขั้นต่ำ ${formatBaht(plan.minCharge)} บาท` : ""}`
        : "ยังไม่ได้ตั้ง";
  return (
    <ActionForm
      action={saveRate}
      className="flex flex-col gap-3"
      footer={
        <SubmitButton variant="secondary" size="sm">
          บันทึก{label}
        </SubmitButton>
      }
    >
      <input type="hidden" name="utility" value={utility} />
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h3 className={utility === "electric" ? "font-display text-lg font-semibold text-volt" : "font-display text-lg font-semibold text-aqua"}>{label}</h3>
        <span className="text-sm text-muted">ตอนนี้ {current}</span>
      </div>
      <RateFields
        defaults={{
          method: plan?.method === "flat" ? "flat" : "per_unit",
          unitPrice: bahtInput(plan?.unitPrice),
          minCharge: bahtInput(plan?.minCharge),
          flatAmount: bahtInput(plan?.flatAmount),
        }}
      />
    </ActionForm>
  );
}
