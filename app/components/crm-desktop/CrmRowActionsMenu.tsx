"use client";

import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import { useState } from "react";

export type CrmRowAction = {
  label: string;
  href?: string;
  onClick?: () => void;
  destructive?: boolean;
};

export function CrmRowActionsMenu({ actions }: { actions: CrmRowAction[] }) {
  const [open, setOpen] = useState(false);

  if (!actions.length) return null;

  return (
    <div className="relative inline-block text-left">
      <button
        type="button"
        className="rounded-md border border-gray-200 p-1.5 text-gray-600 hover:bg-gray-50"
        onClick={() => setOpen((v) => !v)}
        aria-label="Actions"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-10"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 z-20 mt-1 w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
            {actions.map((action) =>
              action.href ? (
                <Link
                  key={action.label}
                  href={action.href}
                  className={`block px-3 py-2 text-sm hover:bg-gray-50 ${
                    action.destructive ? "text-red-700" : "text-gray-800"
                  }`}
                  onClick={() => setOpen(false)}
                >
                  {action.label}
                </Link>
              ) : (
                <button
                  key={action.label}
                  type="button"
                  className={`block w-full px-3 py-2 text-left text-sm hover:bg-gray-50 ${
                    action.destructive ? "text-red-700" : "text-gray-800"
                  }`}
                  onClick={() => {
                    setOpen(false);
                    action.onClick?.();
                  }}
                >
                  {action.label}
                </button>
              )
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
