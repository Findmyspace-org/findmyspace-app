"use client";
import { crmDb } from "@/lib/space-place/db";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { formatDateTime } from "@/lib/space-place/format";
import type { CrmEngagementWithRelations } from "@/lib/space-place/types";
import { Card, PageTitle } from "../components/SpacePlaceShell";

export default function ActivityPage() {
  const [items, setItems] = useState<CrmEngagementWithRelations[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: rows } = await crmDb.engagements()
      .select(
        `*,
        crm_organisations ( id, name ),
        crm_contacts ( id, full_name )`
      )
      .order("occurred_at", { ascending: false })
      .limit(100);
    const { data: profs } = await crmDb.profiles()
      .select("id, full_name");
    const nameMap = Object.fromEntries(
      ((profs as { id: string; full_name: string | null }[]) || []).map((p) => [
        p.id,
        p.full_name,
      ])
    );
    const enriched = ((rows as CrmEngagementWithRelations[]) || []).map((e) => ({
      ...e,
      creator_profile: e.created_by
        ? { id: e.created_by, full_name: nameMap[e.created_by] || null }
        : null,
    }));
    setItems(enriched);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <PageTitle title="Activity" subtitle="Recent conversations and notes" />
      {loading ? (
        <p className="text-neutral-600">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-neutral-500">No activity yet.</p>
      ) : (
        items.map((e) => (
          <Card key={e.id} className="mb-3">
            <p className="text-xs font-medium uppercase text-neutral-500">
              {formatDateTime(e.occurred_at)} · {e.type}
            </p>
            <Link
              href={`/space-place/organisations/${e.organisation_id}`}
              className="mt-1 block text-lg font-semibold"
            >
              {e.crm_organisations?.name}
            </Link>
            {e.crm_contacts?.full_name ? (
              <p className="text-sm text-neutral-600">{e.crm_contacts.full_name}</p>
            ) : null}
            <p className="mt-2 text-base">{e.summary || "—"}</p>
            <p className="mt-2 text-sm text-neutral-500">
              {e.creator_profile?.full_name || "Unknown"}
            </p>
          </Card>
        ))
      )}
    </div>
  );
}
