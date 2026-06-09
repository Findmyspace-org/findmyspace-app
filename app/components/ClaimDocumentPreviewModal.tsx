"use client";

import { FileText, X } from "lucide-react";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  fileName?: string | null;
  previewUrl: string | null;
  mimeHint?: "image" | "pdf" | "unknown";
};

function inferMime(url: string, fileName?: string | null): "image" | "pdf" | "unknown" {
  const lower = (fileName || url).toLowerCase();
  if (/\.(jpe?g|png|gif|webp|bmp|svg)(\?|$)/i.test(lower)) return "image";
  if (/\.pdf(\?|$)/i.test(lower)) return "pdf";
  return "unknown";
}

export function ClaimDocumentPreviewModal({
  open,
  onClose,
  title,
  fileName,
  previewUrl,
  mimeHint,
}: Props) {
  if (!open || !previewUrl) return null;

  const mime = mimeHint || inferMime(previewUrl, fileName);
  const isImage = mime === "image";
  const isPdf = mime === "pdf";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate font-medium text-gray-900">{title}</p>
            {fileName ? (
              <p className="truncate text-xs text-gray-500">{fileName}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
            aria-label="Close preview"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex min-h-[240px] flex-1 items-center justify-center overflow-auto bg-gray-50 p-4">
          {isImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt={title}
              className="max-h-[70vh] w-auto max-w-full rounded-md object-contain"
            />
          ) : isPdf ? (
            <iframe
              src={previewUrl}
              title={title}
              className="h-[70vh] w-full rounded-md border border-gray-200 bg-white"
            />
          ) : (
            <div className="flex flex-col items-center gap-3 text-center text-gray-600">
              <FileText className="h-12 w-12 text-gray-400" />
              <p className="text-sm">Preview not available for this file type.</p>
              <a
                href={previewUrl}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-medium text-[#0f2740] underline"
              >
                Open file
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
