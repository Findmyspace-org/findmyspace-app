"use client";

import Image from "next/image";
import { useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Star, Trash2 } from "lucide-react";
import { adminApiFetch } from "@/lib/admin-api-client";
import { ADMIN_SPACE_IMAGE_MAX_BYTES } from "@/lib/admin-space-image-upload";
import { normalizeSpaceImages, sortSpaceImages } from "@/lib/sort-space-images";
import { PhotoDropZone } from "@/app/components/PhotoDropZone";

export type AdminSpaceImage = {
  id: string;
  image_url: string;
  sort_order: number | null;
};

type AdminSpacePhotosPanelProps = {
  spaceId?: string;
  images: AdminSpaceImage[];
  onImagesChange: (images: AdminSpaceImage[]) => void;
  readOnly?: boolean;
  onMessage?: (message: string | null) => void;
  compact?: boolean;
};

export function AdminSpacePhotosPanel({
  spaceId,
  images,
  onImagesChange,
  readOnly = false,
  onMessage,
  compact = false,
}: AdminSpacePhotosPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [reordering, setReordering] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [dropMessage, setDropMessage] = useState<string | null>(null);
  const [dropMessageTone, setDropMessageTone] = useState<
    "default" | "error" | "success"
  >("default");

  const sortedImages = useMemo(() => sortSpaceImages(images), [images]);

  async function persistImageOrder(ordered: AdminSpaceImage[]) {
    if (!spaceId) return;
    const imageIds = ordered.map((img) => img.id);
    await adminApiFetch(`/api/admin/spaces/${spaceId}/images/reorder`, {
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
    if (readOnly || !spaceId || reordering) return;
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
    if (readOnly || !spaceId || !fileList?.length) return;

    const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
    const allowedExt = new Set(["jpg", "jpeg", "png", "webp"]);
    const maxMb = (ADMIN_SPACE_IMAGE_MAX_BYTES / (1024 * 1024)).toFixed(0);
    const files = Array.from(fileList);

    for (const file of files) {
      const ext = (file.name.split(".").pop() || "").toLowerCase();
      if (!allowed.has(file.type) && !allowedExt.has(ext)) {
        const msg = `Invalid file type "${file.name}". Use JPG, PNG, or WebP only.`;
        onMessage?.(msg);
        setDropMessage(msg);
        setDropMessageTone("error");
        return;
      }
      if (file.size > ADMIN_SPACE_IMAGE_MAX_BYTES) {
        const msg = `"${file.name}" is too large. Maximum size is ${maxMb} MB per image.`;
        onMessage?.(msg);
        setDropMessage(msg);
        setDropMessageTone("error");
        return;
      }
    }

    setUploading(true);
    setDropMessage(null);
    setDropMessageTone("default");
    onMessage?.(null);
    const added: AdminSpaceImage[] = [];
    const failed: string[] = [];

    for (let i = 0; i < files.length; i++) {
      setUploadProgress({ current: i + 1, total: files.length });
      const file = files[i];
      try {
        const form = new FormData();
        form.append("files", file);
        const result = await adminApiFetch(`/api/admin/spaces/${spaceId}/images`, {
          method: "POST",
          body: form,
        });
        const uploaded = normalizeSpaceImages(result.images);
        added.push(...uploaded);
        const batchFailed = (result.failed as { name: string; error: string }[]) || [];
        for (const f of batchFailed) {
          failed.push(`${f.name}: ${f.error}`);
        }
      } catch (err) {
        failed.push(
          `${file.name}: ${err instanceof Error ? err.message : "Upload failed."}`
        );
      }
    }

    if (added.length > 0) {
      onImagesChange(sortSpaceImages([...images, ...added]));
    }

    if (failed.length === 0) {
      const successMsg = `${added.length} photo(s) uploaded.`;
      onMessage?.(successMsg);
      setDropMessage(successMsg);
      setDropMessageTone("success");
    } else if (added.length > 0) {
      const partialMsg = `${added.length} uploaded, ${failed.length} failed: ${failed.join("; ")}`;
      onMessage?.(partialMsg);
      setDropMessage(partialMsg);
      setDropMessageTone("error");
    } else {
      const failMsg = `Upload failed: ${failed.join("; ")}`;
      onMessage?.(failMsg);
      setDropMessage(failMsg);
      setDropMessageTone("error");
    }

    setUploading(false);
    setUploadProgress(null);
  }

  async function removeImage(imageId: string) {
    if (readOnly || !spaceId) return;
    setDeletingId(imageId);
    onMessage?.(null);
    try {
      await adminApiFetch(`/api/admin/spaces/${spaceId}/images`, {
        method: "DELETE",
        body: JSON.stringify({ imageId }),
      });
      const remaining = sortSpaceImages(images.filter((img) => img.id !== imageId));
      if (remaining.length > 0) {
        await persistImageOrder(remaining);
      } else {
        onImagesChange([]);
      }
      setConfirmDeleteId(null);
      onMessage?.("Photo removed.");
    } catch (err) {
      onMessage?.(err instanceof Error ? err.message : "Could not remove image.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div>
      {!compact ? (
        <p className="mt-1 text-sm text-gray-600">
          First photo is the cover image. Use up/down to reorder.
        </p>
      ) : null}
      {!spaceId && !readOnly ? (
        <p className="mt-2 text-sm text-amber-800">
          Save the space first to upload photos.
        </p>
      ) : null}
      {spaceId && sortedImages.length === 0 ? (
        <p className="mt-3 text-sm text-gray-500">No photos yet.</p>
      ) : spaceId ? (
        <div className={`space-y-3 ${compact ? "mt-2" : "mt-4"}`}>
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
                {index === 0 ? (
                  <span className="absolute left-1 top-1 inline-flex items-center gap-0.5 rounded bg-[#0f2740] px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    <Star className="h-2.5 w-2.5" />
                    Cover
                  </span>
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-600">
                  {index === 0 ? "Cover image" : `Photo ${index + 1}`}
                </p>
              </div>
              {!readOnly ? (
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
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {!readOnly ? (
        <PhotoDropZone
          className="mt-4"
          disabled={!spaceId || reordering}
          uploading={uploading}
          uploadProgress={uploadProgress}
          message={
            !spaceId
              ? "Save the space first to upload photos."
              : dropMessage
          }
          messageTone={!spaceId ? "default" : dropMessageTone}
          inputRef={fileInputRef}
          onFiles={(files) => void uploadImages(files)}
        />
      ) : null}
    </div>
  );
}
