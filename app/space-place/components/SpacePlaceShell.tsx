"use client";

import { usePathname } from "next/navigation";
import { useSpacePlace } from "../SpacePlaceContext";
import { SpacePlaceAccessGate } from "./SpacePlaceAccessGate";
import { BottomNav } from "./BottomNav";

function shouldHideNav(pathname: string): boolean {
  return (
    pathname.includes("/organisations/") ||
    pathname.includes("/contacts/") ||
    pathname.includes("/spacers/") ||
    pathname.includes("/team/") ||
    pathname.endsWith("/new") ||
    pathname.startsWith("/space-place/add/log")
  );
}

export function SpacePlaceShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { profile } = useSpacePlace();

  if (pathname.startsWith("/space-place/join")) {
    return (
      <div className="min-h-screen bg-neutral-50 px-4 py-8 text-neutral-900">
        {children}
      </div>
    );
  }

  const hideNav = shouldHideNav(pathname);

  return (
    <SpacePlaceAccessGate>
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
              {profile?.full_name || profile?.email}
            </p>
          </div>
        </header>

        <main
          className={`mx-auto w-full max-w-3xl flex-1 px-4 pt-4 ${
            hideNav
              ? "pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
              : "pb-[calc(6.5rem+env(safe-area-inset-bottom))]"
          }`}
        >
          {children}
        </main>

        {!hideNav ? <BottomNav /> : null}
      </div>
    </SpacePlaceAccessGate>
  );
}

export function PageTitle({
  title,
  subtitle,
  className = "",
}: {
  title: string;
  subtitle?: string;
  className?: string;
}) {
  return (
    <div className={`mb-5 ${className}`}>
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
  form,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  disabled?: boolean;
  className?: string;
  form?: string;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      form={form}
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
