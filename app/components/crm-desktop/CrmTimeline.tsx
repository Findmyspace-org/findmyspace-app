"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type {
  CrmContact,
  CrmEngagement,
  CrmProfile,
  CrmTask,
} from "@/lib/space-place/types";
import type { CrmEmailMessageWithRelations } from "@/lib/space-place/types";
import { displayName, formatDateTime } from "@/lib/space-place/format";
import {
  ENGAGEMENT_FILTERS,
  engagementTypeIcon,
  engagementTypeLabel,
  matchesEngagementFilter,
  type EngagementFilter,
} from "@/lib/space-place/engagement-ui";

export type CrmTimelineEngagement = CrmEngagement & {
  crm_contacts?: Pick<CrmContact, "id" | "full_name" | "first_name" | "last_name"> | null;
  contact?: Pick<CrmContact, "id" | "full_name" | "first_name" | "last_name"> | null;
  creator?: Pick<CrmProfile, "id" | "full_name"> | null;
};

export type CrmTimelineItem = {
  id: string;
  kind: "engagement" | "task" | "email";
  type: string;
  occurred_at: string;
  summary: string | null;
  outcome: string | null;
  contact_id: string | null;
  contact_name: string | null;
  creator_name: string | null;
  status?: string;
  related_task_id?: string | null;
  detail?: string | null;
};

type Props = {
  engagements: CrmTimelineEngagement[];
  tasks: CrmTask[];
  emails?: CrmEmailMessageWithRelations[];
  organisationName?: string;
  loading?: boolean;
};

function relatedFollowUpTask(
  engagement: CrmTimelineEngagement,
  tasks: CrmTask[]
): CrmTask | undefined {
  const occurred = new Date(engagement.occurred_at).getTime();
  return tasks
    .filter((t) => {
      if (t.status === "cancelled") return false;
      if (t.organisation_id !== engagement.organisation_id) return false;
      if (
        engagement.contact_id &&
        t.contact_id &&
        t.contact_id !== engagement.contact_id
      ) {
        return false;
      }
      return new Date(t.created_at).getTime() >= occurred - 60_000;
    })
    .sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )[0];
}

export function CrmTimeline({
  engagements,
  tasks,
  emails = [],
  organisationName,
  loading,
}: Props) {
  const [filter, setFilter] = useState<EngagementFilter | "tasks">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const items = useMemo(() => {
    const rows: CrmTimelineItem[] = [];

    for (const e of engagements) {
      const contact = e.contact || e.crm_contacts;
      rows.push({
        id: `eng-${e.id}`,
        kind: "engagement",
        type: e.type,
        occurred_at: e.occurred_at,
        summary: e.summary,
        outcome: e.outcome,
        contact_id: e.contact_id,
        contact_name: contact
          ? displayName(contact.full_name, contact.first_name, contact.last_name)
          : null,
        creator_name: e.creator?.full_name ?? null,
        related_task_id: relatedFollowUpTask(e, tasks)?.id ?? null,
        detail: e.outcome,
      });
    }

    for (const t of tasks) {
      rows.push({
        id: `task-${t.id}`,
        kind: "task",
        type: t.status === "done" ? "task_done" : "task",
        occurred_at: t.completed_at || t.due_date || t.created_at,
        summary: t.title,
        outcome: t.description,
        contact_id: t.contact_id,
        contact_name: null,
        creator_name: null,
        status: t.status,
        detail: t.description,
      });
    }

    for (const em of emails) {
      rows.push({
        id: `email-${em.id}`,
        kind: "email",
        type: "email",
        occurred_at: em.sent_at || em.imported_at,
        summary: em.subject,
        outcome: em.body_text?.slice(0, 280) ?? null,
        contact_id: em.contact_id,
        contact_name: em.crm_contacts?.full_name ?? null,
        creator_name: null,
        detail: em.body_text,
      });
    }

    return rows.sort(
      (a, b) =>
        new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime()
    );
  }, [engagements, tasks, emails]);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (filter === "all") return true;
      if (filter === "tasks") {
        return item.kind === "task";
      }
      if (item.kind === "email") return filter === "email";
      return matchesEngagementFilter(item.type, filter);
    });
  }, [items, filter]);

  if (loading) {
    return <p className="text-sm text-gray-500">Loading timeline…</p>;
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
        {ENGAGEMENT_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              filter === f.value
                ? "bg-[#192a3a] text-white"
                : "bg-gray-100 text-gray-700"
            }`}
          >
            {f.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setFilter("tasks")}
          className={`rounded-full px-3 py-1 text-xs font-medium ${
            filter === "tasks"
              ? "bg-[#192a3a] text-white"
              : "bg-gray-100 text-gray-700"
          }`}
        >
          Tasks
        </button>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-gray-500">No activity in this filter.</p>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
          {filtered.map((item) => {
            const Icon = engagementTypeIcon(item.type);
            const expanded = expandedId === item.id;
            return (
              <li key={item.id} className="px-4 py-3">
                <button
                  type="button"
                  className="flex w-full items-start gap-3 text-left"
                  onClick={() =>
                    setExpandedId(expanded ? null : item.id)
                  }
                >
                  <span className="mt-0.5 rounded-full bg-gray-100 p-2">
                    <Icon className="h-4 w-4 text-gray-600" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-[#192a3a]">
                        {engagementTypeLabel(item.type)}
                        {item.status === "done" ? " (completed)" : ""}
                      </span>
                      <span className="text-xs text-gray-500">
                        {formatDateTime(item.occurred_at)}
                      </span>
                    </span>
                    {organisationName ? (
                      <span className="text-xs text-gray-500">
                        {organisationName}
                      </span>
                    ) : null}
                    {item.contact_name ? (
                      <span className="block text-xs text-gray-500">
                        Contact: {item.contact_name}
                      </span>
                    ) : null}
                    {item.creator_name ? (
                      <span className="block text-xs text-gray-500">
                        By {item.creator_name}
                      </span>
                    ) : null}
                    <span className="mt-1 block text-sm text-gray-700">
                      {item.summary || "—"}
                    </span>
                    {item.outcome && !expanded ? (
                      <span className="mt-1 block truncate text-xs text-gray-500">
                        {item.outcome}
                      </span>
                    ) : null}
                  </span>
                </button>
                {expanded && item.detail ? (
                  <p className="mt-2 whitespace-pre-wrap pl-11 text-sm text-gray-600">
                    {item.detail}
                  </p>
                ) : null}
                {item.related_task_id ? (
                  <p className="mt-1 pl-11 text-xs text-[#c1121f]">
                    Follow-up task created
                  </p>
                ) : null}
                {item.contact_id ? (
                  <Link
                    href={`/admin/crm/contacts/${item.contact_id}`}
                    className="mt-1 block pl-11 text-xs text-[#c1121f] hover:underline"
                  >
                    View contact
                  </Link>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
