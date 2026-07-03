"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { adminApiFetch } from "@/lib/admin-api-client";

type ArchivePreview = {
  property_id: string;
  property_name: string;
  space_count: number;
  archivable_space_count: number;
  already_archived_space_count: number;
  open_booking_count: number;
  can_archive: boolean;
  block_reason: string | null;
};

type ArchivePropertyModalProps = {
  propertyId: string;
  propertyName: string;
  open: boolean;
  onClose: () => void;
  onArchived: (summary: {
    property_name: string;
    spaces_archived: number;
  }) => void;
};

export function ArchivePropertyModal({
  propertyId,
  propertyName,
  open,
  onClose,
  onArchived,
}: ArchivePropertyModalProps) {
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [preview, setPreview] = useState<ArchivePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const loadPreview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await adminApiFetch(`/api/admin/properties/${propertyId}/archive`);
      setPreview(result as ArchivePreview);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load archive preview.");
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useEffect(() => {
    if (!open) {
      setPreview(null);
      setError(null);
      setConfirmed(false);
      return;
    }
    void loadPreview();
  }, [open, loadPreview]);

  async function handleArchive() {
    if (!preview?.can_archive || !confirmed) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await adminApiFetch(`/api/admin/properties/${propertyId}/archive`, {
        method: "POST",
      });
      onArchived({
        property_name: (result.property_name as string) || propertyName,
        spaces_archived: Number(result.spaces_archived) || 0,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not archive property.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  const affectedSpaces = preview?.archivable_space_count ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className="w-full max-w-lg rounded-xl border border-gray-200 bg-white p-6 shadow-xl"
        role="dialog"
        aria-labelledby="archive-property-title"
      >
        <h2 id="archive-property-title" className="text-lg font-semibold text-gray-900">
          Archive {preview?.property_name || propertyName}?
        </h2>

        {loading ? (
          <div className="mt-6 flex items-center gap-2 text-sm text-gray-600">
            <Loader2 className="h-4 w-4 animate-spin" />
            Checking linked spaces and bookings…
          </div>
        ) : (
          <>
            <p className="mt-3 text-sm text-gray-600">
              This will archive the property and{" "}
              <span className="font-semibold text-gray-900">
                {affectedSpaces} space{affectedSpaces === 1 ? "" : "s"}
              </span>{" "}
              under it. These spaces will no longer appear on FindMySpace and renters
              will not be able to book them. Existing booking history will be preserved.
            </p>

            {preview && preview.already_archived_space_count > 0 ? (
              <p className="mt-2 text-xs text-gray-500">
                {preview.already_archived_space_count} linked space
                {preview.already_archived_space_count === 1 ? "" : "s"} already archived
                will be left unchanged.
              </p>
            ) : null}

            {preview && !preview.can_archive && preview.block_reason ? (
              <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {preview.block_reason}
              </p>
            ) : null}

            {preview?.can_archive ? (
              <label className="mt-4 flex items-start gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  I understand this will archive all spaces under this property.
                </span>
              </label>
            ) : null}

            {error ? (
              <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </p>
            ) : null}
          </>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={
              loading || submitting || !preview?.can_archive || !confirmed
            }
            onClick={() => void handleArchive()}
            className="rounded-lg bg-red-800 px-4 py-2 text-sm font-semibold text-white hover:bg-red-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Archiving…" : "Archive property"}
          </button>
        </div>
      </div>
    </div>
  );
}
