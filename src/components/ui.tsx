import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { monthLabel, periodParam, shiftPeriod } from "@/lib/format";

export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

// ---------------------------------------------------------------------------
// buttons

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANT: Record<Variant, string> = {
  primary: "bg-pen text-white hover:bg-pen-dark disabled:bg-faint",
  secondary: "bg-surface text-ink border border-line-strong hover:border-ink disabled:text-faint",
  ghost: "text-pen hover:bg-pen-wash",
  danger: "bg-surface text-alert border border-alert/40 hover:bg-alert-wash",
};

export const buttonClass = (variant: Variant = "primary", size: "md" | "sm" | "lg" = "md") =>
  cn(
    "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed whitespace-nowrap",
    size === "sm" && "h-8 px-3 text-sm",
    size === "md" && "h-10 px-4 text-[15px]",
    size === "lg" && "h-12 px-5 text-base",
    VARIANT[variant],
  );

export function Button({
  variant,
  size,
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: "md" | "sm" | "lg" }) {
  return <button className={cn(buttonClass(variant, size), className)} {...props} />;
}

export function ButtonLink({
  variant,
  size,
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: "md" | "sm" | "lg" }) {
  return <Link className={cn(buttonClass(variant, size), className)} {...props} />;
}

// ---------------------------------------------------------------------------
// form fields

export const inputClass =
  "h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-[15px] text-ink placeholder:text-faint focus:border-pen focus:outline-none focus:ring-2 focus:ring-pen/20 disabled:bg-paper";

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      <span className="text-sm font-medium text-ink">{label}</span>
      {children}
      {error ? <span className="text-sm text-alert">{error}</span> : hint ? <span className="text-sm text-muted">{hint}</span> : null}
    </label>
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(inputClass, className)} {...props} />;
}

/** Money input in baht with a ฿ suffix. */
export function MoneyInput({ className, ...props }: ComponentProps<"input">) {
  return (
    <div className="relative">
      <input inputMode="decimal" autoComplete="off" className={cn(inputClass, "pr-9 text-right", className)} {...props} />
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted">฿</span>
    </div>
  );
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(inputClass, "appearance-auto pr-2", className)} {...props} />;
}

export function Checkbox({ label, hint, ...props }: ComponentProps<"input"> & { label: ReactNode; hint?: ReactNode }) {
  return (
    <label className="flex items-start gap-3">
      <input type="checkbox" className="mt-1 size-4 accent-pen" {...props} />
      <span className="flex flex-col">
        <span className="text-[15px] text-ink">{label}</span>
        {hint && <span className="text-sm text-muted">{hint}</span>}
      </span>
    </label>
  );
}

// ---------------------------------------------------------------------------
// layout

export function PageHeader({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-[28px] font-semibold leading-tight text-ink">{title}</h1>
        {description && <p className="mt-1 max-w-prose text-[15px] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Section({
  title,
  description,
  children,
  actions,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-panel border border-line bg-surface", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
        </div>
        {actions}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "error" | "ok"; children: ReactNode }) {
  const tones = {
    info: "bg-pen-wash text-pen-dark",
    warn: "bg-hold-wash text-hold",
    error: "bg-alert-wash text-alert",
    ok: "bg-ok-wash text-ok",
  };
  return <div className={cn("rounded-lg px-4 py-3 text-sm", tones[tone])}>{children}</div>;
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-panel border border-dashed border-line-strong bg-surface px-6 py-12 text-center">
      <p className="font-display text-lg font-semibold">{title}</p>
      {children && <p className="mx-auto mt-1 max-w-md text-[15px] text-muted">{children}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// data display

const STATUS = {
  draft: ["ร่าง", "bg-paper text-muted border border-line-strong"],
  issued: ["รอชำระ", "bg-pen-wash text-pen-dark"],
  partially_paid: ["ชำระบางส่วน", "bg-hold-wash text-hold"],
  paid: ["ชำระแล้ว", "bg-ok-wash text-ok"],
  void: ["ยกเลิก", "bg-alert-wash text-alert line-through"],
  vacant: ["ว่าง", "bg-paper text-muted border border-line-strong"],
  occupied: ["มีผู้เช่า", "bg-ok-wash text-ok"],
  reserved: ["จองแล้ว", "bg-pen-wash text-pen-dark"],
  maintenance: ["ซ่อมบำรุง", "bg-hold-wash text-hold"],
} as const;

export function StatusBadge({ status }: { status: keyof typeof STATUS }) {
  const [label, cls] = STATUS[status];
  return <span className={cn("inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium", cls)}>{label}</span>;
}

/**
 * Meter reading as a mechanical counter. `digits` = whole-number digits shown
 * (zero-padded); one red box for the first decimal.
 */
export function Odometer({ value, digits = 5, className }: { value: number | null; digits?: number; className?: string }) {
  if (value == null) {
    return (
      <span className={cn("odo", className)} aria-label="ไม่มีเลข">
        {Array.from({ length: digits + 1 }, (_, i) => (
          <span key={i} data-empty="" data-frac={i === digits ? "" : undefined}>
            –
          </span>
        ))}
      </span>
    );
  }
  const [whole, frac = "0"] = value.toFixed(1).split(".");
  const padded = whole.padStart(digits, "0");
  return (
    <span className={cn("odo", className)} aria-label={value.toLocaleString("th-TH")}>
      {padded.split("").map((d, i) => (
        <span key={i}>{d}</span>
      ))}
      <span data-frac="">{frac}</span>
    </span>
  );
}

/** Previous / next month links that keep the rest of the page. */
export function PeriodSwitch({ period, basePath }: { period: string; basePath: string }) {
  const link = (p: string) => `${basePath}?period=${periodParam(p)}`;
  return (
    <div className="flex items-center rounded-lg border border-line-strong bg-surface">
      <Link href={link(shiftPeriod(period, -1))} className="grid h-10 w-10 place-items-center text-muted hover:text-ink" aria-label="เดือนก่อน">
        ‹
      </Link>
      <span className="min-w-32 px-2 text-center font-display font-semibold">{monthLabel(period, "short")}</span>
      <Link href={link(shiftPeriod(period, 1))} className="grid h-10 w-10 place-items-center text-muted hover:text-ink" aria-label="เดือนถัดไป">
        ›
      </Link>
    </div>
  );
}
