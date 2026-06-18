"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { FileUp, Loader2 } from "lucide-react";
import MarkdownDescriptionEditor from "@/app/components/MarkdownDescriptionEditor";
import { SectionInlineAlert } from "@/app/components/SectionInlineAlert";
import { adminApiFetch } from "@/lib/admin-api-client";
import { ownerApiFetch } from "@/lib/owner-api-client";
import {
  hasAiKnowledgeContent,
  SPACE_AI_MAX_BYTES,
  type SpaceAiDocumentRow,
} from "@/lib/space-ai-knowledge";
import { useSectionFeedback } from "@/lib/use-section-feedback";

type ApiMode = "admin" | "owner";

type SpaceAiInformationPanelProps = {
  spaceId?: string;
  apiMode: ApiMode;
  readOnly?: boolean;
  embedded?: boolean;
};

function aiKnowledgeSavePayload(text: string) {
  return JSON.stringify({ text, text_content: text });
}

function logAiKnowledgeError(action: string, err: unknown) {
  console.error(`AI Information ${action} failed:`, err);
}

function aiKnowledgeUploadError(err: unknown): string {
  if (err instanceof Error) {
    const message = err.message.trim();
    if (
      /unable to extract text from pdf|DOMMatrix|pdfjs|pdf\.js|__next_error__/i.test(
        message
      )
    ) {
      return "Unable to read this PDF. Please try another PDF or upload a DOCX file.";
    }
    if (message && !message.includes("<!DOCTYPE")) {
      return message;
    }
  }
  return "Upload failed. Please try again.";
}

function aiKnowledgeUserError(err: unknown, fallback: string): string {
  if (err instanceof Error) {
    const message = err.message.trim();
    if (message && !message.includes("<!DOCTYPE") && !message.includes("__next_error__")) {
      return message;
    }
  }
  return fallback;
}

function aiDocumentsPath(spaceId: string, apiMode: ApiMode) {
  return apiMode === "admin"
    ? `/api/admin/spaces/${spaceId}/ai-documents`
    : `/api/owner/listings/${spaceId}/ai-documents`;
}

export function SpaceAiInformationPanel({
  spaceId,
  apiMode,
  readOnly = false,
  embedded = false,
}: SpaceAiInformationPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingFlushRef = useRef(false);
  const textRef = useRef("");
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const { status, error, setSuccess, setFailure, clearForAction } = useSectionFeedback();

  const fetchJson = apiMode === "admin" ? adminApiFetch : ownerApiFetch;
  const maxMb = Math.floor(SPACE_AI_MAX_BYTES / (1024 * 1024));

  textRef.current = text;

  const applyDocument = useCallback((document: SpaceAiDocumentRow | null) => {
    if (document && hasAiKnowledgeContent(document.extracted_text)) {
      setText(document.extracted_text);
      setFileName(document.file_name);
      setUpdatedAt(document.updated_at);
    } else {
      setFileName(null);
      setUpdatedAt(null);
    }
  }, []);

  const loadDocument = useCallback(async () => {
    if (!spaceId) return;
    setLoading(true);
    try {
      const result = await fetchJson(aiDocumentsPath(spaceId, apiMode));
      const document =
        (result.document as SpaceAiDocumentRow | null) ??
        ((result.documents as SpaceAiDocumentRow[] | undefined)?.find((row) =>
          hasAiKnowledgeContent(row.extracted_text)
        ) ??
          null);
      applyDocument(document);
    } catch (err) {
      logAiKnowledgeError("load", err);
      setFailure(
        err instanceof Error ? err.message : "Could not load AI Information."
      );
    } finally {
      setLoading(false);
    }
  }, [apiMode, applyDocument, fetchJson, setFailure, spaceId]);

  const saveText = useCallback(async () => {
    if (readOnly) return;
    const trimmed = text.trim();
    if (!trimmed) {
      setFailure("Enter AI Information before saving.");
      return;
    }
    if (!spaceId) {
      pendingFlushRef.current = true;
      setFailure("Save the space first, then click Save AI Information.");
      return;
    }

    setSaving(true);
    clearForAction();
    try {
      await fetchJson(aiDocumentsPath(spaceId, apiMode), {
        method: "PATCH",
        body: aiKnowledgeSavePayload(trimmed),
      });
      setFileName("Manual entry");
      setUpdatedAt(new Date().toISOString());
      pendingFlushRef.current = false;
      setSuccess("AI Information saved.");
    } catch (err) {
      logAiKnowledgeError("save", err);
      setFailure(
        aiKnowledgeUserError(
          err,
          "AI Information could not be saved. Please try again."
        )
      );
    } finally {
      setSaving(false);
    }
  }, [
    apiMode,
    clearForAction,
    fetchJson,
    readOnly,
    setFailure,
    setSuccess,
    spaceId,
    text,
  ]);

  useEffect(() => {
    if (!spaceId) return;

    void (async () => {
      if (pendingFlushRef.current) {
        pendingFlushRef.current = false;
        const trimmed = textRef.current.trim();
        if (!trimmed) return;

        setSaving(true);
        clearForAction();
        try {
          await fetchJson(aiDocumentsPath(spaceId, apiMode), {
            method: "PATCH",
            body: aiKnowledgeSavePayload(trimmed),
          });
          setFileName("Manual entry");
          setUpdatedAt(new Date().toISOString());
          setSuccess("AI Information saved.");
        } catch (err) {
          logAiKnowledgeError("auto-save", err);
          setFailure(
            aiKnowledgeUserError(
              err,
              "AI Information could not be saved. Please try again."
            )
          );
        } finally {
          setSaving(false);
        }
        return;
      }

      await loadDocument();
    })();
  }, [apiMode, clearForAction, fetchJson, loadDocument, setFailure, setSuccess, spaceId]);

  async function handleUpload(fileList: FileList | null) {
    if (readOnly || !spaceId || !fileList?.length) return;

    const file = fileList[0];
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    const mimeOk =
      file.type === "application/pdf" ||
      file.type ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      ext === "pdf" ||
      ext === "docx";

    if (!mimeOk) {
      setFailure("Invalid file type. Upload PDF or DOCX only.");
      return;
    }
    if (file.size <= 0) {
      setFailure("File is empty.");
      return;
    }
    if (file.size > SPACE_AI_MAX_BYTES) {
      setFailure(`File is too large. Maximum size is ${maxMb} MB.`);
      return;
    }

    if (
      hasAiKnowledgeContent(text) &&
      !window.confirm(
        "Uploading a new document will replace the current AI Information text. Continue?"
      )
    ) {
      return;
    }

    setUploading(true);
    clearForAction();
    try {
      const form = new FormData();
      form.append("file", file);
      await fetchJson(aiDocumentsPath(spaceId, apiMode), {
        method: "POST",
        body: form,
      });
      await loadDocument();
      setSuccess("Document uploaded and text extracted.");
    } catch (err) {
      logAiKnowledgeError("upload", err);
      setFailure(aiKnowledgeUploadError(err));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  const wrapperClass = embedded
    ? ""
    : "rounded-xl border border-gray-200 bg-white p-5 shadow-sm";

  return (
    <section className={wrapperClass}>
      {!embedded ? (
        <>
          <h2 className="text-lg font-semibold text-gray-900">AI Information</h2>
          <p className="mt-2 text-sm text-gray-600">
            Upload a PDF or Word document, or paste information directly. This
            information helps the space assistant answer guest questions.
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Contact details and access information may be stored here, but will
            only be shown to guests after a confirmed paid booking.
          </p>
        </>
      ) : null}

      <div className={embedded ? "space-y-4" : "mt-4 space-y-4"}>
        {loading ? (
          <p className="flex items-center gap-2 text-sm text-gray-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading AI Information…
          </p>
        ) : null}

        {(fileName || updatedAt) && !loading ? (
          <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
            {fileName ? (
              <p>
                <span className="font-medium text-gray-700">Source:</span>{" "}
                {fileName}
              </p>
            ) : null}
            {updatedAt ? (
              <p className={fileName ? "mt-1" : ""}>
                <span className="font-medium text-gray-700">Last updated:</span>{" "}
                {format(new Date(updatedAt), "dd MMM yyyy, HH:mm")}
              </p>
            ) : null}
          </div>
        ) : null}

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">
            AI Information text
          </label>
          <MarkdownDescriptionEditor
            value={text}
            onChange={setText}
            rows={8}
            disabled={readOnly || loading}
            placeholder="Paste or type rules, capacity, parking, setup instructions, catering details, access information, emergency contacts, FAQs…"
          />
        </div>

        {!readOnly ? (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={saving || loading || uploading}
                onClick={() => void saveText()}
                className="rounded-lg bg-[#0f2740] px-4 py-2 text-sm font-semibold text-white hover:opacity-95 disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save AI Information"}
              </button>

              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="hidden"
                disabled={!spaceId || uploading || saving}
                onChange={(event) => void handleUpload(event.target.files)}
              />
              <button
                type="button"
                disabled={!spaceId || uploading || saving || loading}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {uploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileUp className="h-4 w-4" />
                )}
                {uploading ? "Uploading…" : "Upload document"}
              </button>

              {!spaceId ? (
                <p className="text-xs text-gray-500">
                  Save the space first to upload a document.
                </p>
              ) : (
                <p className="text-xs text-gray-500">PDF or DOCX, up to {maxMb} MB.</p>
              )}
            </div>

            <SectionInlineAlert status={status} error={error} />
          </>
        ) : null}
      </div>
    </section>
  );
}
