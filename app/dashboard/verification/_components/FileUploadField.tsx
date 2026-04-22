"use client";

import { useCallback, useRef, useState } from "react";
import { CheckCircle2, FileUp } from "lucide-react";

type FileUploadFieldProps = {
  label: string;
  accept?: string;
  selectedFile: File | null;
  /** Shown when no new file selected (e.g. "Already uploaded" or "Not uploaded yet"). */
  statusHint: string;
  uploadedLabel?: string;
  hasUploaded?: boolean;
  previewUrl?: string | null;
  onFileChange: (file: File | null) => void;
  disabled?: boolean;
};

export default function FileUploadField({
  label,
  accept = "image/*,.pdf",
  selectedFile,
  statusHint,
  uploadedLabel,
  hasUploaded = false,
  previewUrl,
  onFileChange,
  disabled,
}: FileUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const displayName = selectedFile?.name || null;
  const showConfirmedState = hasUploaded && !selectedFile;

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
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt={`${label} preview`}
                className="h-12 w-12 shrink-0 rounded-md border border-emerald-200 object-cover"
              />
            ) : (
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <CheckCircle2 className="h-5 w-5" aria-hidden />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-emerald-800">
                {uploadedLabel || "Uploaded"}
              </p>
              <p className="mt-0.5 text-xs text-emerald-700">{statusHint}</p>
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
          </div>
        ) : (
          <>
            <FileUp className="h-5 w-5 text-gray-400" aria-hidden />
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
    </div>
  );
}
