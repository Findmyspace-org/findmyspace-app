"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import FileUploadField from "@/app/dashboard/verification/_components/FileUploadField";
import { uploadOwnerPrivateFile } from "@/lib/owner-private-upload";
import {
  createVerificationSignedUrl,
  OWNER_VERIFICATION_BUCKET,
} from "@/lib/verification-storage";
import { supabase } from "@/lib/supabase";

type IdDoc = {
  id: string;
  document_type: string;
  file_path: string | null;
  file_url: string | null;
  status: string | null;
};

export function ClaimIdentityUpload({
  ownerId,
  disabled = false,
  onUploaded,
  onStatusChange,
}: {
  ownerId: string;
  disabled?: boolean;
  onUploaded: () => void;
  onStatusChange?: (status: { hasIdFront: boolean; hasIdBack: boolean }) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [idFrontFile, setIdFrontFile] = useState<File | null>(null);
  const [idBackFile, setIdBackFile] = useState<File | null>(null);
  const [docs, setDocs] = useState<IdDoc[]>([]);
  const [previewUrls, setPreviewUrls] = useState<{
    id_front: string | null;
    id_back: string | null;
  }>({ id_front: null, id_back: null });

  const loadDocs = useCallback(async () => {
    if (!ownerId) return;
    setLoading(true);
    const { data } = await supabase
      .from("owner_verification_documents")
      .select("id, document_type, file_path, file_url, status")
      .eq("owner_id", ownerId);

    const list = (data as IdDoc[]) || [];
    setDocs(list);

    const idFront = list.find((d) => d.document_type === "id_front");
    const idBack = list.find((d) => d.document_type === "id_back");
    const [idFrontUrl, idBackUrl] = await Promise.all([
      createVerificationSignedUrl(
        supabase,
        OWNER_VERIFICATION_BUCKET,
        idFront?.file_path,
        idFront?.file_url
      ),
      createVerificationSignedUrl(
        supabase,
        OWNER_VERIFICATION_BUCKET,
        idBack?.file_path,
        idBack?.file_url
      ),
    ]);
    setPreviewUrls({ id_front: idFrontUrl, id_back: idBackUrl });
    onStatusChange?.({
      hasIdFront: list.some((d) => d.document_type === "id_front"),
      hasIdBack: list.some((d) => d.document_type === "id_back"),
    });
    setLoading(false);
  }, [ownerId, onStatusChange]);

  useEffect(() => {
    void loadDocs();
  }, [loadDocs]);

  const idFrontDoc = docs.find((d) => d.document_type === "id_front");
  const idBackDoc = docs.find((d) => d.document_type === "id_back");
  const hasIdFront = Boolean(idFrontDoc);
  const hasIdBack = Boolean(idBackDoc);

  function displayFileName(doc: IdDoc | undefined): string | null {
    if (!doc) return null;
    const path = doc.file_path || doc.file_url;
    if (!path) return null;
    const segment = path.split("/").pop();
    return segment || null;
  }

  async function handleUpload() {
    if (!idFrontFile && !idBackFile) {
      setMessage("Choose at least one ID image to upload.");
      return;
    }
    setUploading(true);
    setMessage("");
    try {
      const docsToInsert: {
        owner_id: string;
        document_type: string;
        file_url: string;
        file_path: string;
        status: string;
      }[] = [];

      if (idFrontFile) {
        const uploaded = await uploadOwnerPrivateFile(
          OWNER_VERIFICATION_BUCKET,
          ownerId,
          idFrontFile,
          "id-front"
        );
        docsToInsert.push({
          owner_id: ownerId,
          document_type: "id_front",
          file_url: uploaded.filePath,
          file_path: uploaded.filePath,
          status: "pending",
        });
      }

      if (idBackFile) {
        const uploaded = await uploadOwnerPrivateFile(
          OWNER_VERIFICATION_BUCKET,
          ownerId,
          idBackFile,
          "id-back"
        );
        docsToInsert.push({
          owner_id: ownerId,
          document_type: "id_back",
          file_url: uploaded.filePath,
          file_path: uploaded.filePath,
          status: "pending",
        });
      }

      if (docsToInsert.length > 0) {
        const { error: docsError } = await (supabase
          .from("owner_verification_documents") as ReturnType<typeof supabase.from>)
          .insert(docsToInsert);
        if (docsError) throw new Error(docsError.message);

        const { error: profileError } = await (supabase.from("profiles") as ReturnType<
          typeof supabase.from
        >)
          .update({
            is_host: true,
            owner_verification_status: "pending",
          })
          .eq("id", ownerId);
        if (profileError) throw new Error(profileError.message);

        try {
          await fetch("/api/notifications/verification-event", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              userId: ownerId,
              eventType: "identity_submitted",
            }),
          });
        } catch {
          /* non-blocking */
        }
      }

      setIdFrontFile(null);
      setIdBackFile(null);
      setMessage("ID documents uploaded. We will review them with your claim.");
      await loadDocs();
      onUploaded();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-sm text-gray-600">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading identity documents…
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <FileUploadField
        label="ID front"
        selectedFile={idFrontFile}
        hasUploaded={hasIdFront}
        previewUrl={previewUrls.id_front}
        uploadedFileName={displayFileName(idFrontDoc)}
        statusHint={
          hasIdFront
            ? "Uploaded — pending review"
            : "Passport, driver licence, or national ID"
        }
        uploadedLabel="ID front uploaded"
        onFileChange={setIdFrontFile}
        disabled={disabled || uploading}
      />
      <FileUploadField
        label="ID back"
        selectedFile={idBackFile}
        hasUploaded={hasIdBack}
        previewUrl={previewUrls.id_back}
        uploadedFileName={displayFileName(idBackDoc)}
        statusHint={
          hasIdBack
            ? "Uploaded — pending review"
            : "Back of the same document"
        }
        uploadedLabel="ID back uploaded"
        onFileChange={setIdBackFile}
        disabled={disabled || uploading}
      />

      {(idFrontFile || idBackFile) && !disabled ? (
        <button
          type="button"
          disabled={uploading}
          onClick={() => void handleUpload()}
          className="inline-flex items-center gap-2 rounded-lg bg-[#0f2740] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {uploading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Uploading…
            </>
          ) : (
            "Upload ID documents"
          )}
        </button>
      ) : null}

      {message ? (
        <p
          className={`text-sm ${
            message.includes("uploaded") ? "text-emerald-800" : "text-gray-700"
          }`}
        >
          {message}
        </p>
      ) : null}

      <p className="text-xs text-gray-500">
        Need to update other verification details?{" "}
        <a
          href="/dashboard/verification?step=identity"
          className="font-medium text-[#0f2740] underline"
        >
          Open full verification page
        </a>
      </p>
    </div>
  );
}
