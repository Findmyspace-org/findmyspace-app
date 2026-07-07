"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  fetchMarketingListDetail,
  previewMarketingRecipients,
  updateMarketingList,
} from "@/lib/crm-marketing/api-client";
import type { RecipientPreviewResult } from "@/lib/crm-marketing/types";

export default function MarketingListDetailPage() {
  const params = useParams<{ id: string }>();
  const [listName, setListName] = useState("");
  const [description, setDescription] = useState("");
  const [rows, setRows] = useState<Array<Record<string, unknown>>>([]);
  const [total, setTotal] = useState(0);
  const [preview, setPreview] = useState<RecipientPreviewResult | null>(null);
  const [isSystem, setIsSystem] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchMarketingListDetail(params.id);
      setListName(result.list.name as string);
      setDescription((result.list.description as string | null) || "");
      setIsSystem(Boolean(result.list.is_system));
      setRows(result.rows as unknown as Array<Record<string, unknown>>);
      setTotal(result.total);
      const previewResult = await previewMarketingRecipients({ listIds: [params.id] });
      setPreview(previewResult);
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <p className="text-sm text-gray-500">Loading list…</p>;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h1 className="text-lg font-semibold text-[#192a3a]">{listName}</h1>
        {isSystem ? <p className="text-xs uppercase text-gray-400">System list</p> : null}
        {!isSystem ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <input value={listName} onChange={(e) => setListName(e.target.value)} className="rounded-lg border border-gray-200 p-2 text-sm" />
            <input value={description} onChange={(e) => setDescription(e.target.value)} className="rounded-lg border border-gray-200 p-2 text-sm" />
          </div>
        ) : (
          <p className="mt-2 text-sm text-gray-600">{description || "No description"}</p>
        )}
        {!isSystem ? (
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() =>
                void updateMarketingList(params.id, { name: listName, description }).then(() => load())
              }
              className="rounded-lg border px-3 py-2 text-sm"
            >
              Save changes
            </button>
            <button
              type="button"
              onClick={() =>
                void updateMarketingList(params.id, { action: "archive" }).then(() => load())
              }
              className="rounded-lg border px-3 py-2 text-sm"
            >
              Archive list
            </button>
          </div>
        ) : null}
      </div>

      {preview ? (
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="rounded-lg border bg-white p-4"><p className="text-xs text-gray-500">Total members</p><p className="text-2xl font-semibold">{total}</p></div>
          <div className="rounded-lg border bg-white p-4"><p className="text-xs text-gray-500">Eligible recipients</p><p className="text-2xl font-semibold">{preview.eligibleRecipients}</p></div>
          <div className="rounded-lg border bg-white p-4"><p className="text-xs text-gray-500">Excluded</p><p className="text-2xl font-semibold">{preview.excludedRecipients}</p></div>
          <div className="rounded-lg border bg-white p-4"><p className="text-xs text-gray-500">Duplicate emails</p><p className="text-2xl font-semibold">{preview.duplicateEmailCount}</p></div>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Organisation</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Sendable</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={String(row.marketing_contact_id)} className="border-t border-gray-100">
                <td className="px-4 py-3">{String(row.contact_name)}</td>
                <td className="px-4 py-3">{String(row.organisation_name || "—")}</td>
                <td className="px-4 py-3">{String(row.email || "—")}</td>
                <td className="px-4 py-3">{String(row.status)}</td>
                <td className="px-4 py-3">{row.sendable ? "Yes" : String(row.eligibility_reason)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Link href="/admin/crm/marketing/lists" className="text-sm text-[#c1121f] hover:underline">
        Back to lists
      </Link>
    </div>
  );
}
