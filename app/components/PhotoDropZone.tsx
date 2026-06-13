"use client";

import { useRef, useState, type RefObject } from "react";
import { ImagePlus, Loader2, Upload } from "lucide-react";

export type PhotoDropZoneState = "default" | "dragging" | "uploading" | "error" | "success";

type PhotoDropZoneProps = {
  disabled?: boolean;
  uploading?: boolean;
  uploadProgress?: { current: number; total: number } | null;
  message?: string | null;
  messageTone?: "default" | "error" | "success";
  onFiles: (files: FileList) => void;
  inputRef?: RefObject<HTMLInputElement | null>;
  accept?: string;
  className?: string;
  showUploadButton?: boolean;
  uploadButtonLabel?: string;
};

export function PhotoDropZone({
  disabled = false,
  uploading = false,
  uploadProgress = null,
  message = null,
  messageTone = "default",
  onFiles,
  inputRef: externalInputRef,
  accept = "image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp",
  className = "",
  showUploadButton = true,
  uploadButtonLabel = "Upload photos",
}: PhotoDropZoneProps) {
  const internalInputRef = useRef<HTMLInputElement>(null);
  const inputRef = externalInputRef ?? internalInputRef;
  const [dragOver, setDragOver] = useState(false);

  const zoneState: PhotoDropZoneState = uploading
    ? "uploading"
    : messageTone === "error"
      ? "error"
      : messageTone === "success"
        ? "success"
        : dragOver
          ? "dragging"
          : "default";

  const zoneClass =
    zoneState === "dragging"
      ? "border-[#0f2740] bg-[#0f2740]/5 ring-2 ring-[#0f2740]/20"
      : zoneState === "uploading"
        ? "border-blue-300 bg-blue-50/60"
        : zoneState === "error"
          ? "border-red-300 bg-red-50/60"
          : zoneState === "success"
            ? "border-emerald-300 bg-emerald-50/60"
            : "border-gray-300 bg-gray-50 hover:border-gray-400 hover:bg-gray-100/80";

  function openFilePicker() {
    if (disabled || uploading) return;
    inputRef.current?.click();
  }

  function handleFiles(fileList: FileList | null) {
    if (!fileList?.length || disabled || uploading) return;
    onFiles(fileList);
  }

  return (
    <div className={className}>
      <div
        role="button"
        tabIndex={disabled || uploading ? -1 : 0}
        onClick={openFilePicker}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openFilePicker();
          }
        }}
        onDragEnter={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!disabled && !uploading) setDragOver(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!disabled && !uploading) setDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (e.currentTarget.contains(e.relatedTarget as Node)) return;
          setDragOver(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors ${zoneClass} ${
          disabled || uploading ? "cursor-not-allowed opacity-60" : ""
        }`}
        aria-disabled={disabled || uploading}
      >
        {uploading ? (
          <Loader2 className="mb-2 h-8 w-8 animate-spin text-blue-700" aria-hidden />
        ) : (
          <ImagePlus className="mb-2 h-8 w-8 text-gray-500" aria-hidden />
        )}
        <p className="text-sm font-medium text-gray-900">
          {uploading ? "Uploading photos…" : "Drop photos here to upload"}
        </p>
        <p className="mt-1 text-xs text-gray-600">
          {uploading && uploadProgress
            ? `${uploadProgress.current} of ${uploadProgress.total}`
            : "or click to choose files"}
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple
        className="hidden"
        tabIndex={-1}
        disabled={disabled || uploading}
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {message ? (
        <p
          className={`mt-2 text-sm ${
            messageTone === "error"
              ? "text-red-700"
              : messageTone === "success"
                ? "text-emerald-700"
                : "text-gray-600"
          }`}
        >
          {message}
        </p>
      ) : null}

      {showUploadButton ? (
        <button
          type="button"
          disabled={disabled || uploading}
          onClick={openFilePicker}
          className="mt-3 inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-60"
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Upload className="h-4 w-4" />
          )}
          {uploading && uploadProgress
            ? `Uploading ${uploadProgress.current} of ${uploadProgress.total}…`
            : uploadButtonLabel}
        </button>
      ) : null}
    </div>
  );
}
