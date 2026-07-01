"use client";

import { useCallback, useState } from "react";
import { ChevronDown, ExternalLink, FileText, Loader2 } from "lucide-react";
import { adminApiFetch } from "@/lib/admin-api-client";
import { ownerApiFetch } from "@/lib/owner-api-client";
import {
  DEFAULT_PROPERTY_TERMS_ACCEPTANCE_LABEL,
  normalizePropertyTermsRow,
  type PropertyBookingTerms,
} from "@/lib/property-booking-terms";

const FIELD_CLASS =
  "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#0f2740] focus:ring-1 focus:ring-[#0f2740]";

type Props = {
  propertyId: string;
  mode: "admin" | "owner";
  initial: PropertyBookingTerms | null;
  onSaved?: (terms: PropertyBookingTerms) => void;
  onMessage?: (message: string | null) => void;
};

export function PropertyTermsSection({
  propertyId,
  mode,
  initial,
  onSaved,
  onMessage,
}: Props) {
  const [open, setOpen] = useState(() => Boolean(initial?.require_terms_acceptance));
  const [termsTitle, setTermsTitle] = useState(initial?.terms_title || "");
  const [termsText, setTermsText] = useState(initial?.terms_text || "");
  const [documentUrl, setDocumentUrl] = useState(initial?.terms_document_url || "");
  const [requireAcceptance, setRequireAcceptance] = useState(
    initial?.require_terms_acceptance ?? false
  );
  const [acceptanceLabel, setAcceptanceLabel] = useState(
    initial?.terms_acceptance_label || DEFAULT_PROPERTY_TERMS_ACCEPTANCE_LABEL
  );
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const saveTerms = useCallback(async () => {
    setSaving(true);
    onMessage?.(null);
    try {
      const payload = {
        terms_title: termsTitle.trim() || null,
        terms_text: termsText.trim() || null,
        require_terms_acceptance:
          requireAcceptance && Boolean(termsText.trim() || documentUrl.trim()),
        terms_acceptance_label: acceptanceLabel.trim() || DEFAULT_PROPERTY_TERMS_ACCEPTANCE_LABEL,
      };

      const result =
        mode === "admin"
          ? await adminApiFetch(`/api/admin/properties/${propertyId}`, {
              method: "PATCH",
              body: JSON.stringify(payload),
            })
          : await ownerApiFetch(`/api/owner/properties/${propertyId}/terms`, {
              method: "PATCH",
              body: JSON.stringify(payload),
            });

      const normalized = normalizePropertyTermsRow(
        (result.property as Record<string, unknown>) || result
      );
      if (normalized) {
        onSaved?.({ ...normalized, terms_document_url: documentUrl || normalized.terms_document_url });
      }
      onMessage?.("Terms and conditions saved.");
    } catch (err) {
      onMessage?.(err instanceof Error ? err.message : "Could not save terms.");
    } finally {
      setSaving(false);
    }
  }, [
    acceptanceLabel,
    documentUrl,
    mode,
    onMessage,
    onSaved,
    propertyId,
    requireAcceptance,
    termsText,
    termsTitle,
  ]);

  async function handleDocumentUpload(file: File | null) {
    if (!file || mode !== "admin") return;
    setUploading(true);
    onMessage?.(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const result = await adminApiFetch(
        `/api/admin/properties/${propertyId}/terms-document`,
        { method: "POST", body: form }
      );
      const url = (result.terms_document_url as string) || "";
      setDocumentUrl(url);
      const normalized = normalizePropertyTermsRow(result.property as Record<string, unknown>);
      if (normalized) onSaved?.(normalized);
      onMessage?.("Terms document uploaded.");
    } catch (err) {
      onMessage?.(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function handleRemoveDocument() {
    if (mode !== "admin") return;
    setUploading(true);
    onMessage?.(null);
    try {
      await adminApiFetch(`/api/admin/properties/${propertyId}/terms-document`, {
        method: "DELETE",
      });
      setDocumentUrl("");
      onMessage?.("Terms document removed.");
    } catch (err) {
      onMessage?.(err instanceof Error ? err.message : "Could not remove document.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-start justify-between gap-3 px-5 py-4 text-left"
      >
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Terms and conditions</h2>
          <p className="mt-1 text-sm text-gray-600">
            Upload or add terms that renters must accept before requesting a space at this property.
          </p>
        </div>
        <ChevronDown
          className={`mt-0.5 h-5 w-5 shrink-0 text-gray-500 transition ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {open ? (
        <div className="space-y-4 border-t border-gray-100 px-5 pb-5 pt-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Title (optional)</label>
            <input
              type="text"
              value={termsTitle}
              onChange={(e) => setTermsTitle(e.target.value)}
              placeholder="e.g. Venue hire terms"
              className={FIELD_CLASS}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Terms text</label>
            <textarea
              value={termsText}
              onChange={(e) => setTermsText(e.target.value)}
              rows={6}
              placeholder="Enter your terms and conditions…"
              className={FIELD_CLASS}
            />
          </div>

          {mode === "admin" ? (
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                Terms document (PDF or image)
              </label>
              {documentUrl ? (
                <div className="flex flex-wrap items-center gap-2">
                  <a
                    href={documentUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-[#0f2740] hover:bg-gray-50"
                  >
                    <FileText className="h-4 w-4" aria-hidden />
                    View document
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  </a>
                  <button
                    type="button"
                    onClick={() => void handleRemoveDocument()}
                    disabled={uploading}
                    className="rounded-lg border border-red-200 px-3 py-2 text-sm text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    Remove
                  </button>
                </div>
              ) : null}
              <input
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                disabled={uploading}
                onChange={(e) => void handleDocumentUpload(e.target.files?.[0] || null)}
                className="mt-2 block w-full text-sm text-gray-600"
              />
              {uploading ? (
                <p className="mt-1 flex items-center gap-1.5 text-xs text-gray-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  Uploading…
                </p>
              ) : null}
            </div>
          ) : documentUrl ? (
            <a
              href={documentUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-[#0f2740] hover:underline"
            >
              <FileText className="h-4 w-4" aria-hidden />
              View terms document
            </a>
          ) : null}

          <label className="flex items-start gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={requireAcceptance}
              onChange={(e) => setRequireAcceptance(e.target.checked)}
              className="mt-0.5"
            />
            <span>Require renters to accept these terms before requesting a booking.</span>
          </label>

          {requireAcceptance &&
          !termsText.trim() &&
          !documentUrl.trim() ? (
            <p className="text-xs text-amber-800">
              Add terms text or upload a document before requiring acceptance.
            </p>
          ) : null}

          {requireAcceptance ? (
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                Checkbox label
              </label>
              <input
                type="text"
                value={acceptanceLabel}
                onChange={(e) => setAcceptanceLabel(e.target.value)}
                className={FIELD_CLASS}
              />
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => void saveTerms()}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-[#0f2740] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            Save terms
          </button>
        </div>
      ) : null}
    </section>
  );
}
