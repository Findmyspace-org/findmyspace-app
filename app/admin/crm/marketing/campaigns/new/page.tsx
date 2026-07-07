"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  CAMPAIGN_AUDIENCE_WARNING,
  MARKETING_COMPLIANCE_NOTICE,
} from "@/lib/crm-marketing/constants";
import {
  fetchMarketingLists,
  previewMarketingRecipients,
  saveMarketingCampaignDraft,
} from "@/lib/crm-marketing/api-client";
import type { RecipientPreviewResult } from "@/lib/crm-marketing/types";

export default function NewMarketingCampaignPage() {
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [previewText, setPreviewText] = useState("");
  const [senderName, setSenderName] = useState("FindMySpace");
  const [replyTo, setReplyTo] = useState("");
  const [listIds, setListIds] = useState<string[]>([]);
  const [lists, setLists] = useState<{ id: string; name: string }[]>([]);
  const [preview, setPreview] = useState<RecipientPreviewResult | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void fetchMarketingLists().then((items) =>
      setLists(items.map((list) => ({ id: list.id, name: list.name })))
    );
  }, []);

  async function runPreview() {
    const result = await previewMarketingRecipients({ listIds });
    setPreview(result);
  }

  async function saveDraft() {
    const result = await saveMarketingCampaignDraft({
      name,
      subject,
      previewText,
      senderName,
      replyTo,
      listIds,
    });
    setMessage(`Draft saved. Campaign ID: ${result.campaignId}`);
    setPreview(result.preview as RecipientPreviewResult);
  }

  return (
    <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-6">
      <h2 className="text-lg font-semibold text-[#192a3a]">New campaign (draft)</h2>
      <p className="text-sm text-gray-600">{MARKETING_COMPLIANCE_NOTICE}</p>
      <p className="text-sm font-medium text-amber-900">{CAMPAIGN_AUDIENCE_WARNING}</p>
      <p className="text-sm text-gray-600">
        Bulk sending is not enabled. This form saves a draft audience definition only.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Campaign name" className="rounded-lg border border-gray-200 p-2 text-sm" />
        <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" className="rounded-lg border border-gray-200 p-2 text-sm" />
        <input value={previewText} onChange={(e) => setPreviewText(e.target.value)} placeholder="Preview text" className="rounded-lg border border-gray-200 p-2 text-sm" />
        <input value={senderName} onChange={(e) => setSenderName(e.target.value)} placeholder="Sender name" className="rounded-lg border border-gray-200 p-2 text-sm" />
        <input value={replyTo} onChange={(e) => setReplyTo(e.target.value)} placeholder="Reply-to" className="rounded-lg border border-gray-200 p-2 text-sm sm:col-span-2" />
      </div>

      <fieldset className="rounded-lg border border-gray-200 p-3">
        <legend className="px-1 text-sm font-semibold">Selected lists</legend>
        <div className="mt-2 space-y-2">
          {lists.map((list) => (
            <label key={list.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={listIds.includes(list.id)}
                onChange={(e) => {
                  setListIds((prev) =>
                    e.target.checked ? [...prev, list.id] : prev.filter((id) => id !== list.id)
                  );
                }}
              />
              {list.name}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void runPreview()} className="rounded-lg border px-4 py-2 text-sm">
          Preview recipients
        </button>
        <button type="button" onClick={() => void saveDraft()} className="rounded-lg bg-[#192a3a] px-4 py-2 text-sm text-white">
          Save draft
        </button>
      </div>

      {preview ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm">
          <p>Total matching: {preview.totalMatching}</p>
          <p>Eligible recipients: {preview.eligibleRecipients}</p>
          <p>Excluded recipients: {preview.excludedRecipients}</p>
          <p>Duplicate emails: {preview.duplicateEmailCount}</p>
        </div>
      ) : null}

      {message ? <p className="text-sm text-emerald-700">{message}</p> : null}

      <Link href="/admin/crm/marketing/campaigns" className="text-sm text-[#c1121f] hover:underline">
        Back to campaigns
      </Link>
    </div>
  );
}
