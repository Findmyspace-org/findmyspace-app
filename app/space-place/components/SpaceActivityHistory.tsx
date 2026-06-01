"use client";

import { useMemo, useState } from "react";
import type { CrmContact, CrmEngagement, CrmProfile, CrmTask } from "@/lib/space-place/types";
import { formatDateTime, displayName } from "@/lib/space-place/format";
import {
  ENGAGEMENT_FILTERS,
  engagementTypeIcon,
  engagementTypeLabel,
  matchesEngagementFilter,
  type EngagementFilter,
} from "@/lib/space-place/engagement-ui";
import { Card } from "./SpacePlaceShell";

export type SpaceEngagementRow = CrmEngagement & {
  crm_contacts?: Pick<
    CrmContact,
    "id" | "full_name" | "first_name" | "last_name"
  > | null;
  contact?: Pick<CrmContact, "id" | "full_name" | "first_name" | "last_name"> | null;
  creator?: Pick<CrmProfile, "id" | "full_name"> | null;
};

type SpaceActivityHistoryProps = {
  engagements: SpaceEngagementRow[];
  tasks: CrmTask[];
  loading?: boolean;
};

function relatedFollowUpTask(
  engagement: SpaceEngagementRow,
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
      const created = new Date(t.created_at).getTime();
      return created >= occurred - 60_000;
    })
    .sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    )[0];
}

export function SpaceActivityHistory({
  engagements,
  tasks,
  loading,
}: SpaceActivityHistoryProps) {
  const [filter, setFilter] = useState<EngagementFilter>("all");

  const filtered = useMemo(
    () =>
      engagements.filter((e) => matchesEngagementFilter(e.type, filter)),
    [engagements, filter]
  );

  if (loading) {
    return <p className="text-neutral-600">Loading activity…</p>;
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        {ENGAGEMENT_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold ${
              filter === f.value
                ? "bg-[#c1121f] text-white"
                : "border border-neutral-200 bg-white text-neutral-700"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-neutral-500">No activity in this filter yet.</p>
      ) : (
        filtered.map((e) => {
          const Icon = engagementTypeIcon(e.type);
          const contactLabel = e.contact
            ? displayName(
                e.contact.full_name,
                e.contact.first_name,
                e.contact.last_name
              )
            : null;
          const followUp = relatedFollowUpTask(e, tasks);

          return (
            <Card key={e.id} className="mb-3">
              <div className="flex gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#c1121f]/10 text-[#c1121f]">
                  <Icon className="h-5 w-5" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-neutral-500">
                    {formatDateTime(e.occurred_at)} ·{" "}
                    {engagementTypeLabel(e.type)}
                  </p>
                  {contactLabel ? (
                    <p className="mt-0.5 text-sm font-medium text-neutral-800">
                      {contactLabel}
                    </p>
                  ) : null}
                  <p className="mt-1 text-base">{e.summary || "—"}</p>
                  {e.outcome ? (
                    <p className="mt-1 text-sm text-neutral-600">
                      Outcome: {e.outcome}
                    </p>
                  ) : null}
                  {followUp ? (
                    <p className="mt-2 rounded-lg bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
                      Next: {followUp.title}
                      {followUp.due_date ? ` · due ${followUp.due_date}` : ""}
                    </p>
                  ) : null}
                  <p className="mt-2 text-xs text-neutral-500">
                    {e.creator?.full_name || "Unknown"}
                  </p>
                </div>
              </div>
            </Card>
          );
        })
      )}
    </div>
  );
}
