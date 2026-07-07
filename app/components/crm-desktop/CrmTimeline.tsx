"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { CrmContact, CrmTask } from "@/lib/space-place/types";
import type { CrmEmailMessageWithRelations } from "@/lib/space-place/types";
import { formatDateTime } from "@/lib/space-place/format";
import {
  ENGAGEMENT_FILTERS,
  engagementTypeIcon,
  engagementTypeLabel,
  matchesEngagementFilter,
  type EngagementFilter,
} from "@/lib/space-place/engagement-ui";
import {
  buildCrmTimelineItems,
  type CrmTimelineEngagementInput,
  type CrmTimelineItem,
} from "@/lib/crm-desktop/timeline-items";

export type { CrmTimelineEngagementInput as CrmTimelineEngagement, CrmTimelineItem };

type Props = {
  engagements: CrmTimelineEngagementInput[];
  tasks: CrmTask[];
  emails?: CrmEmailMessageWithRelations[];
  organisationName?: string;
  organisationId?: string;
  contacts?: CrmContact[];
  loading?: boolean;
  onTaskOpen?: (item: CrmTimelineItem) => void;
};

function timelineTypeLabel(item: CrmTimelineItem): string {
  if (item.kind === "task") {
    return item.task_status === "done" ? "Task completed" : "Open task";
  }
  if (item.type === "task") return "Task completed";
  return engagementTypeLabel(item.type);
}

export function CrmTimeline({
  engagements,
  tasks,
  emails = [],
  organisationName,
  contacts = [],
  loading,
  onTaskOpen,
}: Props) {
  const [filter, setFilter] = useState<EngagementFilter | "tasks">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const items = useMemo(
    () =>
      buildCrmTimelineItems({
        engagements,
        tasks,
        emails,
        contacts,
      }),
    [engagements, tasks, emails, contacts]
  );

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
            const Icon = engagementTypeIcon(
              item.kind === "task"
                ? item.task_status === "done"
                  ? "task"
                  : "note"
                : item.type
            );
            const expanded = expandedId === item.id;
            const isTaskOpenable = Boolean(item.task_id && onTaskOpen && !item.task_missing);
            const isTaskBroken = Boolean(item.task_missing);

            const content = (
              <>
                <span className="mt-0.5 rounded-full bg-gray-100 p-2">
                  <Icon className="h-4 w-4 text-gray-600" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-[#192a3a]">
                      {timelineTypeLabel(item)}
                    </span>
                    <span className="text-xs text-gray-500">
                      {formatDateTime(item.occurred_at)}
                    </span>
                    {item.task_status === "done" ? (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium uppercase text-gray-600">
                        Completed
                      </span>
                    ) : null}
                  </span>
                  {organisationName ? (
                    <span className="text-xs text-gray-500">{organisationName}</span>
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
                  {item.outcome && !expanded && !isTaskOpenable ? (
                    <span className="mt-1 block truncate text-xs text-gray-500">
                      {item.outcome}
                    </span>
                  ) : null}
                  {isTaskBroken ? (
                    <span className="mt-1 block text-xs text-gray-400">
                      Task record unavailable
                    </span>
                  ) : null}
                </span>
                {isTaskOpenable ? (
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-gray-400" />
                ) : null}
              </>
            );

            return (
              <li key={item.id} className="px-4 py-3">
                {isTaskOpenable ? (
                  <button
                    type="button"
                    className="flex w-full cursor-pointer items-start gap-3 rounded-md text-left hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c1121f]/30"
                    onClick={(event) => {
                      event.stopPropagation();
                      onTaskOpen?.(item);
                    }}
                    aria-label={`Open task ${item.summary || ""}`}
                  >
                    {content}
                  </button>
                ) : (
                  <button
                    type="button"
                    className={`flex w-full items-start gap-3 text-left ${
                      isTaskBroken ? "cursor-default opacity-80" : ""
                    }`}
                    disabled={isTaskBroken}
                    onClick={() =>
                      !isTaskBroken
                        ? setExpandedId(expanded ? null : item.id)
                        : undefined
                    }
                  >
                    {content}
                  </button>
                )}
                {expanded && item.detail && !isTaskOpenable ? (
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
                    onClick={(event) => event.stopPropagation()}
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
