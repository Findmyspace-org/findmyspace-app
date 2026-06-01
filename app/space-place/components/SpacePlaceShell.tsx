"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  CalendarDays,
  GitBranch,
  LayoutGrid,
  Mic,
  MoreHorizontal,
  PlusCircle,
  Users,
  UserCircle,
} from "lucide-react";
import { useSpacePlace } from "../SpacePlaceContext";
import { QuickUpdateButton } from "./QuickUpdateButton";

const ADMIN_NAV = [
  { href: "/space-place/today", label: "Today", icon: CalendarDays },
  { href: "/space-place/pipeline", label: "Pipeline", icon: GitBranch },
  { href: "/space-place/add", label: "Add", icon: PlusCircle },
  { href: "/space-place/team", label: "Team", icon: Users },
  { href: "/space-place/more", label: "More", icon: MoreHorizontal },
] as const;

const SPACER_NAV = [
  { href: "/space-place/today", label: "Today", icon: CalendarDays },
  { href: "/space-place/prospects", label: "My Prospects", icon: UserCircle },
  { href: "/space-place/add", label: "Add", icon: PlusCircle },
  { href: "/space-place/activity", label: "Activity", icon: Activity },
  { href: "/space-place/more", label: "More", icon: MoreHorizontal },
] as const;

export function SpacePlaceShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { profile, loading, error, isAdmin } = useSpacePlace();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-6">
        <p className="text-lg text-neutral-600">Loading The Space Place…</p>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-neutral-50 px-6 text-center">
        <p className="text-xl font-semibold text-neutral-900">The Space Place</p>
        <p className="max-w-md text-neutral-600">{error || "Access denied."}</p>
        <Link
          href="/"
          className="rounded-full bg-[#c1121f] px-6 py-3 text-base font-semibold text-white"
        >
          Back to FindMySpace
        </Link>
      </div>
    );
  }

  const nav = isAdmin ? ADMIN_NAV : SPACER_NAV;
  const hideNav =
    pathname.includes("/organisations/") ||
    pathname.includes("/contacts/") ||
    pathname.includes("/spacers/");

  return (
    <div className="flex min-h-screen flex-col bg-neutral-50 text-neutral-900">
      <header className="sticky top-0 z-20 border-b border-neutral-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-[#c1121f]">
              Internal
            </p>
            <h1 className="text-lg font-bold leading-tight">The Space Place</h1>
          </div>
          <p className="truncate text-right text-sm text-neutral-600">
            {profile.full_name || profile.email}
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-28 pt-4">
        {children}
      </main>

      {!hideNav && (
        <div className="fixed bottom-20 left-0 right-0 z-30 flex justify-center px-4 md:bottom-24">
          <QuickUpdateButton />
        </div>
      )}

      {!hideNav && (
        <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-neutral-200 bg-white pb-[env(safe-area-inset-bottom)]">
          <div className="mx-auto grid max-w-3xl grid-cols-5 gap-1 px-1 py-2">
            {nav.map((item) => {
              const Icon = item.icon;
              const active =
                pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex min-h-[56px] flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-center transition ${
                    active
                      ? "bg-[#c1121f]/10 text-[#c1121f]"
                      : "text-neutral-600 hover:bg-neutral-100"
                  }`}
                >
                  <Icon className="h-6 w-6" strokeWidth={active ? 2.5 : 2} />
                  <span className="text-[10px] font-semibold leading-tight sm:text-xs">
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}

export function PageTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-5">
      <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
      {subtitle ? (
        <p className="mt-1 text-base text-neutral-600">{subtitle}</p>
      ) : null}
    </div>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}

export function PrimaryButton({
  children,
  onClick,
  type = "button",
  disabled,
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`flex min-h-[48px] w-full items-center justify-center rounded-xl bg-[#c1121f] px-4 py-3 text-base font-semibold text-white transition hover:bg-[#a10f1a] disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({
  children,
  href,
  onClick,
  className = "",
}: {
  children: React.ReactNode;
  href?: string;
  onClick?: () => void;
  className?: string;
}) {
  const cls = `flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm font-semibold text-neutral-800 ${className}`;
  if (href) {
    return (
      <a href={href} className={cls}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {children}
    </button>
  );
}

export function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-3 mt-6 text-sm font-bold uppercase tracking-wide text-neutral-500">
      {children}
    </h3>
  );
}
