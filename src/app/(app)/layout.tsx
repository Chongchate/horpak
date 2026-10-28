import { NavLinks } from "@/components/client";
import { requireOrg } from "@/server/auth";
import { signOut } from "../login/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireOrg();

  return (
    <div className="min-h-dvh md:pl-60">
      {/* desktop rail */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col bg-ink px-3 py-5 text-white md:flex">
        <div className="px-3 pb-6">
          <p className="font-display text-xl font-bold tracking-tight">{ctx.property.name}</p>
          {ctx.orgName !== ctx.property.name && <p className="mt-0.5 text-sm text-white/55">{ctx.orgName}</p>}
        </div>
        <nav className="flex flex-col gap-1">
          <NavLinks variant="rail" />
        </nav>
        <form action={signOut} className="mt-auto px-3">
          <button className="text-sm text-white/55 hover:text-white">ออกจากระบบ</button>
        </form>
      </aside>

      {/* mobile top bar */}
      <header className="sticky top-0 z-20 flex h-12 items-center justify-between bg-ink px-4 text-white md:hidden">
        <p className="font-display font-bold">{ctx.property.name}</p>
        <form action={signOut}>
          <button className="text-sm text-white/60">ออกจากระบบ</button>
        </form>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 md:px-8 md:pb-12 md:pt-8">{children}</main>

      {/* mobile tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
        <NavLinks variant="tabs" />
      </nav>
    </div>
  );
}
