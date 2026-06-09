"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { uploadOwnerPrivateFile } from "@/lib/owner-private-upload";
import { LISTING_OWNERSHIP_BUCKET } from "@/lib/verification-storage";

type OwnershipDoc = {
  id: string;
  file_url: string;
  file_path: string | null;
  status: string | null;
};

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
  onUploaded: () => void;
  disabled?: boolean;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");

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

      if (ownershipProof?.id) {
        const { error: updateError } = await (supabase
          .from("listing_ownership_documents") as any)
          .update({
            file_url: uploaded.fileUrl,
            file_path: uploaded.filePath,
            status: "pending",
          })
          .eq("id", ownershipProof.id);
        if (updateError) throw new Error(updateError.message);
      } else {
        const { error: insertError } = await (supabase
          .from("listing_ownership_documents") as any)
          .insert({
            space_id: spaceId,
            owner_id: ownerId,
            document_type: "ownership_proof",
            file_url: uploaded.fileUrl,
            file_path: uploaded.filePath,
            status: "pending",
          });
        if (insertError) throw new Error(insertError.message);
      }

      const { error: spaceError } = await (supabase.from("spaces") as any)
        .update({ ownership_proof_status: "pending" })
        .eq("id", spaceId);

      if (spaceError) throw new Error(spaceError.message);

      setFile(null);
      setMessage("Ownership proof uploaded. We will review it with your claim.");
      onUploaded();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  const statusLabel = ownershipProofStatus || "not uploaded";

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Upload proof that you own or are authorised to manage this space. Examples:
        utility bill, lease agreement, rates document, management letter, or permission
        letter.
      </p>

      <div className="rounded-lg border border-gray-200 bg-[#f8fafc] px-3 py-2 text-sm text-gray-700">
        Status: <span className="font-medium capitalize">{statusLabel}</span>
        {ownershipProof?.file_url ? (
          <>
            {" · "}
            <a
              href={ownershipProof.file_url}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-[#0f2740] underline"
            >
              View uploaded file
            </a>
          </>
        ) : null}
      </div>

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
