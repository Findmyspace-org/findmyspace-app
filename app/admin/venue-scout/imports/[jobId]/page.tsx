"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ExternalLink, Save } from "lucide-react";
import { AdminNav } from "@/app/components/AdminNav";
import { adminApiFetch } from "@/lib/admin-api-client";
import { useAdminRole } from "@/lib/use-admin-role";

type ImportJob = {
  id: string;
  source_url: string;
  status: string;
  extraction_summary: string | null;
  error_message: string | null;
};

type PropertyCandidate = {
  id: string;
  name: string | null;
  description: string | null;
  address: string | null;
  suburb: string | null;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  country: string | null;
  confidence_score: number | null;
};

type SpaceCandidate = {
  id: string;
  name: string | null;
  description: string | null;
  space_type: string | null;
  min_group_size: number | null;
  max_group_size: number | null;
  price_amount: number | null;
  price_unit: string | null;
  booking_unit: string | null;
  amenities: string[];
  missing_fields: string[];
  selected_for_creation: boolean;
  confidence_score: number | null;
};

type PageRow = {
  id: string;
  url: string;
  title: string | null;
  page_type: string;
  status_code: number | null;
};

type ImageCandidate = {
  id: string;
  image_url: string;
  alt_text: string | null;
  source_url: string | null;
  selected: boolean;
};

type ExistingProperty = {
  id: string;
  name: string;
  city: string | null;
  suburb: string | null;
};

function textValue(value: string | null | undefined): string {
  return value ?? "";
}

function numberOrNull(value: string): number | null {
  if (!value.trim()) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export default function VenueScoutImportDetailPage() {
  const params = useParams();
  const jobId = typeof params.jobId === "string" ? params.jobId : "";
  const { isAdmin, loading: roleLoading } = useAdminRole();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [job, setJob] = useState<ImportJob | null>(null);
  const [property, setProperty] = useState<PropertyCandidate | null>(null);
  const [spaces, setSpaces] = useState<SpaceCandidate[]>([]);
  const [pages, setPages] = useState<PageRow[]>([]);
  const [images, setImages] = useState<ImageCandidate[]>([]);
  const [properties, setProperties] = useState<ExistingProperty[]>([]);
  const [duplicateWarnings, setDuplicateWarnings] = useState<string[]>([]);
  const [convertMode, setConvertMode] = useState("create_new_property");
  const [existingPropertyId, setExistingPropertyId] = useState("");
  const [convertResult, setConvertResult] = useState<Record<string, unknown> | null>(null);

  const selectedSpaceCount = useMemo(
    () => spaces.filter((space) => space.selected_for_creation).length,
    [spaces]
  );

  const load = useCallback(async () => {
    if (!jobId) return;
    setLoading(true);
    try {
      const result = await adminApiFetch(`/api/admin/venue-scout/imports/${jobId}`);
      setJob(result.job as ImportJob);
      setProperty(((result.property_candidates as PropertyCandidate[]) || [])[0] ?? null);
      setSpaces((result.space_candidates as SpaceCandidate[]) || []);
      setPages((result.pages as PageRow[]) || []);
      setImages((result.image_candidates as ImageCandidate[]) || []);
      setProperties((result.properties as ExistingProperty[]) || []);
      setDuplicateWarnings((result.duplicate_warnings as string[]) || []);
      setMessage("");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to load import.");
    }
    setLoading(false);
  }, [jobId]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (isAdmin) void load();
      else if (!roleLoading) setLoading(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [isAdmin, roleLoading, load]);

  async function save() {
    setSaving(true);
    setMessage("");
    try {
      await adminApiFetch(`/api/admin/venue-scout/imports/${jobId}`, {
        method: "PATCH",
        body: JSON.stringify({
          property_candidate: property,
          space_candidates: spaces,
          image_candidates: images.map((image) => ({
            id: image.id,
            selected: image.selected,
          })),
        }),
      });
      setMessage("Staged import saved.");
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not save import.");
    }
    setSaving(false);
  }

  async function convert(mode: string) {
    if (mode === "add_to_existing_property" && !existingPropertyId) {
      setMessage("Select an existing property.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const result = await adminApiFetch(
        `/api/admin/venue-scout/imports/${jobId}/convert`,
        {
          method: "POST",
          body: JSON.stringify({
            mode,
            existing_property_id: existingPropertyId || undefined,
            selected_space_ids: spaces
              .filter((space) => space.selected_for_creation)
              .map((space) => space.id),
          }),
        }
      );
      setConvertResult(result);
      setMessage("Import converted. Created records are draft/admin-created.");
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Conversion failed.");
    }
    setSaving(false);
  }

  if (roleLoading || loading) return <main className="p-8 text-gray-600">Loading…</main>;
  if (!isAdmin) {
    return (
      <main className="p-8">
        <p className="text-red-600">Access denied.</p>
      </main>
    );
  }

  if (!job) {
    return (
      <main className="p-8">
        <p className="text-red-600">{message || "Import not found."}</p>
        <Link href="/admin/venue-scout/imports" className="mt-4 inline-block text-sm underline">
          Back to imports
        </Link>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-6 md:p-8">
      <div className="mx-auto max-w-6xl">
        <AdminNav current="venue-scout" />
        <Link
          href="/admin/venue-scout/imports"
          className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to imports
        </Link>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">
              Review website import
            </h1>
            <p className="mt-1 break-all text-sm text-gray-600">{job.source_url}</p>
            <p className="mt-2 text-sm text-gray-700">
              Status: <span className="font-medium">{job.status}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-[#0f2740] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            <Save className="h-4 w-4" />
            Save staged edits
          </button>
        </div>

        {message ? (
          <p className="mt-4 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-sm text-blue-900">
            {message}
          </p>
        ) : null}

        {duplicateWarnings.length ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-semibold">Possible duplicates</p>
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {duplicateWarnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        ) : null}

        <section className="mt-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Property candidate</h2>
          {property ? (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="text-xs font-medium text-gray-600">Name</span>
                <input
                  value={textValue(property.name)}
                  onChange={(e) => setProperty({ ...property, name: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-gray-600">Address</span>
                <input
                  value={textValue(property.address)}
                  onChange={(e) => setProperty({ ...property, address: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
              <label className="block md:col-span-2">
                <span className="text-xs font-medium text-gray-600">Description</span>
                <textarea
                  value={textValue(property.description)}
                  onChange={(e) =>
                    setProperty({ ...property, description: e.target.value })
                  }
                  rows={4}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
              {(["suburb", "city", "province", "postal_code", "country"] as const).map(
                (field) => (
                  <label key={field} className="block">
                    <span className="text-xs font-medium capitalize text-gray-600">
                      {field.replace("_", " ")}
                    </span>
                    <input
                      value={textValue(property[field])}
                      onChange={(e) =>
                        setProperty({ ...property, [field]: e.target.value })
                      }
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    />
                  </label>
                )
              )}
            </div>
          ) : (
            <p className="mt-2 text-sm text-gray-600">No property candidate extracted.</p>
          )}
        </section>

        <section className="mt-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-gray-900">Space candidates</h2>
            <p className="text-sm text-gray-600">{selectedSpaceCount} selected</p>
          </div>
          <div className="mt-4 space-y-4">
            {spaces.map((space, index) => (
              <div key={space.id} className="rounded-lg border border-gray-200 p-4">
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                  <input
                    type="checkbox"
                    checked={space.selected_for_creation}
                    onChange={(e) =>
                      setSpaces((rows) =>
                        rows.map((row) =>
                          row.id === space.id
                            ? { ...row, selected_for_creation: e.target.checked }
                            : row
                        )
                      )
                    }
                  />
                  Create this space
                </label>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <input
                    value={textValue(space.name)}
                    onChange={(e) =>
                      setSpaces((rows) =>
                        rows.map((row) =>
                          row.id === space.id ? { ...row, name: e.target.value } : row
                        )
                      )
                    }
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    placeholder={`Space ${index + 1} name`}
                  />
                  <select
                    value={space.space_type || "event_space"}
                    onChange={(e) =>
                      setSpaces((rows) =>
                        rows.map((row) =>
                          row.id === space.id
                            ? { ...row, space_type: e.target.value }
                            : row
                        )
                      )
                    }
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="event_space">Event space</option>
                    <option value="sport_venue">Sport venue</option>
                    <option value="workspace">Workspace</option>
                    <option value="parking">Parking</option>
                    <option value="storage">Storage</option>
                    <option value="other">Other</option>
                  </select>
                  <textarea
                    value={textValue(space.description)}
                    onChange={(e) =>
                      setSpaces((rows) =>
                        rows.map((row) =>
                          row.id === space.id
                            ? { ...row, description: e.target.value }
                            : row
                        )
                      )
                    }
                    rows={3}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm md:col-span-2"
                    placeholder="Description"
                  />
                  <input
                    value={space.max_group_size ?? ""}
                    onChange={(e) =>
                      setSpaces((rows) =>
                        rows.map((row) =>
                          row.id === space.id
                            ? { ...row, max_group_size: numberOrNull(e.target.value) }
                            : row
                        )
                      )
                    }
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    placeholder="Max capacity"
                  />
                  <input
                    value={space.price_amount ?? ""}
                    onChange={(e) =>
                      setSpaces((rows) =>
                        rows.map((row) =>
                          row.id === space.id
                            ? { ...row, price_amount: numberOrNull(e.target.value) }
                            : row
                        )
                      )
                    }
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    placeholder="Price amount"
                  />
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  Missing: {space.missing_fields?.join(", ") || "none"} · Confidence:{" "}
                  {space.confidence_score ?? "unknown"}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Conversion</h2>
          <p className="mt-1 text-sm text-gray-600">
            Preview: creates only selected spaces as draft admin-created records. Website
            image candidates remain staged and are not hotlinked.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
            <select
              value={convertMode}
              onChange={(e) => setConvertMode(e.target.value)}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="create_new_property">Create new Property + selected Spaces</option>
              <option value="add_to_existing_property">Add selected Spaces to existing Property</option>
              <option value="create_unclaimed_spaces">Create selected Unclaimed Spaces</option>
            </select>
            <select
              value={existingPropertyId}
              onChange={(e) => setExistingPropertyId(e.target.value)}
              disabled={convertMode !== "add_to_existing_property"}
              className="rounded-lg border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-100"
            >
              <option value="">Select existing property</option>
              {properties.map((propertyRow) => (
                <option key={propertyRow.id} value={propertyRow.id}>
                  {propertyRow.name} {propertyRow.city ? `· ${propertyRow.city}` : ""}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={saving || selectedSpaceCount === 0}
              onClick={() => convert(convertMode)}
              className="rounded-lg bg-[#0f2740] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              Convert selected
            </button>
          </div>
          <button
            type="button"
            onClick={() => convert("archive")}
            className="mt-3 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800"
          >
            Archive import
          </button>
          {convertResult?.spaces ? (
            <div className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-900">
              Created {Array.isArray(convertResult.spaces) ? convertResult.spaces.length : 0} draft
              space(s). Use admin Properties / Venue Scout edit routes to review before publishing.
            </div>
          ) : null}
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-2">
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">Crawled pages</h2>
            <div className="mt-3 space-y-2">
              {pages.map((page) => (
                <a
                  key={page.id}
                  href={page.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block rounded-lg border border-gray-100 p-3 text-sm hover:bg-gray-50"
                >
                  <span className="font-medium text-gray-900">
                    {page.title || page.url}
                  </span>
                  <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                    {page.page_type}
                  </span>
                  <ExternalLink className="ml-1 inline h-3 w-3" />
                </a>
              ))}
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">Image candidates</h2>
            <p className="mt-1 text-xs text-amber-700">
              Copyright warning: URLs are staged for review only and are not imported automatically.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              {images.slice(0, 12).map((image) => (
                <label key={image.id} className="block rounded-lg border border-gray-200 p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image.image_url}
                    alt={image.alt_text || "Candidate image"}
                    className="h-24 w-full rounded object-cover"
                  />
                  <span className="mt-2 flex items-center gap-2 text-xs text-gray-700">
                    <input
                      type="checkbox"
                      checked={image.selected}
                      onChange={(e) =>
                        setImages((rows) =>
                          rows.map((row) =>
                            row.id === image.id ? { ...row, selected: e.target.checked } : row
                          )
                        )
                      }
                    />
                    Mark for later import
                  </span>
                </label>
              ))}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
