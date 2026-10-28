"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { Button, Odometer, cn } from "@/components/ui";
import type { SheetRow } from "@/server/readings";
import { confirmReadings, saveReading } from "./actions";

type Cell = { saved: string; value: string; status: "draft" | "confirmed" | null; error?: string; saving?: boolean };

const LABEL = { electric: "ไฟ", water: "น้ำ" } as const;

const toText = (n: number | null) => (n == null ? "" : String(n));

function usage(opening: number | null, text: string, rolloverAt: number | null): number | null {
  if (opening == null || text.trim() === "") return null;
  const v = Number(text.replace(/,/g, ""));
  if (!Number.isFinite(v)) return null;
  const diff = v >= opening ? v - opening : rolloverAt != null ? rolloverAt - opening + v : NaN;
  return Number.isNaN(diff) ? null : Math.round(diff * 100) / 100;
}

export function MeterSheet({ rows, period }: { rows: SheetRow[]; period: string }) {
  const [cells, setCells] = useState<Record<string, Cell>>(() =>
    Object.fromEntries(
      rows.flatMap((r) => r.meters.map((m) => [m.meterId, { saved: toText(m.current), value: toText(m.current), status: m.status }])),
    ),
  );
  const [confirming, startConfirm] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  const patch = (id: string, p: Partial<Cell>) => setCells((c) => ({ ...c, [id]: { ...c[id], ...p } }));

  async function commit(meterId: string) {
    const cell = cells[meterId];
    if (cell.value.trim() === cell.saved.trim() && !cell.error) return;
    patch(meterId, { saving: true, error: undefined });
    const res = await saveReading(meterId, period, cell.value);
    if (res.ok) patch(meterId, { saving: false, saved: cell.value, status: res.status });
    else patch(meterId, { saving: false, error: res.error });
  }

  const allMeters = rows.flatMap((r) => r.meters);
  const roomsDone = rows.filter((r) => r.meters.every((m) => cells[m.meterId].saved !== "")).length;
  const drafts = allMeters.filter((m) => cells[m.meterId].status === "draft").length;
  const hasErrors = allMeters.some((m) => cells[m.meterId].error);
  const allConfirmed = allMeters.every((m) => cells[m.meterId].status === "confirmed");

  function confirmAll() {
    const missing = rows.length - roomsDone;
    if (missing > 0 && !window.confirm(`ยังไม่ได้จด ${missing} ห้อง ยืนยันเฉพาะห้องที่จดแล้ว?`)) return;
    startConfirm(async () => {
      const { confirmed } = await confirmReadings(period);
      setCells((c) => Object.fromEntries(Object.entries(c).map(([k, v]) => [k, v.status === "draft" ? { ...v, status: "confirmed" } : v])));
      setNotice(`ยืนยันเลขมิเตอร์ ${confirmed} รายการแล้ว`);
    });
  }

  let index = -1;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex items-center gap-3">
          <div className="h-2 w-40 overflow-hidden rounded-full bg-line" aria-hidden>
            <div className="h-full rounded-full bg-pen transition-[width] duration-300" style={{ width: `${(roomsDone / rows.length) * 100}%` }} />
          </div>
          <span className="text-[15px]">
            จดแล้ว <b className="font-semibold">{roomsDone}</b> จาก {rows.length} ห้อง
          </span>
        </div>
        {allConfirmed && roomsDone === rows.length && (
          <span className="text-[15px] text-ok">
            ยืนยันครบแล้ว{" "}
            <Link href={`/invoices?period=${period.slice(0, 7)}`} className="font-medium underline">
              ไปสร้างบิล
            </Link>
          </span>
        )}
      </div>

      <ol className="flex flex-col divide-y divide-line overflow-hidden rounded-panel border border-line bg-surface">
        {rows.map((row) => (
          <li key={row.roomId} className="grid gap-3 px-4 py-4 md:grid-cols-[9rem_1fr_1fr] md:items-start md:gap-6 md:px-5">
            <div className="flex items-baseline gap-3 md:flex-col md:gap-0">
              <span className="font-display text-2xl font-bold leading-tight">{row.roomNumber}</span>
              <span className="truncate text-sm text-muted">{row.residentName}</span>
            </div>
            {row.meters.map((m) => {
              const cell = cells[m.meterId];
              const units = usage(m.opening, cell.value, m.rolloverAt);
              const i = ++index;
              return (
                <div key={m.meterId} className="grid grid-cols-[2.5rem_1fr] items-center gap-x-3 gap-y-1.5">
                  <span className={cn("text-sm font-semibold", m.type === "electric" ? "text-volt" : "text-aqua")}>{LABEL[m.type]}</span>
                  <div className="flex items-center gap-2 text-[13px] text-muted">
                    <Odometer value={m.opening} />
                    {m.openingIsMoveIn && <span>เลขวันเข้าพัก</span>}
                  </div>
                  <span />
                  <div className="flex items-center gap-3">
                    <input
                      ref={(el) => {
                        inputs.current[i] = el;
                      }}
                      inputMode="decimal"
                      enterKeyHint="next"
                      autoComplete="off"
                      aria-label={`ห้อง ${row.roomNumber} มิเตอร์${LABEL[m.type]}`}
                      aria-invalid={!!cell.error}
                      placeholder="เลขปัจจุบัน"
                      value={cell.value}
                      onChange={(e) => patch(m.meterId, { value: e.target.value, error: undefined })}
                      onBlur={() => commit(m.meterId)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          (inputs.current[i + 1] ?? e.currentTarget).focus();
                          if (!inputs.current[i + 1]) e.currentTarget.blur();
                        }
                      }}
                      className={cn(
                        "h-12 w-36 rounded-lg border bg-surface px-3 text-right font-display text-xl font-semibold placeholder:font-sans placeholder:text-sm placeholder:font-normal placeholder:text-faint focus:outline-none focus:ring-2",
                        cell.error
                          ? "border-alert focus:ring-alert/25"
                          : cell.status === "confirmed"
                            ? "border-ok/50 focus:ring-ok/25"
                            : "border-line-strong focus:border-pen focus:ring-pen/20",
                      )}
                    />
                    <span className="text-[15px]">
                      {units != null && (
                        <>
                          <b className="font-semibold">{units.toLocaleString("th-TH")}</b> หน่วย
                        </>
                      )}
                    </span>
                  </div>
                  <span />
                  <span className={cn("min-h-5 text-sm", cell.error ? "text-alert" : "text-faint")}>
                    {cell.error ??
                      (cell.saving ? "กำลังบันทึก…" : cell.status === "confirmed" ? "ยืนยันแล้ว" : cell.status === "draft" ? "บันทึกแล้ว รอยืนยัน" : "")}
                  </span>
                </div>
              );
            })}
          </li>
        ))}
      </ol>

      <div className="sticky bottom-20 z-10 flex flex-wrap items-center justify-between gap-3 rounded-panel border border-line bg-surface/95 px-4 py-3 backdrop-blur md:bottom-4">
        <span className="text-[15px] text-muted">
          {notice ?? (drafts > 0 ? `${drafts} รายการรอยืนยัน ยืนยันแล้วจึงนำไปออกบิลได้` : "เลขที่จดจะบันทึกอัตโนมัติ")}
        </span>
        {(drafts > 0 || confirming) && (
          <Button onClick={confirmAll} disabled={hasErrors || confirming}>
            {confirming ? "กำลังยืนยัน…" : `ยืนยันเลขมิเตอร์ ${drafts} รายการ`}
          </Button>
        )}
      </div>
    </div>
  );
}
