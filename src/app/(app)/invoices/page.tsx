import { and, eq, ne } from "drizzle-orm";
import Link from "next/link";
import { ActionForm, ConfirmSubmit, SubmitButton } from "@/components/client";
import { ButtonLink, EmptyState, PageHeader, PeriodSwitch, StatusBadge } from "@/components/ui";
import { db } from "@/db";
import { invoices, leaseResidents, residents, rooms } from "@/db/schema";
import { formatBaht } from "@/lib/billing";
import { monthLabel, periodFromParam } from "@/lib/format";
import { requireOrg } from "@/server/auth";
import { leasesInPeriod } from "@/server/readings";
import { generateForPeriod, issueAllDrafts } from "./actions";

export default async function InvoicesPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const ctx = await requireOrg();
  const period = periodFromParam((await searchParams).period);

  const [list, leases] = await Promise.all([
    db
      .select({ invoice: invoices, roomNumber: rooms.number, floor: rooms.floor, firstName: residents.firstName, lastName: residents.lastName })
      .from(invoices)
      .innerJoin(rooms, eq(rooms.id, invoices.roomId))
      .leftJoin(leaseResidents, and(eq(leaseResidents.leaseId, invoices.leaseId), eq(leaseResidents.isPrimary, true)))
      .leftJoin(residents, eq(residents.id, leaseResidents.residentId))
      .where(and(eq(invoices.orgId, ctx.orgId), eq(invoices.period, period), ne(invoices.status, "void"))),
    leasesInPeriod(ctx, period),
  ]);
  list.sort((a, b) => (a.floor ?? 0) - (b.floor ?? 0) || a.roomNumber.localeCompare(b.roomNumber, "th", { numeric: true }));

  const drafts = list.filter((r) => r.invoice.status === "draft");
  const issued = list.filter((r) => r.invoice.status !== "draft");
  const billed = issued.reduce((s, r) => s + r.invoice.total, 0);
  const collected = issued.reduce((s, r) => s + r.invoice.paidAmount, 0);
  const missing = leases.length - list.length;

  if (leases.length === 0 && list.length === 0) {
    return (
      <>
        <PageHeader title="บิล" description={`รอบ${monthLabel(period)}`} actions={<PeriodSwitch period={period} basePath="/invoices" />} />
        <EmptyState title="ยังไม่มีผู้เช่าในรอบนี้" action={<ButtonLink href="/rooms">ไปที่ห้องพัก</ButtonLink>}>
          บันทึกผู้เช่าย้ายเข้าที่หน้าห้องก่อน แล้วจดมิเตอร์ จึงสร้างบิลได้
        </EmptyState>
      </>
    );
  }

  return (
    <>
      <PageHeader title="บิล" description={`รอบ${monthLabel(period)}`} actions={<PeriodSwitch period={period} basePath="/invoices" />} />

      <dl className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-panel border border-line bg-line sm:grid-cols-4">
        <Stat label="ยอดออกบิลแล้ว" value={`${formatBaht(billed)} ฿`} />
        <Stat label="รับชำระแล้ว" value={`${formatBaht(collected)} ฿`} />
        <Stat label="บิลร่าง" value={`${drafts.length} ใบ`} />
        <Stat label="ยังไม่มีบิล" value={`${Math.max(0, missing)} ห้อง`} />
      </dl>

      <div className="mb-6 flex flex-col gap-3 rounded-panel border border-line bg-surface p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-prose">
          <h2 className="font-display text-lg font-semibold">{list.length ? "คำนวณบิลร่าง" : "สร้างบิลรอบนี้"}</h2>
          <p className="mt-1 text-sm text-muted">
            ใช้เลขมิเตอร์ที่ยืนยันแล้ว บิลร่างคำนวณใหม่ได้เสมอ ยอดที่คุณแก้เองจะไม่ถูกทับ บิลที่ออกแล้วไม่เปลี่ยน
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:items-end">
          <ActionForm action={generateForPeriod} className="flex flex-col gap-2 sm:items-end" footer={<SubmitButton pendingLabel="กำลังคำนวณ…">{list.length ? "คำนวณบิลร่างใหม่" : "สร้างบิล"}</SubmitButton>}>
            <input type="hidden" name="period" value={period} />
          </ActionForm>
          {drafts.length > 0 && (
            <ActionForm
              action={issueAllDrafts}
              footer={
                <ConfirmSubmit variant="secondary" message={`ออกบิลร่างทั้งหมด ${drafts.length} ใบ? บิลที่ออกแล้วจะแก้ไม่ได้`}>
                  ออกบิลร่างทั้งหมด {drafts.length} ใบ
                </ConfirmSubmit>
              }
            >
              <input type="hidden" name="period" value={period} />
            </ActionForm>
          )}
        </div>
      </div>

      {list.length === 0 ? (
        <EmptyState title="ยังไม่มีบิลรอบนี้">จดและยืนยันเลขมิเตอร์ก่อน แล้วกดสร้างบิล</EmptyState>
      ) : (
        <div className="overflow-hidden rounded-panel border border-line bg-surface">
          <table className="w-full text-[15px]">
            <thead className="border-b border-line bg-paper/60 text-left text-sm text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">ห้อง</th>
                <th className="hidden px-4 py-2.5 font-medium sm:table-cell">ผู้เช่า</th>
                <th className="hidden px-4 py-2.5 font-medium md:table-cell">เลขที่บิล</th>
                <th className="px-4 py-2.5 text-right font-medium">ยอด</th>
                <th className="px-4 py-2.5 text-right font-medium">สถานะ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {list.map(({ invoice, roomNumber, firstName, lastName }) => (
                <tr key={invoice.id} className="relative hover:bg-paper/50">
                  <td className="px-4 py-3">
                    <Link href={`/invoices/${invoice.id}`} className="font-display text-lg font-bold after:absolute after:inset-0">
                      {roomNumber}
                    </Link>
                  </td>
                  <td className="hidden px-4 py-3 sm:table-cell">
                    {firstName} {lastName}
                  </td>
                  <td className="hidden px-4 py-3 text-muted md:table-cell">{invoice.invoiceNo ?? "–"}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatBaht(invoice.total)}</td>
                  <td className="px-4 py-3 text-right">
                    <StatusBadge status={invoice.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface px-4 py-3">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-0.5 font-display text-xl font-semibold">{value}</dd>
    </div>
  );
}
