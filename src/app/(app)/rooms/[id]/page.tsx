import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, ConfirmSubmit, SubmitButton } from "@/components/client";
import { Checkbox, Field, Input, MoneyInput, Odometer, Section, Select, StatusBadge } from "@/components/ui";
import { formatBaht } from "@/lib/billing";
import { bahtInput, dateLabel, todayISO } from "@/lib/format";
import { requireOrg } from "@/server/auth";
import { listChargeTypes } from "@/server/queries";
import { getRoom } from "@/server/rooms";
import { moveIn, moveOut, saveRoomCharges, updateLeaseRent, updateRoom } from "../actions";

const METER_LABEL = { electric: "ไฟฟ้า", water: "น้ำ" } as const;

export default async function RoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireOrg();
  const [data, chargeTypes] = await Promise.all([getRoom(ctx, id), listChargeTypes(ctx)]);
  if (!data) notFound();
  const { room, lease, people, meters, overrides } = data;
  const primary = people[0]?.resident;

  return (
    <>
      <Link href="/rooms" className="text-sm text-pen hover:underline">
        ห้องพักทั้งหมด
      </Link>
      <header className="mb-6 mt-2 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-[32px] font-bold leading-none">ห้อง {room.number}</h1>
        <StatusBadge status={room.status} />
        {room.floor != null && <span className="text-muted">ชั้น {room.floor}</span>}
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-6">
          {lease && primary ? (
            <Section title="ผู้เช่า">
              <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
                <Item label="ชื่อ">
                  {primary.firstName} {primary.lastName}
                </Item>
                <Item label="โทร">{primary.phone ?? "–"}</Item>
                <Item label="เข้าพัก">{dateLabel(lease.startDate)}</Item>
                <Item label="เงินประกัน">{formatBaht(lease.deposit)} ฿</Item>
              </dl>

              <ActionForm
                action={updateLeaseRent}
                className="mt-6 flex flex-col gap-3 border-t border-line pt-5"
                footer={<SubmitButton variant="secondary" size="sm">บันทึกค่าเช่า</SubmitButton>}
              >
                <input type="hidden" name="leaseId" value={lease.id} />
                <Field label="ค่าเช่าตามสัญญา" hint="แก้แล้วใช้กับบิลรอบถัดไป ถ้าจะลดเฉพาะเดือนเดียว ให้แก้ในบิลแทน" className="max-w-xs">
                  <MoneyInput name="rent" defaultValue={bahtInput(lease.rent)} />
                </Field>
              </ActionForm>

              <details className="mt-6 border-t border-line pt-5">
                <summary className="cursor-pointer text-[15px] font-medium text-alert">ย้ายออก</summary>
                <ActionForm
                  action={moveOut}
                  className="mt-4 flex flex-col gap-4"
                  footer={
                    <ConfirmSubmit variant="danger" message={`ยืนยันการย้ายออกของห้อง ${room.number}?`}>
                      บันทึกการย้ายออก
                    </ConfirmSubmit>
                  }
                >
                  <input type="hidden" name="leaseId" value={lease.id} />
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <Field label="วันที่ย้ายออก" hint="วันสุดท้ายที่พัก">
                      <Input name="date" type="date" defaultValue={todayISO()} required />
                    </Field>
                    <Field label="เลขมิเตอร์ไฟ">
                      <Input name="electric" inputMode="decimal" required />
                    </Field>
                    <Field label="เลขมิเตอร์น้ำ">
                      <Input name="water" inputMode="decimal" required />
                    </Field>
                  </div>
                  <p className="text-sm text-muted">ค่าน้ำไฟถึงวันย้ายออกจะอยู่ในบิลเดือนนี้ของผู้เช่าคนนี้</p>
                </ActionForm>
              </details>
            </Section>
          ) : (
            <Section title="ผู้เช่าย้ายเข้า" description="ถ้าผู้เช่าอยู่มาก่อนแล้ว ใส่วันที่เริ่มเช่าจริง และเลขมิเตอร์ที่จดครั้งล่าสุด">
              <ActionForm action={moveIn} className="flex flex-col gap-4" footer={<SubmitButton>บันทึกผู้เช่า</SubmitButton>}>
                <input type="hidden" name="roomId" value={room.id} />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="ชื่อ">
                    <Input name="firstName" required autoComplete="off" />
                  </Field>
                  <Field label="นามสกุล">
                    <Input name="lastName" autoComplete="off" />
                  </Field>
                  <Field label="โทร">
                    <Input name="phone" type="tel" inputMode="tel" autoComplete="off" />
                  </Field>
                  <Field label="วันที่เริ่มเช่า">
                    <Input name="startDate" type="date" defaultValue={todayISO()} required />
                  </Field>
                  <Field label="ค่าเช่าต่อเดือน">
                    <MoneyInput name="rent" defaultValue={bahtInput(room.baseRent)} required />
                  </Field>
                  <Field label="เงินประกัน">
                    <MoneyInput name="deposit" placeholder="0" />
                  </Field>
                </div>
                <fieldset className="grid grid-cols-2 gap-3 rounded-lg bg-paper p-4">
                  <legend className="sr-only">เลขมิเตอร์ตั้งต้น</legend>
                  <Field label={<span className="text-volt">เลขมิเตอร์ไฟ ณ วันเข้าพัก</span>}>
                    <Input name="electric" inputMode="decimal" required defaultValue={meters.find((m) => m.type === "electric")?.last?.value ?? ""} />
                  </Field>
                  <Field label={<span className="text-aqua">เลขมิเตอร์น้ำ ณ วันเข้าพัก</span>}>
                    <Input name="water" inputMode="decimal" required defaultValue={meters.find((m) => m.type === "water")?.last?.value ?? ""} />
                  </Field>
                </fieldset>
              </ActionForm>
            </Section>
          )}

          {chargeTypes.length > 0 && (
            <Section title="ค่าบริการของห้องนี้" description="ติ๊กออกถ้าห้องนี้ไม่ต้องจ่าย หรือแก้ยอดเฉพาะห้องนี้">
              <ActionForm action={saveRoomCharges} className="flex flex-col gap-4" footer={<SubmitButton variant="secondary">บันทึก</SubmitButton>}>
                <input type="hidden" name="roomId" value={room.id} />
                {chargeTypes
                  .filter((ct) => ct.active)
                  .map((ct) => {
                    const o = overrides.find((x) => x.chargeTypeId === ct.id);
                    return (
                      <div key={ct.id} className="flex items-center justify-between gap-4">
                        <Checkbox name={`enabled:${ct.id}`} defaultChecked={o ? o.enabled : ct.applyByDefault} label={ct.name} />
                        <div className="w-32">
                          <MoneyInput name={`amount:${ct.id}`} defaultValue={bahtInput(o?.amount ?? ct.defaultAmount)} aria-label={`ยอด${ct.name}`} />
                        </div>
                      </div>
                    );
                  })}
              </ActionForm>
            </Section>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <Section title="มิเตอร์">
            <ul className="flex flex-col gap-5">
              {meters.map((m) => (
                <li key={m.id} className="flex flex-col gap-2">
                  <span className={m.type === "electric" ? "text-sm font-medium text-volt" : "text-sm font-medium text-aqua"}>
                    {METER_LABEL[m.type]}
                  </span>
                  <Odometer value={m.last?.value ?? null} className="text-xl" />
                  <span className="text-sm text-muted">
                    {m.last ? `จดล่าสุด ${dateLabel(m.last.readAt.toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" }))}` : "ยังไม่มีการจด"}
                  </span>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="ข้อมูลห้อง">
            <ActionForm action={updateRoom} className="flex flex-col gap-4" footer={<SubmitButton variant="secondary">บันทึก</SubmitButton>}>
              <input type="hidden" name="roomId" value={room.id} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="เลขห้อง">
                  <Input name="number" defaultValue={room.number} required />
                </Field>
                <Field label="ชั้น">
                  <Input name="floor" type="number" defaultValue={room.floor ?? ""} />
                </Field>
              </div>
              <Field label="ค่าเช่าตั้งต้น" hint="ใช้เป็นค่าเริ่มต้นตอนมีผู้เช่าใหม่">
                <MoneyInput name="baseRent" defaultValue={bahtInput(room.baseRent)} />
              </Field>
              {room.status !== "occupied" && (
                <Field label="สถานะ">
                  <Select name="status" defaultValue={room.status}>
                    <option value="vacant">ว่าง</option>
                    <option value="reserved">จองแล้ว</option>
                    <option value="maintenance">ซ่อมบำรุง</option>
                  </Select>
                </Field>
              )}
            </ActionForm>
          </Section>
        </div>
      </div>
    </>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-0.5 text-[15px]">{children}</dd>
    </div>
  );
}
