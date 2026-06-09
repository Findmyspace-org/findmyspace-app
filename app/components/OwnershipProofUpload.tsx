"use client";

import { useEffect, useMemo, useState } from "react";
import { FileText, ImageIcon, Loader2 } from "lucide-react";
import { ClaimDocumentPreviewModal } from "@/app/components/ClaimDocumentPreviewModal";
import { supabase } from "@/lib/supabase";
import { uploadOwnerPrivateFile } from "@/lib/owner-private-upload";
import {
  createVerificationSignedUrl,
  LISTING_OWNERSHIP_BUCKET,
} from "@/lib/verification-storage";

type OwnershipDoc = {
  id: string;
  file_url: string;
  file_path: string | null;
  status: string | null;
};

function fileNameFromPath(path: string | null | undefined): string | null {
  if (!path) return null;
  const segment = path.split("/").pop();
  return segment || null;
}

function isImageFile(name: string): boolean {
  return /\.(jpe?g|png|gif|webp|bmp)$/i.test(name);
}

function isPdfFile(name: string): boolean {
  return /\.pdf$/i.test(name);
}

export function OwnershipProofUpload({
  spaceId,
  ownerId,
  ownershipProof,
  ownershipProofStatus,
  onUploaded,
  disabled = false,
}: {
  spaceId: string;
  ownerId: string;
  ownershipProof: OwnershipDoc | null;
  ownershipProofStatus: string | null;
  onUploaded: (doc: OwnershipDoc) => void;
  disabled?: boolean;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  const displayFileName = useMemo(() => {
    if (file?.name) return file.name;
    return fileNameFromPath(ownershipProof?.file_path);
  }, [file, ownershipProof?.file_path]);

  const mimeHint = useMemo((): "image" | "pdf" | "unknown" => {
    const name = displayFileName || "";
    if (isImageFile(name)) return "image";
    if (isPdfFile(name)) return "pdf";
    return "unknown";
  }, [displayFileName]);

  useEffect(() => {
    let cancelled = false;
    async function resolvePreview() {
      if (!ownershipProof?.file_path) {
        setPreviewUrl(null);
        return;
      }
      const url = await createVerificationSignedUrl(
        supabase,
        LISTING_OWNERSHIP_BUCKET,
        ownershipProof.file_path
      );
      if (!cancelled) setPreviewUrl(url);
    }
    void resolvePreview();
    return () => {
      cancelled = true;
    };
  }, [ownershipProof?.file_path]);

  async function handleUpload() {
    if (!file) {
      setMessage("Please choose a file first.");
      return;
    }
    setUploading(true);
    setMessage("");
    try {
      const uploaded = await uploadOwnerPrivateFile(
        LISTING_OWNERSHIP_BUCKET,
        ownerId,
        file,
        `ownership-${spaceId}`
      );

      let savedDoc: OwnershipDoc;

      if (ownershipProof?.id) {
        const { error: updateError } = await (supabase
          .from("listing_ownership_documents") as ReturnType<typeof supabase.from>)
          .update({
            file_url: uploaded.fileUrl,
            file_path: uploaded.filePath,
            status: "pending",
          })
          .eq("id", ownershipProof.id);
        if (updateError) throw new Error(updateError.message);
        savedDoc = {
          id: ownershipProof.id,
          file_url: uploaded.fileUrl,
          file_path: uploaded.filePath,
          status: "pending",
        };
      } else {
        const { data: inserted, error: insertError } = await (supabase
          .from("listing_ownership_documents") as ReturnType<typeof supabase.from>)
          .insert({
            space_id: spaceId,
            owner_id: ownerId,
            document_type: "ownership_proof",
            file_url: uploaded.fileUrl,
            file_path: uploaded.filePath,
            status: "pending",
          })
          .select("id, file_url, file_path, status")
          .single();
        if (insertError) throw new Error(insertError.message);
        savedDoc = inserted as OwnershipDoc;
      }

      const { error: spaceError } = await (supabase.from("spaces") as ReturnType<
        typeof supabase.from
      >)
        .update({ ownership_proof_status: "pending" })
        .eq("id", spaceId);

      if (spaceError) throw new Error(spaceError.message);

      setFile(null);
      setMessage("Ownership proof uploaded. We will review it with your claim.");
      onUploaded(savedDoc);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  const statusLabel = ownershipProofStatus || (ownershipProof ? "pending" : "not uploaded");

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Upload proof that you own or are authorised to manage this space. Examples:
        utility bill, lease agreement, rates document, management letter, or permission
        letter.
      </p>

      {ownershipProof ? (
        <div className="flex items-start gap-3 rounded-xl border border-gray-200 bg-[#f8fafc] p-3">
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-white hover:ring-2 hover:ring-[#0f2740]/20"
            aria-label="View uploaded ownership proof"
          >
            {previewUrl && mimeHint === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt="Ownership proof preview"
                className="h-full w-full object-cover"
              />
            ) : mimeHint === "pdf" ? (
              <FileText className="h-8 w-8 text-[#0f2740]" />
            ) : (
              <ImageIcon className="h-8 w-8 text-gray-400" />
            )}
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-gray-900">
              {displayFileName || "Uploaded document"}
            </p>
            <p className="mt-0.5 text-xs capitalize text-gray-600">
              Status: {statusLabel}
            </p>
            <button
              type="button"
              onClick={() => setPreviewOpen(true)}
              className="mt-1 text-xs font-medium text-[#0f2740] underline"
            >
              View uploaded file
            </button>
          </div>
        </div>
      ) : null}

      <ClaimDocumentPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title="Ownership proof"
        fileName={displayFileName}
        previewUrl={previewUrl}
        mimeHint={mimeHint}
      />

      <label className="block">
        <span className="mb-1 block text-xs font-medium text-gray-700">
          Choose document (PDF or image)
        </span>
        <input
          type="file"
          accept="image/*,.pdf"
          disabled={disabled || uploading}
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm disabled:opacity-60"
        />
      </label>

      <button
        type="button"
        onClick={() => void handleUpload()}
        disabled={disabled || uploading || !file}
        className="inline-flex items-center gap-2 rounded-lg bg-[#0f2740] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
      >
        {uploading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Uploading…
          </>
        ) : ownershipProof ? (
          "Replace ownership proof"
        ) : (
          "Upload ownership proof"
        )}
      </button>

      {message ? (
        <p
          className={`text-sm ${
            message.includes("uploaded") ? "text-emerald-800" : "text-gray-700"
          }`}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
