"use client";

import { useCallback, useRef, useState } from "react";
import { FileUp } from "lucide-react";

type FileUploadFieldProps = {
  label: string;
  accept?: string;
  selectedFile: File | null;
  /** Shown when no new file selected (e.g. "Already uploaded" or "Not uploaded yet"). */
  statusHint: string;
  onFileChange: (file: File | null) => void;
  disabled?: boolean;
};

export default function FileUploadField({
  label,
  accept = "image/*,.pdf",
  selectedFile,
  statusHint,
  onFileChange,
  disabled,
}: FileUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const displayName = selectedFile?.name || null;

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
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onClick={() => !disabled && inputRef.current?.click()}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        className={[
          "relative flex min-h-[112px] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-4 text-center transition-colors",
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
        <FileUp className="h-5 w-5 text-gray-400" aria-hidden />
        <span className="text-sm text-gray-600">
          {displayName ? (
            <span className="font-medium text-[#192a3a]">{displayName}</span>
          ) : (
            <>Drop a file here or click to browse</>
          )}
        </span>
        <span className="text-xs text-gray-500">{statusHint}</span>
      </div>
    </div>
  );
}
