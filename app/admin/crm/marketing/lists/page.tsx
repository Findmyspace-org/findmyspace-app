"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  createMarketingList,
  fetchMarketingLists,
} from "@/lib/crm-marketing/api-client";
import type { CrmMarketingListRow } from "@/lib/crm-marketing/types";

export default function MarketingListsPage() {
  const [lists, setLists] = useState<CrmMarketingListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      setLists(await fetchMarketingLists(true));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleCreate() {
    if (!name.trim()) return;
    await createMarketingList({ name, description });
    setName("");
    setDescription("");
    setMessage("List created.");
    void load();
  }

  if (loading) return <p className="text-sm text-gray-500">Loading lists…</p>;

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-[#192a3a]">Create manual list</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="List name" className="rounded-lg border border-gray-200 p-2 text-sm" />
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" className="rounded-lg border border-gray-200 p-2 text-sm" />
        </div>
        <button type="button" onClick={() => void handleCreate()} className="mt-3 rounded-lg bg-[#192a3a] px-4 py-2 text-sm text-white">
          Create list
        </button>
        {message ? <p className="mt-2 text-sm text-emerald-700">{message}</p> : null}
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">List</th>
              <th className="px-4 py-3">Members</th>
              <th className="px-4 py-3">Sendable</th>
              <th className="px-4 py-3">Pending</th>
              <th className="px-4 py-3">Suppressed</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {lists.map((list) => (
              <tr key={list.id} className="border-t border-gray-100">
                <td className="px-4 py-3">
                  <p className="font-medium">{list.name}</p>
                  {list.description ? <p className="text-xs text-gray-500">{list.description}</p> : null}
                  {list.is_system ? <span className="text-[10px] uppercase text-gray-400">System</span> : null}
                  {!list.active ? <span className="text-[10px] uppercase text-amber-700">Archived</span> : null}
                </td>
                <td className="px-4 py-3">{list.total_members}</td>
                <td className="px-4 py-3">{list.sendable_members}</td>
                <td className="px-4 py-3">{list.pending_consent}</td>
                <td className="px-4 py-3">{list.suppressed_members}</td>
                <td className="px-4 py-3">
                  <Link href={`/admin/crm/marketing/lists/${list.id}`} className="text-[#c1121f] hover:underline">
                    Open
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Link href="/admin/crm/marketing" className="text-sm text-[#c1121f] hover:underline">
        Back to marketing overview
      </Link>
    </div>
  );
}
