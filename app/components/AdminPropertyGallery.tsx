"use client";

import Image from "next/image";
import { useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Loader2, Trash2, Upload } from "lucide-react";
import { adminApiFetch } from "@/lib/admin-api-client";
import { ADMIN_SPACE_IMAGE_MAX_BYTES } from "@/lib/admin-space-image-upload";

export type PropertyGalleryImage = {
  id: string;
  image_url: string;
  sort_order: number;
  caption: string | null;
};

type AdminPropertyGalleryProps = {
  propertyId: string;
  images: PropertyGalleryImage[];
  onImagesChange: (images: PropertyGalleryImage[]) => void;
  onMessage?: (message: string | null) => void;
};

function sortImages(images: PropertyGalleryImage[]): PropertyGalleryImage[] {
  return [...images].sort((a, b) => a.sort_order - b.sort_order);
}

export function AdminPropertyGallery({
  propertyId,
  images,
  onImagesChange,
  onMessage,
}: AdminPropertyGalleryProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const sortedImages = useMemo(() => sortImages(images), [images]);

  async function persistImageOrder(ordered: PropertyGalleryImage[]) {
    const imageIds = ordered.map((img) => img.id);
    await adminApiFetch(`/api/admin/properties/${propertyId}/images/reorder`, {
      method: "PATCH",
      body: JSON.stringify({ imageIds }),
    });
    onImagesChange(
      ordered.map((img, index) => ({
        ...img,
        sort_order: index,
      }))
    );
  }

  async function moveImage(imageId: string, direction: -1 | 1) {
    const index = sortedImages.findIndex((img) => img.id === imageId);
    if (index < 0) return;
    const target = index + direction;
    if (target < 0 || target >= sortedImages.length) return;

    const next = [...sortedImages];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);

    setReordering(true);
    onMessage?.(null);
    try {
      await persistImageOrder(next);
    } catch (err) {
      onMessage?.(err instanceof Error ? err.message : "Could not reorder photos.");
    } finally {
      setReordering(false);
    }
  }

  async function uploadImages(fileList: FileList | null) {
    if (!fileList?.length) return;

    const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
    const allowedExt = new Set(["jpg", "jpeg", "png", "webp"]);
    const maxMb = (ADMIN_SPACE_IMAGE_MAX_BYTES / (1024 * 1024)).toFixed(0);
    const files = Array.from(fileList);

    for (const file of files) {
      const ext = (file.name.split(".").pop() || "").toLowerCase();
      if (!allowed.has(file.type) && !allowedExt.has(ext)) {
        onMessage?.(`Invalid file type "${file.name}". Use JPG, PNG, or WebP only.`);
        return;
      }
      if (file.size > ADMIN_SPACE_IMAGE_MAX_BYTES) {
        onMessage?.(`"${file.name}" is too large. Maximum size is ${maxMb} MB per image.`);
        return;
      }
    }

    setUploading(true);
    onMessage?.(null);
    const added: PropertyGalleryImage[] = [];
    const failed: string[] = [];

    for (const file of files) {
      try {
        const form = new FormData();
        form.append("files", file);
        const result = await adminApiFetch(
          `/api/admin/properties/${propertyId}/images`,
          {
            method: "POST",
            body: form,
          }
        );
        const uploaded = ((result.images as PropertyGalleryImage[]) || []).map(
          (img, index) => ({
            ...img,
            caption: null,
            sort_order: img.sort_order ?? index,
          })
        );
        added.push(...uploaded);
        const batchFailed = (result.failed as { name: string; error: string }[]) || [];
        for (const item of batchFailed) {
          failed.push(`${item.name}: ${item.error}`);
        }
      } catch (err) {
        failed.push(
          `${file.name}: ${err instanceof Error ? err.message : "Upload failed."}`
        );
      }
    }

    if (added.length > 0) {
      onImagesChange(sortImages([...images, ...added]));
    }

    if (failed.length === 0) {
      onMessage?.(`${added.length} photo(s) uploaded.`);
    } else if (added.length > 0) {
      onMessage?.(
        `${added.length} uploaded, ${failed.length} failed: ${failed.join("; ")}`
      );
    } else {
      onMessage?.(`Upload failed: ${failed.join("; ")}`);
    }

    setUploading(false);
  }

  async function removeImage(imageId: string) {
    setDeletingId(imageId);
    onMessage?.(null);
    try {
      await adminApiFetch(`/api/admin/properties/${propertyId}/images`, {
        method: "DELETE",
        body: JSON.stringify({ imageId }),
      });
      const remaining = sortImages(images.filter((img) => img.id !== imageId));
      if (remaining.length > 0) {
        await persistImageOrder(remaining);
      } else {
        onImagesChange([]);
      }
      setConfirmDeleteId(null);
      onMessage?.("Photo removed.");
    } catch (err) {
      onMessage?.(err instanceof Error ? err.message : "Could not remove photo.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-900">Property gallery</h2>
      <p className="mt-1 text-sm text-gray-600">
        Venue-level photos such as entrance, parking, and reception. Separate from
        individual space photos.
      </p>

      {sortedImages.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500">No property photos yet.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {sortedImages.map((img, index) => (
            <div
              key={img.id}
              className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 p-2"
            >
              <div className="relative h-20 w-28 shrink-0 overflow-hidden rounded-md border border-gray-200 bg-white">
                <Image
                  src={img.image_url}
                  alt=""
                  fill
                  className="object-cover"
                  unoptimized
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-600">Photo {index + 1}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  disabled={index === 0 || reordering || uploading}
                  onClick={() => void moveImage(img.id, -1)}
                  className="rounded border border-gray-300 bg-white p-1.5 text-gray-700 disabled:opacity-40"
                  aria-label="Move photo up"
                >
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  disabled={
                    index === sortedImages.length - 1 || reordering || uploading
                  }
                  onClick={() => void moveImage(img.id, 1)}
                  className="rounded border border-gray-300 bg-white p-1.5 text-gray-700 disabled:opacity-40"
                  aria-label="Move photo down"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
                {confirmDeleteId === img.id ? (
                  <div className="ml-1 flex items-center gap-1">
                    <button
                      type="button"
                      disabled={deletingId === img.id}
                      onClick={() => void removeImage(img.id)}
                      className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-60"
                    >
                      {deletingId === img.id ? "…" : "Delete"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(null)}
                      className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteId(img.id)}
                    className="rounded border border-gray-300 bg-white p-1.5 text-red-600"
                    aria-label="Remove photo"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
        multiple
        className="hidden"
        tabIndex={-1}
        disabled={uploading || reordering}
        onChange={(e) => {
          void uploadImages(e.target.files);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        disabled={uploading || reordering}
        onClick={() => fileInputRef.current?.click()}
        className="mt-4 inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-100 disabled:opacity-60"
      >
        {uploading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Upload className="h-4 w-4" />
        )}
        {uploading ? "Uploading…" : "Upload photos"}
      </button>
    </section>
  );
}
