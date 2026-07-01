"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { Building2, Loader2, Pencil, Trash2 } from "lucide-react";
import { adminApiFetch } from "@/lib/admin-api-client";
import {
  compressImageFile,
  isCompressibleImageFile,
} from "@/lib/image-compression-client";

type AdminPropertyLogoProps = {
  propertyId: string;
  logoUrl: string | null;
  onLogoChange: (logoUrl: string | null) => void;
  variant?: "header" | "form";
  onMessage?: (message: string | null) => void;
};

export function AdminPropertyLogo({
  propertyId,
  logoUrl,
  onLogoChange,
  variant = "header",
  onMessage,
}: AdminPropertyLogoProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const isHeader = variant === "header";
  const sizeClass = isHeader
    ? "h-16 w-16 md:h-20 md:w-20"
    : "h-24 w-24";

  async function uploadLogo(file: File) {
    setUploading(true);
    onMessage?.(null);
    setMenuOpen(false);

    let uploadFile = file;
    if (isCompressibleImageFile(file)) {
      try {
        uploadFile = await compressImageFile(file, "logo");
      } catch (err) {
        onMessage?.(
          err instanceof Error ? err.message : "Could not prepare logo for upload."
        );
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
        return;
      }
    }

    const form = new FormData();
    form.append("file", uploadFile);

    try {
      const result = await adminApiFetch(`/api/admin/properties/${propertyId}/logo`, {
        method: "POST",
        body: form,
      });
      onLogoChange((result.logo_url as string) || null);
      onMessage?.("Logo updated.");
    } catch (err) {
      onMessage?.(err instanceof Error ? err.message : "Could not upload logo.");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function removeLogo() {
    if (!logoUrl) return;
    if (!window.confirm("Remove this property logo?")) return;

    setRemoving(true);
    onMessage?.(null);
    setMenuOpen(false);

    try {
      await adminApiFetch(`/api/admin/properties/${propertyId}/logo`, {
        method: "DELETE",
      });
      onLogoChange(null);
      onMessage?.("Logo removed.");
    } catch (err) {
      onMessage?.(err instanceof Error ? err.message : "Could not remove logo.");
    } finally {
      setRemoving(false);
    }
  }

  const busy = uploading || removing;

  return (
    <div className={isHeader ? "shrink-0" : "flex flex-col items-start gap-3"}>
      <div className={`group relative ${sizeClass}`}>
        <div
          className={`relative flex h-full w-full items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-white ${sizeClass}`}
        >
          {logoUrl ? (
            <Image
              src={logoUrl}
              alt="Property logo"
              fill
              className="object-contain p-1.5"
              unoptimized
            />
          ) : (
            <Building2 className="h-8 w-8 text-gray-300 md:h-9 md:w-9" aria-hidden />
          )}
          {busy ? (
            <div className="absolute inset-0 flex items-center justify-center bg-white/80">
              <Loader2 className="h-5 w-5 animate-spin text-[#0f2740]" aria-hidden />
            </div>
          ) : null}
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={() => setMenuOpen((open) => !open)}
          className="absolute -bottom-1 -right-1 inline-flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:opacity-60"
          aria-label={logoUrl ? "Edit property logo" : "Upload property logo"}
        >
          <Pencil className="h-3.5 w-3.5" aria-hidden />
        </button>

        {menuOpen && !busy ? (
          <>
            <button
              type="button"
              className="fixed inset-0 z-10 cursor-default"
              aria-label="Close logo menu"
              onClick={() => setMenuOpen(false)}
            />
            <div className="absolute left-0 top-full z-20 mt-1 min-w-[9rem] overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
              <button
                type="button"
                className="block w-full px-3 py-1.5 text-left text-xs text-gray-800 hover:bg-gray-50"
                onClick={() => fileInputRef.current?.click()}
              >
                {logoUrl ? "Replace logo" : "Upload logo"}
              </button>
              {logoUrl ? (
                <button
                  type="button"
                  className="block w-full px-3 py-1.5 text-left text-xs text-red-700 hover:bg-red-50"
                  onClick={() => void removeLogo()}
                >
                  Remove logo
                </button>
              ) : null}
            </div>
          </>
        ) : null}

        <input
          ref={fileInputRef}
          type="file"
          accept=".png,.jpg,.jpeg,.svg,image/png,image/jpeg,image/svg+xml"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void uploadLogo(file);
          }}
        />
      </div>

      {!isHeader ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => fileInputRef.current?.click()}
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-60"
          >
            {logoUrl ? "Replace logo" : "Upload logo"}
          </button>
          {logoUrl ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void removeLogo()}
              className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden />
              Remove
            </button>
          ) : null}
          <p className="text-xs text-gray-500">PNG, JPG, or SVG up to 4 MB.</p>
        </div>
      ) : null}
    </div>
  );
}

export function AdminPropertyBrandingSection({
  propertyId,
  logoUrl,
  onLogoChange,
  onMessage,
}: {
  propertyId: string;
  logoUrl: string | null;
  onLogoChange: (logoUrl: string | null) => void;
  onMessage?: (message: string | null) => void;
}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-900">Property branding</h2>
      <div className="mt-4">
        <p className="text-sm font-medium text-gray-700">Property logo</p>
        <p className="mt-0.5 text-sm text-gray-600">
          Brand identity shown in the property header. Separate from venue photos.
        </p>
        <div className="mt-3">
          <AdminPropertyLogo
            propertyId={propertyId}
            logoUrl={logoUrl}
            onLogoChange={onLogoChange}
            variant="form"
            onMessage={onMessage}
          />
        </div>
      </div>
    </section>
  );
}
