"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  createContext,
  startTransition,
  useActionState,
  useContext,
  useEffect,
  useRef,
  type ComponentProps,
  type ReactNode,
} from "react";
import { useFormStatus } from "react-dom";
import { buttonClass, cn } from "./ui";

export type ActionState = { error?: string; ok?: string };
export type FormAction = (state: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * Form bound to a server action returning { error | ok }. `footer` renders next
 * to the result message, typically the submit button.
 */
export function ActionForm({
  action,
  children,
  footer,
  className,
  onSuccess,
}: {
  action: FormAction;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
  onSuccess?: () => void;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const formRef = useRef<HTMLFormElement>(null);

  // React resets a form after every `action` submit, which would wipe what the user typed when
  // saving fails. Submit manually instead and reset only on success (inputs then pick up the
  // re-rendered defaultValues).
  const onSuccessRef = useRef(onSuccess);
  onSuccessRef.current = onSuccess;
  useEffect(() => {
    if (!state.ok) return;
    formRef.current?.reset();
    onSuccessRef.current?.();
  }, [state]);

  return (
    <form
      ref={formRef}
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
        startTransition(() => formAction(data));
      }}
    >
      <PendingContext.Provider value={pending}>
        {children}
        {(footer || state.error || state.ok) && (
          <div className="flex flex-wrap items-center gap-3">
            {footer}
            {state.error && (
              <p role="alert" className="whitespace-pre-line text-sm text-alert">
                {state.error}
              </p>
            )}
            {state.ok && (
              <p role="status" className="whitespace-pre-line text-sm text-ok">
                {state.ok}
              </p>
            )}
          </div>
        )}
      </PendingContext.Provider>
    </form>
  );
}

const PendingContext = createContext(false);

/** Submit button that shows a pending label while its form's action runs. */
export function SubmitButton({
  children,
  pendingLabel,
  variant,
  size,
  className,
  ...props
}: ComponentProps<"button"> & {
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "md" | "sm" | "lg";
}) {
  const status = useFormStatus();
  const actionPending = useContext(PendingContext);
  const pending = status.pending || actionPending;
  return (
    <button type="submit" disabled={pending || props.disabled} className={cn(buttonClass(variant, size), className)} {...props}>
      {pending ? (pendingLabel ?? "กำลังบันทึก…") : children}
    </button>
  );
}

/** Submit button that asks for confirmation first. */
export function ConfirmSubmit({ message, ...props }: ComponentProps<typeof SubmitButton> & { message: string }) {
  return (
    <SubmitButton
      {...props}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    />
  );
}

const NAV = [
  { href: "/rooms", label: "ห้องพัก", icon: IconDoor },
  { href: "/meters", label: "จดมิเตอร์", icon: IconGauge },
  { href: "/invoices", label: "บิล", icon: IconBill },
  { href: "/settings", label: "ตั้งค่า", icon: IconCog },
];

export function NavLinks({ variant }: { variant: "rail" | "tabs" }) {
  const pathname = usePathname();
  return (
    <>
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(href + "/");
        return variant === "rail" ? (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex h-10 items-center gap-3 rounded-lg px-3 text-[15px] transition-colors",
              active ? "bg-white/12 text-white" : "text-white/65 hover:bg-white/6 hover:text-white",
            )}
          >
            <Icon className="size-5" />
            {label}
          </Link>
        ) : (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn("flex flex-1 flex-col items-center gap-0.5 py-2 text-xs", active ? "text-pen" : "text-muted")}
          >
            <Icon className="size-6" />
            {label}
          </Link>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------------
// icons (stroke, 24px grid)

type IconProps = { className?: string };
const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" } as const;

function IconDoor({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...stroke} aria-hidden>
      <path d="M5 21V4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v17M3 21h18" />
      <circle cx="15" cy="12.5" r="1" fill="currentColor" />
    </svg>
  );
}
function IconGauge({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...stroke} aria-hidden>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M7 12h2.5M11 12h2.5M15 12h2" />
      <path d="M7 9h10" opacity=".5" />
    </svg>
  );
}
function IconBill({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...stroke} aria-hidden>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2z" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </svg>
  );
}
function IconCog({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} {...stroke} aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
    </svg>
  );
}
