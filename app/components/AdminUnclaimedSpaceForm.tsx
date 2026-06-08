"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  Star,
  Trash2,
  Upload,
} from "lucide-react";
import SpaceCategoryFields from "@/app/components/SpaceCategoryFields";
import { LISTING_SPACE_TYPE_OPTIONS } from "@/app/data/spaceFeatureConfig";
import { adminApiFetch } from "@/lib/admin-api-client";
import { ADMIN_SPACE_IMAGE_MAX_BYTES } from "@/lib/admin-space-image-upload";
import { sortSpaceImages } from "@/lib/sort-space-images";
import { ZA_PROVINCES } from "@/lib/za-provinces";

const MapPicker = dynamic(() => import("@/app/components/MapPicker"), {
  ssr: false,
});

type SpaceImage = {
  id: string;
  image_url: string;
  sort_order: number | null;
};

type FormState = {
  title: string;
  description: string;
  spaceType: string;
  bookingUnit: string;
  city: string;
  suburb: string;
  streetAddress: string;
  province: string;
  postalCode: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  attributes: Record<string, string[]>;
};

const FIELD_CLASS =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#0f2740] focus:ring-1 focus:ring-[#0f2740]";

function payloadFromState(state: FormState) {
  return {
    title: state.title,
    description: state.description,
    space_type: state.spaceType,
    booking_unit: state.bookingUnit,
    city: state.city,
    suburb: state.suburb,
    street_address: state.streetAddress,
    province: state.province,
    postal_code: state.postalCode,
    country: state.country,
    latitude: state.latitude,
    longitude: state.longitude,
    attributes: state.attributes,
  };
}

type AdminUnclaimedSpaceFormProps = {
  mode: "create" | "edit";
  spaceId?: string;
  initialStatus?: string | null;
  initial?: Partial<FormState>;
  initialImages?: SpaceImage[];
  enquiryCount?: number;
  readOnly?: boolean;
  onCreated?: (id: string) => void;
  onSavedAndExit?: () => void;
};

export function AdminUnclaimedSpaceForm({
  mode,
  spaceId,
  initialStatus,
  initial,
  initialImages = [],
  enquiryCount = 0,
  readOnly = false,
  onCreated,
  onSavedAndExit,
}: AdminUnclaimedSpaceFormProps) {
  const [state, setState] = useState<FormState>({
    title: initial?.title ?? "",
    description: initial?.description ?? "",
    spaceType: initial?.spaceType ?? "storage",
    bookingUnit: initial?.bookingUnit ?? "day",
    city: initial?.city ?? "",
    suburb: initial?.suburb ?? "",
    streetAddress: initial?.streetAddress ?? "",
    province: initial?.province ?? "",
    postalCode: initial?.postalCode ?? "",
    country: initial?.country ?? "South Africa",
    latitude: initial?.latitude ?? null,
    longitude: initial?.longitude ?? null,
    attributes: initial?.attributes ?? {},
  });
  const [images, setImages] = useState<SpaceImage[]>(initialImages);
  const [status, setStatus] = useState(initialStatus || "draft");
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [reordering, setReordering] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const sortedImages = useMemo(() => sortSpaceImages(images), [images]);

  useEffect(() => {
    if (initial) {
      setState((prev) => ({
        ...prev,
        ...initial,
        attributes: initial.attributes ?? prev.attributes,
      }));
    }
    setImages(initialImages);
    setStatus(initialStatus || "draft");
  }, [initial, initialImages, initialStatus]);

  const saveDraft = useCallback(
    async (stayOnPage: boolean) => {
      if (readOnly) return;
      setSaving(true);
      setMessage(null);
      try {
        const body = payloadFromState(state);

        if (mode === "create") {
          const result = await adminApiFetch("/api/admin/spaces/unclaimed", {
            method: "POST",
            body: JSON.stringify(body),
          });
          setStatus("draft");
          setMessage("Draft saved.");
          onCreated?.(result.id as string);
        } else if (spaceId) {
          await adminApiFetch(`/api/admin/spaces/${spaceId}/unclaimed`, {
            method: "PATCH",
            body: JSON.stringify(
              status === "draft" ? { ...body, status: "draft" as const } : body
            ),
          });
          if (stayOnPage) {
            setMessage("Saved.");
          } else {
            onSavedAndExit?.();
          }
        }
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Save failed.");
      } finally {
        setSaving(false);
      }
    },
    [mode, onCreated, onSavedAndExit, readOnly, spaceId, state, status]
  );

  const publish = useCallback(async () => {
    if (readOnly) return;
    if (!spaceId) {
      setMessage("Save as draft first, then add photos and publish.");
      return;
    }
    setPublishing(true);
    setMessage(null);
    try {
      await adminApiFetch(`/api/admin/spaces/${spaceId}/unclaimed`, {
        method: "PATCH",
        body: JSON.stringify(payloadFromState(state)),
      });
      await adminApiFetch(`/api/admin/spaces/${spaceId}/publish-unclaimed`, {
        method: "POST",
      });
      setStatus("unclaimed");
      setMessage("Published as unclaimed. It is now visible publicly (not bookable).");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Publish failed.");
    } finally {
      setPublishing(false);
    }
  }, [readOnly, spaceId, state]);

  async function persistImageOrder(ordered: SpaceImage[]) {
    if (!spaceId) return;
    const imageIds = ordered.map((img) => img.id);
    await adminApiFetch(`/api/admin/spaces/${spaceId}/images/reorder`, {
      method: "PATCH",
      body: JSON.stringify({ imageIds }),
    });
    setImages(
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
    setMessage(null);
    try {
      await persistImageOrder(next);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not reorder photos.");
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
        setMessage(
          `Invalid file type "${file.name}". Use JPG, PNG, or WebP only.`
        );
        return;
      }
      if (file.size > ADMIN_SPACE_IMAGE_MAX_BYTES) {
        setMessage(
          `"${file.name}" is too large. Maximum size is ${maxMb} MB per image.`
        );
        return;
      }
    }

    setUploading(true);
    setMessage(null);
    const added: SpaceImage[] = [];
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
        const uploaded = (result.images as SpaceImage[]) || [];
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
      setImages((prev) => sortSpaceImages([...prev, ...added]));
    }

    if (failed.length === 0) {
      setMessage(`${added.length} photo(s) uploaded.`);
    } else if (added.length > 0) {
      setMessage(
        `${added.length} uploaded, ${failed.length} failed: ${failed.join("; ")}`
      );
    } else {
      setMessage(`Upload failed: ${failed.join("; ")}`);
    }

    setUploading(false);
    setUploadProgress(null);
  }

  async function removeImage(imageId: string) {
    if (readOnly || !spaceId) return;
    setDeletingId(imageId);
    setMessage(null);
    try {
      await adminApiFetch(`/api/admin/spaces/${spaceId}/images`, {
        method: "DELETE",
        body: JSON.stringify({ imageId }),
      });
      const remaining = sortSpaceImages(images.filter((img) => img.id !== imageId));
      if (remaining.length > 0) {
        await persistImageOrder(remaining);
      } else {
        setImages([]);
      }
      setConfirmDeleteId(null);
      setMessage("Photo removed.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not remove image.");
    } finally {
      setDeletingId(null);
    }
  }

  const statusBadge =
    status === "unclaimed"
      ? "bg-amber-100 text-amber-900"
      : status === "owner_claimed"
        ? "bg-green-100 text-green-800"
        : "bg-gray-100 text-gray-700";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusBadge}`}>
          {status === "unclaimed"
            ? "Unclaimed"
            : status === "owner_claimed"
              ? "Owner claimed"
              : "Draft"}
        </span>
        {enquiryCount > 0 ? (
          <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800">
            {enquiryCount} {enquiryCount === 1 ? "enquiry" : "enquiries"}
          </span>
        ) : null}
        <span className="text-xs text-gray-500">
          Pricing is hidden publicly — shown as “Pricing to be confirmed”.
        </span>
      </div>

      {readOnly ? (
        <p className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-900">
          This listing has been claimed by an owner. Editing is disabled here — use
          admin spaces tools or wait for the owner verification flow.
        </p>
      ) : null}

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Basics</h2>
        <fieldset disabled={readOnly} className="mt-4 space-y-4 disabled:opacity-80">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Title</span>
            <input
              value={state.title}
              onChange={(e) => setState((s) => ({ ...s, title: e.target.value }))}
              className={FIELD_CLASS}
              placeholder="e.g. Warehouse in Paarl"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">
              Description
            </span>
            <textarea
              value={state.description}
              onChange={(e) => setState((s) => ({ ...s, description: e.target.value }))}
              rows={5}
              className={FIELD_CLASS}
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">
                Category
              </span>
              <select
                value={state.spaceType}
                onChange={(e) => setState((s) => ({ ...s, spaceType: e.target.value }))}
                className={FIELD_CLASS}
              >
                {LISTING_SPACE_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">
                Rental period (display)
              </span>
              <select
                value={state.bookingUnit}
                onChange={(e) => setState((s) => ({ ...s, bookingUnit: e.target.value }))}
                className={FIELD_CLASS}
              >
                <option value="hour">Hourly</option>
                <option value="day">Daily</option>
                <option value="month">Monthly</option>
              </select>
            </label>
          </div>
        </fieldset>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Location</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="mb-1 block text-sm font-medium text-gray-700">
              Street address
            </span>
            <input
              value={state.streetAddress}
              onChange={(e) =>
                setState((s) => ({ ...s, streetAddress: e.target.value }))
              }
              className={FIELD_CLASS}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Suburb</span>
            <input
              value={state.suburb}
              onChange={(e) => setState((s) => ({ ...s, suburb: e.target.value }))}
              className={FIELD_CLASS}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">City</span>
            <input
              value={state.city}
              onChange={(e) => setState((s) => ({ ...s, city: e.target.value }))}
              className={FIELD_CLASS}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">Province</span>
            <select
              value={state.province}
              onChange={(e) => setState((s) => ({ ...s, province: e.target.value }))}
              className={FIELD_CLASS}
            >
              <option value="">Select province</option>
              {ZA_PROVINCES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">
              Postal code
            </span>
            <input
              value={state.postalCode}
              onChange={(e) => setState((s) => ({ ...s, postalCode: e.target.value }))}
              className={FIELD_CLASS}
            />
          </label>
        </div>
        <div className="mt-4">
          <MapPicker
            latitude={state.latitude ?? -33.9249}
            longitude={state.longitude ?? 18.4241}
            onChange={(latitude, longitude) =>
              setState((s) => ({ ...s, latitude, longitude }))
            }
          />
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Features &amp; size</h2>
        <div className="mt-4">
          <SpaceCategoryFields
            embedded
            spaceType={state.spaceType}
            attributes={state.attributes}
            setAttributes={(updater) =>
              setState((s) => ({
                ...s,
                attributes:
                  typeof updater === "function" ? updater(s.attributes) : updater,
              }))
            }
          />
        </div>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Photos</h2>
        <p className="mt-1 text-sm text-gray-600">
          First photo is the cover image on cards and the public listing. Use the arrows
          to reorder.
        </p>
        {!spaceId ? (
          <p className="mt-2 text-sm text-gray-600">
            Save a draft first to upload photos.
          </p>
        ) : (
          <>
            {sortedImages.length === 0 ? (
              <p className="mt-3 text-sm text-gray-500">No photos yet.</p>
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
                      {index === 0 ? (
                        <span className="absolute left-1 top-1 inline-flex items-center gap-0.5 rounded bg-[#0f2740] px-1.5 py-0.5 text-[10px] font-semibold text-white">
                          <Star className="h-2.5 w-2.5" />
                          Cover
                        </span>
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      {index === 0 ? (
                        <>
                          <p className="text-sm font-medium text-gray-900">
                            Cover image
                          </p>
                          <p className="text-xs text-gray-500">
                            Shown on search results, browse cards, map results, and
                            the public listing.
                          </p>
                        </>
                      ) : (
                        <p className="text-sm text-gray-600">Photo {index + 1}</p>
                      )}
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
                            index === sortedImages.length - 1 ||
                            reordering ||
                            uploading
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
            )}
            {!readOnly ? (
              <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-gray-300 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-100">
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                {uploading && uploadProgress
                  ? `Uploading ${uploadProgress.current} of ${uploadProgress.total}…`
                  : "Upload photos"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                  multiple
                  className="sr-only"
                  disabled={uploading || reordering}
                  onChange={(e) => {
                    void uploadImages(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
            ) : null}
          </>
        )}
      </section>

      {message ? (
        <p
          className={`text-sm ${
            /failed|denied|too large|invalid|error|required|not found|could not/i.test(
              message
            ) && !message.includes("uploaded")
              ? "text-red-600"
              : "text-green-700"
          }`}
        >
          {message}
        </p>
      ) : null}

      {!readOnly ? (
        <div className="flex flex-wrap gap-3">
          {mode === "edit" ? (
            <>
              <button
                type="button"
                disabled={saving || publishing || uploading || reordering}
                onClick={() => void saveDraft(false)}
                className="rounded-lg bg-[#0f2740] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                disabled={saving || publishing || uploading || reordering}
                onClick={() => void saveDraft(true)}
                className="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-60"
              >
                Save &amp; continue editing
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={saving || publishing}
              onClick={() => void saveDraft(true)}
              className="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save draft"}
            </button>
          )}
          {spaceId ? (
            <button
              type="button"
              disabled={saving || publishing || uploading || reordering}
              onClick={() => void publish()}
              className="rounded-lg border border-[#0f2740] bg-white px-5 py-2.5 text-sm font-semibold text-[#0f2740] hover:bg-gray-50 disabled:opacity-60"
            >
              {publishing ? "Publishing…" : "Publish as unclaimed"}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
