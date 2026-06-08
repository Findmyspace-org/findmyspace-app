"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { Loader2, Trash2, Upload } from "lucide-react";
import SpaceCategoryFields from "@/app/components/SpaceCategoryFields";
import { LISTING_SPACE_TYPE_OPTIONS } from "@/app/data/spaceFeatureConfig";
import { adminApiFetch } from "@/lib/admin-api-client";
import { ADMIN_SPACE_IMAGE_MAX_BYTES } from "@/lib/admin-space-image-upload";
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

  const saveDraft = useCallback(async () => {
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
        setMessage("Saved.");
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }, [mode, onCreated, readOnly, spaceId, state, status]);

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

  async function uploadImages(fileList: FileList | null) {
    if (readOnly || !spaceId || !fileList?.length) return;

    const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
    const allowedExt = new Set(["jpg", "jpeg", "png", "webp"]);
    const maxMb = (ADMIN_SPACE_IMAGE_MAX_BYTES / (1024 * 1024)).toFixed(0);

    for (const file of Array.from(fileList)) {
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
    try {
      const form = new FormData();
      Array.from(fileList).forEach((file) => form.append("files", file));
      const result = await adminApiFetch(`/api/admin/spaces/${spaceId}/images`, {
        method: "POST",
        body: form,
      });
      const added = (result.images as SpaceImage[]) || [];
      setImages((prev) => [...prev, ...added]);
      setMessage(`${added.length} photo(s) uploaded.`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function removeImage(imageId: string) {
    if (readOnly || !spaceId) return;
    setMessage(null);
    try {
      await adminApiFetch(`/api/admin/spaces/${spaceId}/images`, {
        method: "DELETE",
        body: JSON.stringify({ imageId }),
      });
      setImages((prev) => prev.filter((img) => img.id !== imageId));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not remove image.");
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
        {!spaceId ? (
          <p className="mt-2 text-sm text-gray-600">
            Save a draft first to upload photos.
          </p>
        ) : (
          <>
            <div className="mt-4 flex flex-wrap gap-3">
              {images.map((img) => (
                <div key={img.id} className="relative h-24 w-32 overflow-hidden rounded-lg border">
                  <Image
                    src={img.image_url}
                    alt=""
                    fill
                    className="object-cover"
                    unoptimized
                  />
                  <button
                    type="button"
                    onClick={() => void removeImage(img.id)}
                    className="absolute right-1 top-1 rounded bg-white/90 p-1 text-red-600 shadow"
                    aria-label="Remove photo"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <label className="mt-4 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-gray-300 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-100">
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              Upload photos
              <input
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                disabled={uploading}
                onChange={(e) => void uploadImages(e.target.files)}
              />
            </label>
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
        <button
          type="button"
          disabled={saving || publishing}
          onClick={() => void saveDraft()}
          className="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-60"
        >
          {saving ? "Saving…" : status === "draft" ? "Save draft" : "Save changes"}
        </button>
        {spaceId ? (
          <button
            type="button"
            disabled={saving || publishing || uploading}
            onClick={() => void publish()}
            className="rounded-lg bg-[#0f2740] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
          >
            {publishing ? "Publishing…" : "Publish as unclaimed"}
          </button>
        ) : null}
      </div>
      ) : null}
    </div>
  );
}
