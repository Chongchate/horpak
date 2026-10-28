import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, ConfirmSubmit, SubmitButton } from "@/components/client";
import { Field, Input, MoneyInput, Notice, Select, StatusBadge } from "@/components/ui";
import { db } from "@/db";
import { leaseResidents, residents, rooms } from "@/db/schema";
import { formatBaht, invoiceTotal, validateItems } from "@/lib/billing";
import { dateLabel, monthLabel, periodParam } from "@/lib/format";
import { requireOrg } from "@/server/auth";
import { getInvoice, itemFromRow } from "@/server/billing";
import { addManualItemAction, issueInvoiceAction, regenerateInvoice, voidInvoiceAction } from "../actions";
import { ItemRow, type ItemView } from "./item-row";

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireOrg();
  const data = await getInvoice(ctx, id);
  if (!data) notFound();
  const { invoice } = data;

  const [[room], [resident]] = await Promise.all([
    db.select().from(rooms).where(and(eq(rooms.id, invoice.roomId), eq(rooms.orgId, ctx.orgId))),
    db
      .select({ firstName: residents.firstName, lastName: residents.lastName, phone: residents.phone })
      .from(leaseResidents)
      .innerJoin(residents, eq(residents.id, leaseResidents.residentId))
      .where(and(eq(leaseResidents.leaseId, invoice.leaseId), eq(leaseResidents.isPrimary, true))),
  ]);

  const items = data.items.map(itemFromRow);
  const editable = invoice.status === "draft";
  const problems = editable ? validateItems(items) : [];
  const views: ItemView[] = data.items.map((r) => {
    const meta = (r.meta ?? {}) as { reason?: string | null; staleOverride?: boolean };
    return {
      itemKey: r.itemKey,
      type: r.type,
      source: r.source,
      description: r.description,
      calculatedAmount: r.calculatedAmount,
      amount: r.amount,
      overrideReason: r.overrideReason,
      excluded: r.excluded,
      stale: !!meta.staleOverride,
      reason: meta.reason ?? null,
    };
  });

  return (
    <>
      <Link href={`/invoices?period=${periodParam(invoice.period)}`} className="text-sm text-pen hover:underline">
        บิลรอบ{monthLabel(invoice.period)}
      </Link>

      <div className="mt-3 grid gap-6 lg:grid-cols-[minmax(0,40rem)_1fr]">
        {/* the bill */}
        <article className="rounded-panel border border-line bg-surface">
          <header className="flex flex-wrap items-start justify-between gap-4 border-b border-dashed border-line-strong px-6 py-5">
            <div>
              <p className="text-sm text-muted">{ctx.property.name}</p>
              <h1 className="mt-1 font-display text-[28px] font-bold leading-tight">ห้อง {room?.number}</h1>
              <p className="text-[15px]">
                {resident ? `${resident.firstName} ${resident.lastName}` : "–"}
              </p>
            </div>
            <div className="text-right">
              <StatusBadge status={invoice.status} />
              <p className="mt-2 text-sm text-muted">ค่าเช่าเดือน{monthLabel(invoice.period)}</p>
              {invoice.invoiceNo && <p className="text-sm text-muted">เลขที่ {invoice.invoiceNo}</p>}
            </div>
          </header>

          <ul className="divide-y divide-line px-6">
            {views.map((v) => (
              <ItemRow key={v.itemKey} item={v} invoiceId={invoice.id} editable={editable} />
            ))}
          </ul>

          <footer className="flex items-baseline justify-between border-t-2 border-ink px-6 py-4">
            <span className="font-display text-lg font-semibold">รวมทั้งสิ้น</span>
            <span className="font-display text-[28px] font-bold tabular-nums">{formatBaht(editable ? invoiceTotal(items) : invoice.total)}</span>
          </footer>

          {!editable && (
            <dl className="grid grid-cols-2 gap-4 border-t border-line px-6 py-4 text-sm">
              <div>
                <dt className="text-muted">ออกบิล</dt>
                <dd>{dateLabel(invoice.issueDate)}</dd>
              </div>
              <div>
                <dt className="text-muted">ครบกำหนดชำระ</dt>
                <dd className="font-medium">{dateLabel(invoice.dueDate)}</dd>
              </div>
            </dl>
          )}
        </article>

        {/* actions */}
        <aside className="flex flex-col gap-5">
          {editable ? (
            <>
              <div className="flex flex-col gap-3 rounded-panel border border-line bg-surface p-5">
                <h2 className="font-display text-lg font-semibold">ออกบิล</h2>
                {problems.length > 0 ? (
                  <Notice tone="error">{problems.join(" ")}</Notice>
                ) : (
                  <p className="text-sm text-muted">ออกบิลแล้วจะได้เลขที่บิลและแก้ไม่ได้ ถ้าผิดต้องยกเลิกแล้วออกใหม่</p>
                )}
                <ActionForm
                  action={issueInvoiceAction}
                  footer={
                    <ConfirmSubmit size="lg" disabled={problems.length > 0} message={`ออกบิลห้อง ${room?.number} ยอด ${formatBaht(invoiceTotal(items))} บาท?`}>
                      ออกบิล
                    </ConfirmSubmit>
                  }
                >
                  <input type="hidden" name="invoiceId" value={invoice.id} />
                </ActionForm>
                <ActionForm
                  action={regenerateInvoice}
                  className="border-t border-line pt-3"
                  footer={<SubmitButton variant="ghost" size="sm" pendingLabel="กำลังคำนวณ…">คำนวณใหม่จากเลขมิเตอร์ล่าสุด</SubmitButton>}
                >
                  <input type="hidden" name="invoiceId" value={invoice.id} />
                </ActionForm>
              </div>

              <div className="rounded-panel border border-line bg-surface p-5">
                <h2 className="mb-3 font-display text-lg font-semibold">เพิ่มรายการ</h2>
                <ActionForm action={addManualItemAction} className="flex flex-col gap-3" footer={<SubmitButton variant="secondary">เพิ่มรายการ</SubmitButton>}>
                  <input type="hidden" name="invoiceId" value={invoice.id} />
                  <Field label="ประเภท">
                    <Select name="type" defaultValue="fine">
                      <option value="fine">ค่าปรับ</option>
                      <option value="charge">ค่าบริการ</option>
                      <option value="discount">ส่วนลด</option>
                      <option value="adjustment">ปรับปรุงยอด</option>
                    </Select>
                  </Field>
                  <Field label="รายละเอียด">
                    <Input name="description" placeholder="เช่น ค่ากุญแจหาย" required />
                  </Field>
                  <Field label="จำนวนเงิน" hint="ส่วนลดใส่เป็นบวก ระบบจะหักให้">
                    <MoneyInput name="amount" required />
                  </Field>
                </ActionForm>
              </div>
            </>
          ) : invoice.status !== "void" ? (
            <div className="rounded-panel border border-line bg-surface p-5">
              <h2 className="font-display text-lg font-semibold">ยกเลิกบิล</h2>
              <p className="mt-1 text-sm text-muted">ใช้เมื่อบิลผิด บิลเดิมยังเก็บไว้เป็นหลักฐาน แล้วสร้างบิลใหม่ได้</p>
              <ActionForm
                action={voidInvoiceAction}
                className="mt-3 flex flex-col gap-3"
                footer={
                  <ConfirmSubmit variant="danger" message="ยกเลิกบิลนี้?">
                    ยกเลิกบิล
                  </ConfirmSubmit>
                }
              >
                <input type="hidden" name="invoiceId" value={invoice.id} />
                <Input name="reason" placeholder="เหตุผล เช่น จดเลขมิเตอร์ผิด" required aria-label="เหตุผลที่ยกเลิก" />
              </ActionForm>
            </div>
          ) : (
            <Notice tone="error">ยกเลิกแล้ว: {invoice.voidedReason}</Notice>
          )}
        </aside>
      </div>
    </>
  );
}
