"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";

export type AdminInlineSelectOption<T extends string> = {
  value: T;
  label: string;
  disabled?: boolean;
  hint?: string;
};

type AdminInlineSelectProps<T extends string> = {
  value: T;
  displayLabel: string;
  pillClass: string;
  options: AdminInlineSelectOption<T>[];
  disabled?: boolean;
  loading?: boolean;
  onSelect: (value: T) => void;
};

export function AdminInlineSelect<T extends string>({
  value,
  displayLabel,
  pillClass,
  options,
  disabled,
  loading,
  onSelect,
}: AdminInlineSelectProps<T>) {
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
    <div ref={rootRef} className="relative inline-block max-w-full">
      <button
        type="button"
        disabled={disabled || loading}
        onClick={() => setOpen((current) => !current)}
        className={`inline-flex max-w-full items-center gap-1 rounded-full transition-opacity disabled:cursor-not-allowed disabled:opacity-60 ${pillClass}`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {loading ? <Loader2 className="h-3 w-3 shrink-0 animate-spin" aria-hidden /> : null}
        <span className="truncate">{displayLabel}</span>
        <ChevronDown className="h-3 w-3 shrink-0 opacity-60" aria-hidden />
      </button>
      {open ? (
        <ul
          role="listbox"
          className="absolute left-0 z-30 mt-1 max-h-64 min-w-[10rem] overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg"
        >
          {options.map((option) => (
            <li key={option.value} role="option" aria-selected={option.value === value}>
              <button
                type="button"
                disabled={option.disabled}
                className={`block w-full px-3 py-1.5 text-left text-xs disabled:cursor-not-allowed disabled:opacity-50 ${
                  option.value === value
                    ? "font-semibold text-[#0f2740]"
                    : "text-gray-700 hover:bg-gray-50"
                }`}
                title={option.hint}
                onClick={() => {
                  if (option.disabled) return;
                  setOpen(false);
                  if (option.value !== value) onSelect(option.value);
                }}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
