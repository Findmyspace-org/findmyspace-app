"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { AdminCrmLinkSection } from "@/app/components/AdminCrmLinkSection";
import { AdminLocationSection } from "@/app/components/AdminLocationSection";
import {
  AdminSpacePhotosPanel,
  type AdminSpaceImage,
} from "@/app/components/AdminSpacePhotosPanel";
import { LISTING_SPACE_TYPE_OPTIONS } from "@/app/data/spaceFeatureConfig";
import { adminApiFetch } from "@/lib/admin-api-client";
import type { SpaceCrmLinkSummary } from "@/lib/space-crm-link";
import {
  mergeScoutAttributes,
  scoutAttributesFromForm,
  scoutFormFromAttributes,
  VENUE_SCOUT_QUICK_TAGS,
} from "@/lib/venue-scout-tags";
import {
  GroupSizeFields,
  groupSizePayloadFromForm,
  validateGroupSizeFormValues,
} from "@/app/components/GroupSizeFields";
import MarkdownDescriptionEditor from "@/app/components/MarkdownDescriptionEditor";

const FIELD_CLASS =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#0f2740] focus:ring-1 focus:ring-[#0f2740]";

type ScoutFormState = {
  title: string;
  description: string;
  spaceType: string;
  city: string;
  suburb: string;
  streetAddress: string;
  province: string;
  postalCode: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  website: string;
  phone: string;
  adminNotes: string;
  minGroupSize: string;
  maxGroupSize: string;
  tags: string[];
};

function payloadFromState(
  state: ScoutFormState,
  extraAttributes: Record<string, string[]>,
  crmLink: { crm_organisation_id: string | null; crm_contact_id: string | null }
) {
  const scoutAttrs = scoutAttributesFromForm({
    website: state.website,
    phone: state.phone,
    tags: state.tags,
  });

  return {
    title: state.title,
    description: state.description,
    space_type: state.spaceType,
    booking_unit: "day",
    city: state.city,
    suburb: state.suburb,
    street_address: state.streetAddress,
    province: state.province,
    postal_code: state.postalCode,
    country: state.country,
    latitude: state.latitude,
    longitude: state.longitude,
    ...groupSizePayloadFromForm(state.spaceType, state.minGroupSize, state.maxGroupSize),
    attributes: mergeScoutAttributes(extraAttributes, scoutAttrs),
    crm_organisation_id: crmLink.crm_organisation_id,
    crm_contact_id: crmLink.crm_contact_id,
  };
}

type VenueScoutCaptureFormProps = {
  mode: "create" | "edit";
  spaceId?: string;
  initialStatus?: string | null;
  initial?: Partial<ScoutFormState>;
  initialAttributes?: Record<string, string[]>;
  initialImages?: AdminSpaceImage[];
  initialAdminNotes?: string;
  initialCrmLink?: SpaceCrmLinkSummary | null;
  readOnly?: boolean;
  onCreated?: (id: string) => void;
  showSavedBanner?: boolean;
};

export function VenueScoutCaptureForm({
  mode,
  spaceId,
  initialStatus,
  initial,
  initialAttributes = {},
  initialImages: initialImagesProp = [],
  initialAdminNotes = "",
  initialCrmLink = null,
  readOnly = false,
  onCreated,
  showSavedBanner = false,
}: VenueScoutCaptureFormProps) {
  const scoutDefaults = scoutFormFromAttributes(initialAttributes);

  const [state, setState] = useState<ScoutFormState>({
    title: initial?.title ?? "",
    description: initial?.description ?? "",
    spaceType: initial?.spaceType ?? "event_space",
    city: initial?.city ?? "Paarl",
    suburb: initial?.suburb ?? "",
    streetAddress: initial?.streetAddress ?? "",
    province: initial?.province ?? "Western Cape",
    postalCode: initial?.postalCode ?? "",
    country: initial?.country ?? "South Africa",
    latitude: initial?.latitude ?? null,
    longitude: initial?.longitude ?? null,
    website: initial?.website ?? scoutDefaults.website,
    phone: initial?.phone ?? scoutDefaults.phone,
    adminNotes: initial?.adminNotes ?? initialAdminNotes,
    minGroupSize: initial?.minGroupSize ?? "",
    maxGroupSize: initial?.maxGroupSize ?? "",
    tags: initial?.tags ?? scoutDefaults.tags,
  });
  const [baseAttributes] = useState(initialAttributes);
  const [images, setImages] = useState<AdminSpaceImage[]>(initialImagesProp);
  const [status, setStatus] = useState(initialStatus || "draft");
  const [message, setMessage] = useState<string | null>(
    showSavedBanner ? "Scout listing saved." : null
  );
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [optionalOpen, setOptionalOpen] = useState(false);
  const [crmLink, setCrmLink] = useState({
    crm_organisation_id: initialCrmLink?.crm_organisation_id ?? null,
    crm_contact_id: initialCrmLink?.crm_contact_id ?? null,
  });

  useEffect(() => {
    if (initial) {
      const scout = scoutFormFromAttributes(initialAttributes);
      setState((prev) => ({
        ...prev,
        ...initial,
        website: initial.website ?? scout.website,
        phone: initial.phone ?? scout.phone,
        minGroupSize: initial.minGroupSize ?? prev.minGroupSize,
        maxGroupSize: initial.maxGroupSize ?? prev.maxGroupSize,
        tags: initial.tags ?? scout.tags,
      }));
    }
    setImages(initialImagesProp);
    setStatus(initialStatus || "draft");
  }, [initial, initialAttributes, initialImagesProp, initialStatus]);

  const persistListing = useCallback(async () => {
    const body = payloadFromState(state, baseAttributes, crmLink);

    if (mode === "create") {
      const result = await adminApiFetch("/api/admin/spaces/unclaimed", {
        method: "POST",
        body: JSON.stringify(body),
      });
      const id = result.id as string;
      if (state.adminNotes.trim()) {
        await adminApiFetch(`/api/admin/spaces/${id}/listing-meta`, {
          method: "PATCH",
          body: JSON.stringify({ listing_admin_comment: state.adminNotes.trim() }),
        });
      }
      return id;
    }

    if (!spaceId) throw new Error("Missing listing id.");

    await adminApiFetch(`/api/admin/spaces/${spaceId}/unclaimed`, {
      method: "PATCH",
      body: JSON.stringify(
        status === "draft" ? { ...body, status: "draft" as const } : body
      ),
    });

    await adminApiFetch(`/api/admin/spaces/${spaceId}/listing-meta`, {
      method: "PATCH",
      body: JSON.stringify({
        listing_admin_comment: state.adminNotes.trim() || null,
      }),
    });

    return spaceId;
  }, [baseAttributes, crmLink, mode, spaceId, state, status]);

  async function saveDraft() {
    if (readOnly) return;
    if (!state.title.trim()) {
      setMessage("Space name is required.");
      return;
    }
    const groupSizeErr = validateGroupSizeFormValues(
      state.spaceType,
      state.minGroupSize,
      state.maxGroupSize
    );
    if (groupSizeErr) {
      setMessage(groupSizeErr);
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const id = await persistListing();
      setStatus("draft");
      setMessage("Scout listing saved.");
      if (mode === "create") {
        onCreated?.(id);
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    if (readOnly) return;
    if (!spaceId) {
      setMessage("Save the scout listing first, then add photos and publish.");
      return;
    }
    if (!state.title.trim()) {
      setMessage("Space name is required.");
      return;
    }
    if (!state.suburb.trim() && !state.city.trim()) {
      setMessage("Suburb or city is required.");
      return;
    }
    if (
      state.latitude === null ||
      state.longitude === null ||
      !Number.isFinite(state.latitude) ||
      !Number.isFinite(state.longitude)
    ) {
      setMessage(
        "Place the map pin before publishing — search for the address or drag the pin."
      );
      return;
    }
    if (images.length < 1) {
      setMessage("Add at least one photo before publishing.");
      return;
    }

    setPublishing(true);
    setMessage(null);
    try {
      await persistListing();
      await adminApiFetch(`/api/admin/spaces/${spaceId}/publish-unclaimed`, {
        method: "POST",
      });
      setStatus("unclaimed");
      setMessage("Published as unclaimed. It is now visible publicly.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Publish failed.");
    } finally {
      setPublishing(false);
    }
  }

  function toggleTag(value: string) {
    setState((s) => ({
      ...s,
      tags: s.tags.includes(value)
        ? s.tags.filter((t) => t !== value)
        : [...s.tags, value],
    }));
  }

  const statusBadge =
    status === "unclaimed"
      ? "bg-amber-100 text-amber-900"
      : status === "owner_claimed"
        ? "bg-green-100 text-green-800"
        : "bg-gray-100 text-gray-700";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusBadge}`}>
          {status === "unclaimed" ? "Unclaimed" : status === "owner_claimed" ? "Claimed" : "Draft"}
        </span>
        <span className="text-xs text-gray-500">Capture now, enrich later.</span>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900">Essentials</h2>
        <fieldset disabled={readOnly} className="mt-4 space-y-4 disabled:opacity-80">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">
              Space name <span className="text-red-600">*</span>
            </span>
            <input
              value={state.title}
              onChange={(e) => setState((s) => ({ ...s, title: e.target.value }))}
              className={FIELD_CLASS}
              placeholder="e.g. Paarl Conference Centre"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">
              Category <span className="text-red-600">*</span>
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
              Description <span className="text-red-600">*</span>
            </span>
            <MarkdownDescriptionEditor
              value={state.description}
              onChange={(description) => setState((s) => ({ ...s, description }))}
              rows={4}
              disabled={readOnly}
              textareaClassName="w-full px-3 py-2 text-sm outline-none"
            />
          </label>
        </fieldset>
      </section>

      <AdminLocationSection
        readOnly={readOnly}
        value={{
          streetAddress: state.streetAddress,
          suburb: state.suburb,
          city: state.city,
          province: state.province,
          postalCode: state.postalCode,
          country: state.country,
          latitude: state.latitude,
          longitude: state.longitude,
        }}
        onChange={(patch) => setState((s) => ({ ...s, ...patch }))}
      />

      <AdminCrmLinkSection
        spaceId={spaceId}
        initialLink={initialCrmLink}
        readOnly={readOnly}
        value={crmLink}
        onChange={(next) =>
          setCrmLink({
            crm_organisation_id: next.crm_organisation_id,
            crm_contact_id: next.crm_contact_id,
          })
        }
      />

      <section
        id="scout-photos"
        className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
      >
        <h2 className="text-lg font-semibold text-gray-900">
          Photos <span className="text-red-600">*</span>
        </h2>
        <AdminSpacePhotosPanel
          spaceId={spaceId}
          images={images}
          onImagesChange={setImages}
          readOnly={readOnly}
          compact
        />
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <button
          type="button"
          onClick={() => setOptionalOpen((o) => !o)}
          className="flex w-full items-center justify-between text-left"
        >
          <h2 className="text-lg font-semibold text-gray-900">More details (optional)</h2>
          <span className="text-sm text-gray-500">{optionalOpen ? "Hide" : "Show"}</span>
        </button>
        {optionalOpen ? (
          <fieldset disabled={readOnly} className="mt-4 space-y-4 disabled:opacity-80">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700">Website</span>
                <input
                  type="url"
                  value={state.website}
                  onChange={(e) => setState((s) => ({ ...s, website: e.target.value }))}
                  className={FIELD_CLASS}
                  placeholder="https://"
                />
              </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">Phone</span>
              <input
                type="tel"
                value={state.phone}
                onChange={(e) => setState((s) => ({ ...s, phone: e.target.value }))}
                className={FIELD_CLASS}
              />
              <p className="mt-1 text-xs text-gray-500">
                Saved on the listing — you can create a CRM contact from these details later.
              </p>
            </label>
            </div>
            <GroupSizeFields
              spaceType={state.spaceType}
              minGroupSize={state.minGroupSize}
              maxGroupSize={state.maxGroupSize}
              disabled={readOnly}
              onMinChange={(value) => setState((s) => ({ ...s, minGroupSize: value }))}
              onMaxChange={(value) => setState((s) => ({ ...s, maxGroupSize: value }))}
            />
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-gray-700">Admin notes</span>
              <textarea
                value={state.adminNotes}
                onChange={(e) => setState((s) => ({ ...s, adminNotes: e.target.value }))}
                rows={2}
                className={FIELD_CLASS}
                placeholder="Internal notes — not shown publicly."
              />
            </label>
            <div>
              <span className="mb-2 block text-sm font-medium text-gray-700">Quick tags</span>
              <div className="flex flex-wrap gap-2">
                {VENUE_SCOUT_QUICK_TAGS.map((tag) => {
                  const active = state.tags.includes(tag.value);
                  return (
                    <button
                      key={tag.value}
                      type="button"
                      onClick={() => toggleTag(tag.value)}
                      className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                        active
                          ? "bg-[#0f2740] text-white"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      }`}
                    >
                      {tag.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </fieldset>
        ) : null}
      </section>

      {message ? (
        <p
          className={`text-sm ${
            /failed|denied|too large|invalid|error|required|not found|could not|before publishing|Place the map/i.test(
              message
            ) && !message.includes("uploaded") && !message.includes("saved") && !message.includes("Published")
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
            className="rounded-lg bg-[#0f2740] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : mode === "create" ? (
              "Save scout listing"
            ) : (
              "Save"
            )}
          </button>
          {spaceId ? (
            <button
              type="button"
              disabled={saving || publishing}
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
