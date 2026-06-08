"use client";

import Link from "next/link";
import {
  CheckCircle2,
  Circle,
  Clock3,
  XCircle,
} from "lucide-react";
import type { ChecklistItem, ChecklistItemState } from "@/lib/listing-completion";

function stateIcon(state: ChecklistItemState) {
  switch (state) {
    case "done":
      return <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />;
    case "pending_review":
      return <Clock3 className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />;
    case "rejected":
      return <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />;
    default:
      return <Circle className="mt-0.5 h-5 w-5 shrink-0 text-gray-400" />;
  }
}

function stateLabel(state: ChecklistItemState) {
  switch (state) {
    case "done":
      return "Done";
    case "pending_review":
      return "Pending review";
    case "rejected":
      return "Rejected";
    default:
      return "Missing";
  }
}

function stateBadgeClass(state: ChecklistItemState) {
  switch (state) {
    case "done":
      return "bg-emerald-50 text-emerald-800";
    case "pending_review":
      return "bg-amber-50 text-amber-900";
    case "rejected":
      return "bg-red-50 text-red-800";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

export default function ListingCompletionChecklist({
  items,
  linkItems = true,
}: {
  items: ChecklistItem[];
  linkItems?: boolean;
}) {
  return (
    <ul className="space-y-4">
      {items.map((item) => (
        <li key={item.id} className="flex gap-3">
          {stateIcon(item.state)}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {linkItems ? (
                <Link
                  href={item.href}
                  className="font-medium text-[#0f2740] hover:underline"
                >
                  {item.title}
                </Link>
              ) : (
                <span className="font-medium text-gray-900">{item.title}</span>
              )}
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${stateBadgeClass(item.state)}`}
              >
                {stateLabel(item.state)}
              </span>
            </div>
            <p className="mt-0.5 text-sm text-gray-600">{item.description}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}
