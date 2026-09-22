"use client";

import { useEffect, useRef } from "react";
import { FileText, X } from "lucide-react";
import { proofPreviewKind } from "@/lib/organisation-verification-console";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  previewUrl: string | null;
  fileName?: string | null;
  contentType?: string | null;
};

export function OrganisationProofPreviewModal({
  open,
  onClose,
  title,
  previewUrl,
  fileName,
  contentType,
}: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previousFocus.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  const kind = proofPreviewKind(previewUrl || fileName, contentType);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="relative flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-md bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="organisation-proof-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h3
            id="organisation-proof-title"
            className="truncate text-sm font-semibold text-[#192a3a]"
          >
            {title}
          </h3>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-[#192a3a] hover:bg-gray-50"
            aria-label="Close proof preview"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-1 items-center justify-center overflow-auto bg-gray-100 p-4">
          {!previewUrl ? (
            <p className="text-sm text-gray-600">
              This proof could not be loaded. The secure link may have expired — close and try
              again.
            </p>
          ) : kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt={title}
              className="max-h-full max-w-full object-contain"
            />
          ) : kind === "pdf" ? (
            <iframe
              src={previewUrl}
              title={title}
              className="h-full w-full rounded-sm bg-white"
            />
          ) : (
            <div className="flex flex-col items-center gap-3 text-center text-gray-600">
              <FileText className="h-12 w-12 text-gray-400" />
              <p className="text-sm">Preview is not available for this file type.</p>
              <a
                href={previewUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-medium text-[#192a3a] underline"
              >
                Open full size
              </a>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-gray-200 px-4 py-3">
          {previewUrl ? (
            <a
              href={previewUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-[#192a3a] hover:bg-gray-50"
            >
              Open full size
            </a>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-[#192a3a] hover:bg-gray-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
