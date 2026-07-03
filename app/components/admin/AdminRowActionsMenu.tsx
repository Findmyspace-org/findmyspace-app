"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";

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
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={rootRef} className="relative inline-block text-left">
      <button
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
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-1 min-w-[11rem] overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
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
        </div>
      ) : null}
    </div>
  );
}
