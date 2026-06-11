"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, FileText, FileUp, ImageIcon, X } from "lucide-react";
import { ClaimDocumentPreviewModal } from "@/app/components/ClaimDocumentPreviewModal";

type FileUploadFieldProps = {
  label: string;
  accept?: string;
  selectedFile: File | null;
  /** Shown when no new file selected (e.g. "Already uploaded" or "Not uploaded yet"). */
  statusHint: string;
  uploadedLabel?: string;
  hasUploaded?: boolean;
  previewUrl?: string | null;
  uploadedFileName?: string | null;
  onFileChange: (file: File | null) => void;
  disabled?: boolean;
};

function inferMimeFromName(
  fileName: string | null | undefined
): "image" | "pdf" | "unknown" {
  const lower = (fileName || "").toLowerCase();
  if (/\.(jpe?g|png|gif|webp|bmp|svg)(\?|$)/i.test(lower)) return "image";
  if (/\.pdf(\?|$)/i.test(lower)) return "pdf";
  return "unknown";
}

export default function FileUploadField({
  label,
  accept = "image/*,.pdf",
  selectedFile,
  statusHint,
  uploadedLabel,
  hasUploaded = false,
  previewUrl,
  uploadedFileName,
  onFileChange,
  disabled,
}: FileUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [localPreviewUrl, setLocalPreviewUrl] = useState<string | null>(null);
  const [remotePreviewBroken, setRemotePreviewBroken] = useState(false);

  const displayName = selectedFile?.name || uploadedFileName || null;
  const showConfirmedState = hasUploaded && !selectedFile;
  const effectivePreviewUrl = localPreviewUrl || previewUrl || null;
  const mimeHint =
    selectedFile?.type === "application/pdf"
      ? "pdf"
      : selectedFile?.type.startsWith("image/")
        ? "image"
        : inferMimeFromName(displayName);
  const showImagePreview =
    effectivePreviewUrl &&
    !remotePreviewBroken &&
    mimeHint === "image";

  useEffect(() => {
    setRemotePreviewBroken(false);
  }, [previewUrl, uploadedFileName]);

  useEffect(() => {
    if (!selectedFile || !selectedFile.type.startsWith("image/")) {
      setLocalPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(selectedFile);
    setLocalPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedFile]);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragging(true);
    } else if (e.type === "dragleave") {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      if (disabled) return;
      const f = e.dataTransfer.files?.[0];
      if (f) onFileChange(f);
    },
    [disabled, onFileChange]
  );

  function renderPreviewThumb(className: string) {
    if (showImagePreview) {
      return (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setLightboxOpen(true);
          }}
          className={`shrink-0 overflow-hidden rounded-md border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#192a3a]/30 ${className}`}
          aria-label={`View ${label}`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={effectivePreviewUrl!}
            alt={`${label} preview`}
            className="h-full w-full object-cover"
            onError={() => setRemotePreviewBroken(true)}
          />
        </button>
      );
    }

    if (mimeHint === "pdf") {
      return (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (effectivePreviewUrl) setLightboxOpen(true);
          }}
          className={`inline-flex shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white ${className}`}
          aria-label={`View ${label}`}
        >
          <FileText className="h-8 w-8 text-[#0f2740]" />
        </button>
      );
    }

    if (showConfirmedState) {
      return (
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <CheckCircle2 className="h-5 w-5" aria-hidden />
        </span>
      );
    }

    return <ImageIcon className="h-8 w-8 text-gray-400" />;
  }

  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-[#192a3a]">{label}</label>
      <div
        role={showConfirmedState ? undefined : "button"}
        tabIndex={showConfirmedState ? -1 : 0}
        onKeyDown={(e) => {
          if (showConfirmedState) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onClick={() => {
          if (showConfirmedState) return;
          if (!disabled) inputRef.current?.click();
        }}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        className={[
          "relative flex min-h-[112px] flex-col items-center justify-center gap-2 rounded-lg px-4 py-4 text-center transition-all duration-200 ease-out",
          showConfirmedState
            ? "border border-emerald-200 bg-emerald-50/40"
            : "cursor-pointer border-2 border-dashed",
          disabled
            ? "cursor-not-allowed border-gray-200 bg-gray-50 opacity-70"
            : isDragging
              ? "border-[#192a3a] bg-[#192a3a]/5"
              : "border-gray-300 bg-gray-50/50 hover:border-gray-400 hover:bg-gray-50",
        ].join(" ")}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          disabled={disabled}
          className="sr-only"
          onChange={(e) => onFileChange(e.target.files?.[0] || null)}
        />
        {showConfirmedState ? (
          <div className="flex w-full items-center gap-3 text-left">
            <div className="h-12 w-12">{renderPreviewThumb("h-12 w-12")}</div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-emerald-800">
                {uploadedLabel || "Uploaded"}
              </p>
              <p className="mt-0.5 text-xs text-emerald-700">{statusHint}</p>
              {displayName ? (
                <p className="mt-0.5 truncate text-xs text-emerald-700">{displayName}</p>
              ) : null}
            </div>
            <button
              type="button"
              disabled={disabled}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                inputRef.current?.click();
              }}
              className="shrink-0 text-xs font-medium text-[#192a3a] underline underline-offset-2 disabled:opacity-50"
            >
              Replace
            </button>
            {effectivePreviewUrl ? (
              <button
                type="button"
                disabled={disabled}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setLightboxOpen(true);
                }}
                className="shrink-0 text-xs font-medium text-[#192a3a] underline underline-offset-2 disabled:opacity-50"
              >
                View
              </button>
            ) : null}
          </div>
        ) : (
          <>
            {effectivePreviewUrl && mimeHint === "image" && !remotePreviewBroken ? (
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setLightboxOpen(true);
                }}
                className="rounded-md border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#192a3a]/30"
                aria-label={`Preview ${label}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={effectivePreviewUrl}
                  alt={`${label} preview`}
                  className="h-16 w-16 rounded-md object-cover"
                  onError={() => setRemotePreviewBroken(true)}
                />
              </button>
            ) : selectedFile && mimeHint === "pdf" ? (
              <FileText className="h-8 w-8 text-[#0f2740]" aria-hidden />
            ) : (
              <FileUp className="h-5 w-5 text-gray-400" aria-hidden />
            )}
            <span className="text-sm text-gray-600">
              {displayName ? (
                <span className="font-medium text-[#192a3a]">{displayName}</span>
              ) : (
                <>Drop a file here or click to browse</>
              )}
            </span>
            <span className="text-xs text-gray-500">{statusHint}</span>
          </>
        )}
      </div>

      <ClaimDocumentPreviewModal
        open={lightboxOpen}
        onClose={() => setLightboxOpen(false)}
        title={label}
        fileName={displayName}
        previewUrl={effectivePreviewUrl}
        mimeHint={mimeHint}
      />
    </div>
  );
}
