import { ButtonLink, EmptyState, PageHeader, PeriodSwitch } from "@/components/ui";
import { monthLabel, periodFromParam } from "@/lib/format";
import { requireOrg } from "@/server/auth";
import { meterSheet } from "@/server/readings";
import { MeterSheet } from "./sheet";

export default async function MetersPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const ctx = await requireOrg();
  const period = periodFromParam((await searchParams).period);
  const rows = await meterSheet(ctx, period);

  return (
    <>
      <PageHeader
        title="จดมิเตอร์"
        description={`รอบ${monthLabel(period)} จดตามวันที่ ${ctx.property.billingDay} ของเดือน กด Enter เพื่อไปห้องถัดไป`}
        actions={<PeriodSwitch period={period} basePath="/meters" />}
      />
      {rows.length === 0 ? (
        <EmptyState title="ยังไม่มีห้องที่มีผู้เช่า" action={<ButtonLink href="/rooms">ไปที่ห้องพัก</ButtonLink>}>
          มิเตอร์จะแสดงที่นี่เมื่อมีผู้เช่าย้ายเข้า
        </EmptyState>
      ) : (
        <MeterSheet key={period} rows={rows} period={period} />
      )}
    </>
  );
}
