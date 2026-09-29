"use client";

import Link from "next/link";
import {
  Building2,
  CalendarCheck,
  Crown,
  LogOut,
  ShieldCheck,
  UserCircle,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useV2PreviewIdentity } from "./V2PreviewGate";

type AccountMenuVariant = "desktop" | "mobile";

export default function V2AccountMenu({
  variant,
}: {
  variant: AccountMenuVariant;
}) {
  const identity = useV2PreviewIdentity();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    function closeOnOutsideClick(event: MouseEvent) {
      if (
        variant === "desktop" &&
        rootRef.current &&
        !rootRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("mousedown", closeOnOutsideClick);
    };
  }, [open, variant]);

  async function signOut() {
    setOpen(false);
    await supabase.auth.signOut();
    window.location.replace("/");
  }

  const menu = (
    <div
      className={
        variant === "desktop"
          ? "fms-v2-account-popover"
          : "fms-v2-account-sheet"
      }
      role="dialog"
      aria-label="Account menu"
    >
      <div className="fms-v2-account-menu-header">
        <div>
          <p>Signed in</p>
          <strong>{identity.email || "Super Admin"}</strong>
        </div>
        {variant === "mobile" ? (
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close account menu"
          >
            <X aria-hidden />
          </button>
        ) : null}
      </div>

      <nav aria-label="Account links">
        <Link href="/dashboard/my-bookings" onClick={() => setOpen(false)}>
          <CalendarCheck aria-hidden />
          My bookings
        </Link>

        {identity.isPlatformAdmin ? (
          <Link href="/dashboard/owner" onClick={() => setOpen(false)}>
            <Building2 aria-hidden />
            Hosting dashboard
          </Link>
        ) : null}

        {identity.isPlatformAdmin ? (
          <Link href="/admin" onClick={() => setOpen(false)}>
            <ShieldCheck aria-hidden />
            Admin dashboard
          </Link>
        ) : null}

        {identity.isSuperAdmin ? (
          <Link href="/admin/admin-users" onClick={() => setOpen(false)}>
            <Crown aria-hidden />
            Global Admin
          </Link>
        ) : null}
      </nav>

      <button
        type="button"
        className="fms-v2-account-signout"
        onClick={() => void signOut()}
      >
        <LogOut aria-hidden />
        Sign out
      </button>
    </div>
  );

  if (variant === "mobile") {
    return (
      <>
        <button
          type="button"
          className="fms-v2-mobile-nav-item"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <UserCircle aria-hidden />
          <span>Account</span>
        </button>

        {open ? (
          <div className="fms-v2-account-sheet-layer">
            <button
              type="button"
              className="fms-v2-account-sheet-backdrop"
              onClick={() => setOpen(false)}
              aria-label="Close account menu"
            />
            {menu}
          </div>
        ) : null}
      </>
    );
  }

  return (
    <div className="fms-v2-account-menu-root" ref={rootRef}>
      <button
        type="button"
        className="fms-v2-account-trigger"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((current) => !current)}
      >
        <UserCircle aria-hidden />
        <span>Account</span>
      </button>
      {open ? menu : null}
    </div>
  );
}
