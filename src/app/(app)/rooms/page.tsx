import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/client";
import { EmptyState, Field, Input, MoneyInput, PageHeader, cn } from "@/components/ui";
import { formatBaht } from "@/lib/billing";
import { requireOrg } from "@/server/auth";
import { listRooms, type RoomRow } from "@/server/rooms";
import { addRooms } from "./actions";

export default async function RoomsPage() {
  const ctx = await requireOrg();
  const rooms = await listRooms(ctx);

  const floors = new Map<number | null, RoomRow[]>();
  for (const r of rooms) floors.set(r.floor, [...(floors.get(r.floor) ?? []), r]);
  const occupied = rooms.filter((r) => r.status === "occupied").length;
  const vacant = rooms.filter((r) => r.status === "vacant").length;
  const rentRoll = rooms.reduce((sum, r) => sum + (r.rent ?? 0), 0);

  const addForm = (
    <ActionForm action={addRooms} className="flex flex-col gap-4" footer={<SubmitButton>เพิ่มห้อง</SubmitButton>}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Field label="ชั้น">
          <Input name="floor" type="number" min={0} defaultValue={1} />
        </Field>
        <Field label="ห้องแรก">
          <Input name="from" inputMode="numeric" placeholder="101" required />
        </Field>
        <Field label="ถึงห้อง" hint="เว้นว่างถ้าเพิ่มห้องเดียว">
          <Input name="to" inputMode="numeric" placeholder="110" />
        </Field>
        <Field label="ค่าเช่าต่อเดือน">
          <MoneyInput name="baseRent" placeholder="3500" required />
        </Field>
      </div>
    </ActionForm>
  );

  if (rooms.length === 0) {
    return (
      <>
        <PageHeader title="ห้องพัก" />
        <EmptyState title="เพิ่มห้องแรกของหอ">ใส่เลขห้องแรกและห้องสุดท้ายของแต่ละชั้น ระบบจะสร้างห้องและมิเตอร์ไฟ-น้ำให้ทุกห้อง</EmptyState>
        <div className="mx-auto mt-6 max-w-2xl rounded-panel border border-line bg-surface p-5">{addForm}</div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="ห้องพัก"
        description={
          <span className="flex flex-wrap gap-x-5 gap-y-1">
            <span>
              <b className="font-semibold text-ink">{occupied}</b> มีผู้เช่า
            </span>
            <span>
              <b className="font-semibold text-ink">{vacant}</b> ว่าง
            </span>
            <span>
              ค่าเช่าห้องที่มีผู้เช่า <b className="font-semibold text-ink">{(rentRoll / 100).toLocaleString("th-TH")}</b> บาท/เดือน
            </span>
          </span>
        }
      />

      <div className="flex flex-col gap-8">
        {[...floors.entries()].map(([floor, list]) => (
          <section key={floor ?? "none"} className="grid gap-3 md:grid-cols-[5rem_1fr]">
            <h2 className="font-display text-sm font-semibold text-muted md:pt-3">{floor != null ? `ชั้น ${floor}` : "ไม่ระบุชั้น"}</h2>
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-2 sm:grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] sm:gap-2.5">
              {list.map((r) => (
                <li key={r.id}>
                  <RoomTag room={r} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      <details className="group mt-10 rounded-panel border border-line bg-surface">
        <summary className="cursor-pointer list-none px-5 py-4 font-display font-semibold marker:hidden">
          <span className="text-pen group-open:text-ink">+ เพิ่มห้อง</span>
        </summary>
        <div className="border-t border-line p-5">{addForm}</div>
      </details>
    </>
  );
}

/** A room as a key tag from the board behind the front desk. */
function RoomTag({ room }: { room: RoomRow }) {
  const occupied = room.status === "occupied";
  return (
    <Link
      href={`/rooms/${room.id}`}
      className={cn(
        "relative flex h-full flex-col rounded-tag border px-3 pb-2.5 pt-2 transition-colors",
        occupied && "border-line-strong bg-surface hover:border-ink",
        room.status === "vacant" && "border-dashed border-line-strong bg-transparent hover:border-ink hover:bg-surface",
        room.status === "maintenance" && "border-hold/40 bg-hold-wash hover:border-hold",
        room.status === "reserved" && "border-pen/30 bg-pen-wash hover:border-pen",
      )}
    >
      <span aria-hidden className="absolute right-2.5 top-2.5 size-2 rounded-full border border-line-strong bg-paper" />
      <span className="font-display text-2xl font-bold leading-tight">{room.number}</span>
      <span className={cn("truncate text-sm", occupied ? "text-ink" : "text-muted")}>
        {occupied ? room.firstName : room.status === "maintenance" ? "ซ่อมบำรุง" : room.status === "reserved" ? "จองแล้ว" : "ว่าง"}
      </span>
      <span className="mt-1 text-xs text-muted">{formatBaht(room.rent ?? room.baseRent).replace(/\.00$/, "")} ฿</span>
    </Link>
  );
}
