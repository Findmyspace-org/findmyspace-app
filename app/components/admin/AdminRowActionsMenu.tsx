"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Loader2 } from "lucide-react";
import {
  computeFixedMenuPosition,
  estimateMenuHeight,
} from "@/lib/fixed-menu-position";

export type AdminRowAction = {
  key: string;
  label: string;
  onClick?: () => void;
  href?: string;
  external?: boolean;
  disabled?: boolean;
  destructive?: boolean;
};

type AdminRowActionsMenuProps = {
  label?: string;
  actions: AdminRowAction[];
  loading?: boolean;
};

export function AdminRowActionsMenu({
  label = "Actions",
  actions,
  loading,
}: AdminRowActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(
    null
  );
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return;
    }

    function updatePosition() {
      const button = buttonRef.current;
      if (!button) return;
      const btn = button.getBoundingClientRect();
      const measured = menuRef.current?.getBoundingClientRect();
      const menu = {
        width: Math.max(measured?.width || 176, 176),
        height: measured?.height || estimateMenuHeight(actions.length),
      };
      const next = computeFixedMenuPosition({
        button: { top: btn.top, right: btn.right, bottom: btn.bottom },
        menu,
        viewport: { width: window.innerWidth, height: window.innerHeight },
      });
      setCoords({ top: next.top, left: next.left });
    }

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, actions.length]);

  useEffect(() => {
    if (!open) return;
    function handlePointer(event: MouseEvent) {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  const menu =
    open && mounted
      ? createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{
              position: "fixed",
              top: coords?.top ?? 0,
              left: coords?.left ?? 0,
              visibility: coords ? "visible" : "hidden",
            }}
            className="z-[400] min-w-[11rem] overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
          >
            {actions.map((action) => {
              const className = `block w-full px-3 py-2 text-left text-xs ${
                action.disabled
                  ? "cursor-not-allowed text-gray-400"
                  : action.destructive
                    ? "text-red-700 hover:bg-red-50"
                    : "text-gray-800 hover:bg-gray-50"
              }`;

              if (action.href && !action.disabled) {
                return (
                  <a
                    key={action.key}
                    role="menuitem"
                    href={action.href}
                    target={action.external ? "_blank" : undefined}
                    rel={action.external ? "noopener noreferrer" : undefined}
                    className={className}
                    onClick={() => setOpen(false)}
                  >
                    {action.label}
                  </a>
                );
              }

              return (
                <button
                  key={action.key}
                  type="button"
                  role="menuitem"
                  disabled={action.disabled}
                  className={className}
                  onClick={() => {
                    if (action.disabled) return;
                    setOpen(false);
                    action.onClick?.();
                  }}
                >
                  {action.label}
                </button>
              );
            })}
          </div>,
          document.body
        )
      : null;

  return (
    <div className="relative inline-block text-left">
      <button
        ref={buttonRef}
        type="button"
        disabled={loading}
        onClick={() => setOpen((current) => !current)}
        className="inline-flex items-center gap-1 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        {label}
        <ChevronDown className="h-3.5 w-3.5 opacity-60" />
      </button>
      {menu}
    </div>
  );
}
