"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

type CrmDesktopDrawerProps = {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  saving?: boolean;
  error?: string | null;
  success?: string | null;
  children: React.ReactNode;
  footer?: React.ReactNode;
  widthClass?: string;
};

export function CrmDesktopDrawer({
  open,
  title,
  subtitle,
  onClose,
  saving = false,
  error,
  success,
  children,
  footer,
  widthClass = "max-w-lg",
}: CrmDesktopDrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !saving) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, saving, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex justify-end bg-black/40"
      role="dialog"
      aria-modal="true"
      onClick={() => {
        if (!saving) onClose();
      }}
    >
      <div
        className={`flex h-full w-full ${widthClass} flex-col bg-white shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative shrink-0 border-b border-gray-200 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="absolute right-3 top-3 rounded-lg p-2 text-gray-500 hover:bg-gray-100 disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
          <h2 className="pr-10 text-lg font-semibold text-[#192a3a]">{title}</h2>
          {subtitle ? (
            <p className="mt-1 pr-10 text-sm text-gray-500">{subtitle}</p>
          ) : null}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

        <div className="shrink-0 space-y-2 border-t border-gray-200 px-5 py-4">
          {error ? (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          ) : null}
          {success ? (
            <p className="text-sm font-medium text-emerald-700" role="status">
              {success}
            </p>
          ) : null}
          {footer}
        </div>
      </div>
    </div>
  );
}
