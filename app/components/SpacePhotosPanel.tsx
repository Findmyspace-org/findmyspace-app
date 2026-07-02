"use client";

import Image from "next/image";
import { useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Star, Trash2 } from "lucide-react";
import { ADMIN_SPACE_IMAGE_MAX_BYTES } from "@/lib/admin-space-image-upload";
import { prepareFilesForUpload } from "@/lib/image-compression-client";
import {
  deleteSpacePhoto,
  reorderSpacePhotos,
  uploadSpacePhotos,
  type SpacePhotoImage,
  type SpacePhotosApiMode,
} from "@/lib/space-photos-client";
import { sortSpaceImages } from "@/lib/sort-space-images";
import { PhotoDropZone } from "@/app/components/PhotoDropZone";
import { SectionInlineAlert } from "@/app/components/SectionInlineAlert";
import { sanitizeSectionMessage, useSectionFeedback } from "@/lib/use-section-feedback";

export type { SpacePhotoImage };

type SpacePhotosPanelProps = {
  spaceId?: string;
  images: SpacePhotoImage[];
  onImagesChange: (images: SpacePhotoImage[]) => void;
  readOnly?: boolean;
  compact?: boolean;
  apiMode?: SpacePhotosApiMode;
};

export function SpacePhotosPanel({
  spaceId,
  images,
  onImagesChange,
  readOnly = false,
  compact = false,
  apiMode = "admin",
}: SpacePhotosPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadInFlightRef = useRef(false);
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
  const { status, error, setSuccess, setFailure, clearForAction } = useSectionFeedback();

  const sortedImages = useMemo(() => sortSpaceImages(images), [images]);

  async function persistImageOrder(ordered: SpacePhotoImage[]) {
    if (!spaceId) return;
    await reorderSpacePhotos(apiMode, spaceId, ordered);
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
    clearForAction();
    try {
      await persistImageOrder(next);
      setSuccess("Photo order updated.");
    } catch (err) {
      console.error("Photo reorder failed:", err);
      setFailure(err instanceof Error ? err.message : "Could not reorder photos.");
    } finally {
      setReordering(false);
    }
  }

  async function uploadImages(fileList: FileList | null) {
    if (readOnly || !spaceId || !fileList?.length || uploadInFlightRef.current) return;

    uploadInFlightRef.current = true;
    setUploading(true);
    setDropMessage(null);
    setDropMessageTone("default");
    clearForAction();

    const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
    const allowedExt = new Set(["jpg", "jpeg", "png", "webp"]);
    const maxMb = (ADMIN_SPACE_IMAGE_MAX_BYTES / (1024 * 1024)).toFixed(0);
    const files = Array.from(fileList);

    try {
      for (const file of files) {
        const ext = (file.name.split(".").pop() || "").toLowerCase();
        if (!allowed.has(file.type) && !allowedExt.has(ext)) {
          const msg = `Invalid file type "${file.name}". Use JPG, PNG, or WebP only.`;
          setDropMessage(msg);
          setDropMessageTone("error");
          setFailure(msg);
          return;
        }
      }

      let prepared: File[];
      try {
        prepared = await prepareFilesForUpload(files, "listing");
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Could not prepare images for upload.";
        setDropMessage(msg);
        setDropMessageTone("error");
        setFailure(msg);
        return;
      }

      for (const file of prepared) {
        if (file.size > ADMIN_SPACE_IMAGE_MAX_BYTES) {
          const msg = `"${file.name}" is too large. Maximum size is ${maxMb} MB per image.`;
          setDropMessage(msg);
          setDropMessageTone("error");
          setFailure(msg);
          return;
        }
      }

      const failed: string[] = [];
      let added: SpacePhotoImage[] = [];

      if (apiMode === "admin") {
        for (let i = 0; i < prepared.length; i++) {
          setUploadProgress({ current: i + 1, total: prepared.length });
          const result = await uploadSpacePhotos(apiMode, spaceId, [prepared[i]], images);
          added = [...added, ...result.added];
          failed.push(...result.failed);
        }
      } else {
        setUploadProgress({ current: 1, total: prepared.length });
        const result = await uploadSpacePhotos(apiMode, spaceId, prepared, images);
        added = result.added;
        failed.push(...result.failed);
      }

      if (added.length > 0) {
        onImagesChange(sortSpaceImages([...images, ...added]));
      }

      if (failed.length === 0) {
        setSuccess("Photos uploaded.");
        setDropMessage(null);
        setDropMessageTone("default");
      } else if (added.length > 0) {
        const partialMsg = `${added.length} uploaded, ${failed.length} failed. ${failed.join("; ")}`;
        setDropMessage(partialMsg);
        setDropMessageTone("error");
        setFailure(partialMsg);
      } else {
        const failMsg = `Upload failed. ${failed.join("; ")}`;
        setDropMessage(failMsg);
        setDropMessageTone("error");
        setFailure(failMsg);
      }
    } catch (err) {
      const failMsg = sanitizeSectionMessage(
        err instanceof Error ? err.message : "Upload failed."
      );
      setDropMessage(failMsg);
      setDropMessageTone("error");
      setFailure(failMsg);
    } finally {
      uploadInFlightRef.current = false;
      setUploading(false);
      setUploadProgress(null);
    }
  }

  async function removeImage(imageId: string) {
    if (readOnly || !spaceId) return;
    const image = sortedImages.find((img) => img.id === imageId);
    if (!image) return;

    setDeletingId(imageId);
    clearForAction();
    try {
      await deleteSpacePhoto(apiMode, spaceId, image);
      const remaining = sortSpaceImages(images.filter((img) => img.id !== imageId));
      if (remaining.length > 0) {
        try {
          await persistImageOrder(remaining);
        } catch (reorderErr) {
          console.error("Photo reorder after delete failed:", reorderErr);
          onImagesChange(
            remaining.map((img, index) => ({
              ...img,
              sort_order: index,
            }))
          );
          setConfirmDeleteId(null);
          setFailure(
            "Photo removed, but cover order could not be updated. Refresh or reorder if needed."
          );
          return;
        }
      } else {
        onImagesChange([]);
      }
      setConfirmDeleteId(null);
      setSuccess("Photo removed.");
    } catch (err) {
      console.error("Photo delete failed:", err);
      setFailure(err instanceof Error ? err.message : "Could not remove image.");
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
                      disabled={deletingId === img.id || uploading || reordering}
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
                      disabled={uploading || reordering || deletingId !== null}
                      className="rounded border border-gray-300 bg-white p-1.5 text-red-600 disabled:opacity-40"
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
        <>
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
          <SectionInlineAlert status={status} error={error} className="mt-3" />
        </>
      ) : null}
    </div>
  );
}
