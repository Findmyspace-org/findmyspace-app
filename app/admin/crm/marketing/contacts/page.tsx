"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getBrowserAccessToken } from "@/lib/supabase-browser-session";
import { CrmDataTable, CrmPagination } from "@/app/components/crm-desktop/CrmDataTable";
import { CrmMarketingContactDrawer } from "@/app/components/crm-desktop/CrmMarketingContactDrawer";
import {
  fetchMarketingContacts,
  fetchMarketingLists,
  marketingContactsExportUrl,
  postMarketingBulkAction,
  previewMarketingRecipients,
} from "@/lib/crm-marketing/api-client";
import type { CrmMarketingContactRow } from "@/lib/crm-marketing/types";

function MarketingContactsInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const page = Number(searchParams.get("page") || "1") || 1;
  const [rows, setRows] = useState<CrmMarketingContactRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [lists, setLists] = useState<{ id: string; name: string }[]>([]);
  const [bulkListId, setBulkListId] = useState("");
  const [bulkMessage, setBulkMessage] = useState<string | null>(null);

  const filterParams = useMemo(
    () => ({
      q: searchParams.get("q") || undefined,
      status: searchParams.get("status") || undefined,
      consent: searchParams.get("consent") || undefined,
      basis: searchParams.get("basis") || undefined,
      org: searchParams.get("org") || undefined,
      sendable: searchParams.get("sendable") || undefined,
      list: searchParams.get("list") || undefined,
      review: searchParams.get("review") || undefined,
      page,
    }),
    [searchParams, page]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchMarketingContacts(filterParams);
      setRows(result.rows);
      setTotal(result.total);
    } finally {
      setLoading(false);
    }
  }, [filterParams]);

  useEffect(() => {
    void load();
    void fetchMarketingLists().then((items) =>
      setLists(items.map((list) => ({ id: list.id, name: list.name })))
    );
  }, [load]);

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function runBulk(action: "add_to_list" | "remove_from_list" | "suppress") {
    if (!selected.size) return;
    const preview = await previewMarketingRecipients({
      marketingContactIds: [...selected],
    });
    const confirmed = window.confirm(
      `${selected.size} selected. ${preview.eligibleRecipients} eligible, ${preview.excludedRecipients} excluded. Continue?`
    );
    if (!confirmed) return;

    await postMarketingBulkAction({
      action,
      marketingContactIds: [...selected],
      listId: bulkListId || undefined,
      suppressionReason: action === "suppress" ? "internal_block" : undefined,
    });
    setBulkMessage("Bulk action completed.");
    setSelected(new Set());
    void load();
  }

  async function exportCsv() {
    const token = await getBrowserAccessToken();
    if (!token) return;
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filterParams)) {
      if (value !== undefined && key !== "page") params.set(key, String(value));
    }
    if (selected.size) params.set("ids", [...selected].join(","));
    const res = await fetch(marketingContactsExportUrl(Object.fromEntries(params)), {
      headers: { Authorization: `Bearer ${token}` },
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "marketing-contacts.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white p-4">
        <label className="text-sm">
          Search
          <input
            defaultValue={searchParams.get("q") || ""}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                const next = new URLSearchParams(searchParams.toString());
                const value = (e.target as HTMLInputElement).value.trim();
                if (value) next.set("q", value);
                else next.delete("q");
                router.push(`/admin/crm/marketing/contacts?${next.toString()}`);
              }
            }}
            className="mt-1 block w-48 rounded-lg border border-gray-200 p-2 text-sm"
          />
        </label>
        <select
          value={bulkListId}
          onChange={(e) => setBulkListId(e.target.value)}
          className="rounded-lg border border-gray-200 p-2 text-sm"
        >
          <option value="">Bulk list…</option>
          {lists.map((list) => (
            <option key={list.id} value={list.id}>{list.name}</option>
          ))}
        </select>
        <button type="button" onClick={() => void runBulk("add_to_list")} className="rounded-lg border px-3 py-2 text-sm">Add to list</button>
        <button type="button" onClick={() => void runBulk("remove_from_list")} className="rounded-lg border px-3 py-2 text-sm">Remove from list</button>
        <button type="button" onClick={() => void runBulk("suppress")} className="rounded-lg border px-3 py-2 text-sm">Suppress selected</button>
        <button type="button" onClick={() => void exportCsv()} className="rounded-lg border px-3 py-2 text-sm">Export CSV</button>
        {bulkMessage ? <p className="text-sm text-emerald-700">{bulkMessage}</p> : null}
      </div>

      <CrmDataTable
        loading={loading}
        rows={rows as unknown as Record<string, unknown>[]}
        columns={[
          {
            key: "select",
            header: "",
            render: (row) => {
              const r = row as unknown as CrmMarketingContactRow;
              return (
                <input
                  type="checkbox"
                  checked={selected.has(r.id)}
                  onChange={() => toggleRow(r.id)}
                  aria-label={`Select ${r.contact_name}`}
                />
              );
            },
          },
          {
            key: "contact",
            header: "Contact",
            render: (row) => {
              const r = row as unknown as CrmMarketingContactRow;
              return (
                <button
                  type="button"
                  onClick={() => setDrawerId(r.id)}
                  className="font-medium text-left hover:text-[#c1121f]"
                >
                  {r.contact_name}
                </button>
              );
            },
          },
          {
            key: "org",
            header: "Organisation",
            render: (row) => (row as unknown as CrmMarketingContactRow).organisation_name || "—",
          },
          { key: "email", header: "Email", render: (row) => (row as unknown as CrmMarketingContactRow).email || "—" },
          { key: "status", header: "Status", render: (row) => (row as unknown as CrmMarketingContactRow).status },
          { key: "consent", header: "Consent", render: (row) => (row as unknown as CrmMarketingContactRow).consent_status },
          {
            key: "sendable",
            header: "Sendable",
            render: (row) => {
              const r = row as unknown as CrmMarketingContactRow;
              return r.sendable ? "Yes" : "No";
            },
          },
          {
            key: "lists",
            header: "Lists",
            render: (row) => (row as unknown as CrmMarketingContactRow).lists.join(", ") || "—",
          },
        ]}
      />
      <CrmPagination
        page={page}
        pageSize={25}
        total={total}
        onPageChange={(nextPage) => {
          const next = new URLSearchParams(searchParams.toString());
          next.set("page", String(nextPage));
          router.push(`/admin/crm/marketing/contacts?${next.toString()}`);
        }}
      />
      <CrmMarketingContactDrawer
        marketingContactId={drawerId}
        onClose={() => setDrawerId(null)}
        onUpdated={() => void load()}
      />
    </div>
  );
}

export default function MarketingContactsPage() {
  return (
    <Suspense fallback={<p className="text-sm text-gray-500">Loading…</p>}>
      <MarketingContactsInner />
    </Suspense>
  );
}
