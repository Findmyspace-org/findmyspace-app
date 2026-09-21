"use client";

import { GuardedLink } from "@/app/components/UnsavedChangesProvider";
import {
  BOOKING_WORKSPACE_LABEL,
  HOSTING_WORKSPACE_LABEL,
  type WorkspaceKind,
} from "@/lib/workspace-switch";

const SEGMENT_BASE =
  "inline-flex min-w-[5.5rem] items-center justify-center rounded-full px-3 py-1.5 text-xs font-semibold tracking-wide transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0c1d2f] focus-visible:ring-offset-2";
const SEGMENT_ACTIVE = "bg-[#0c1d2f] text-white shadow-sm";
const SEGMENT_INACTIVE =
  "bg-transparent text-[#192a3a] hover:bg-gray-100";

function WorkspaceSegment({
  label,
  href,
  current,
}: {
  label: string;
  href: string;
  current: boolean;
}) {
  if (current) {
    return (
      <span className={`${SEGMENT_BASE} ${SEGMENT_ACTIVE}`} aria-current="true">
        {label}
      </span>
    );
  }

  return (
    <GuardedLink href={href} className={`${SEGMENT_BASE} ${SEGMENT_INACTIVE}`}>
      {label}
    </GuardedLink>
  );
}

export default function WorkspaceSwitch({
  active,
  bookingHref,
  hostingHref,
}: {
  active: WorkspaceKind;
  bookingHref: string;
  hostingHref: string;
}) {
  return (
    <nav
      aria-label="Workspace"
      className="inline-grid shrink-0 grid-cols-2 rounded-full border border-gray-200 bg-white p-0.5 shadow-sm"
    >
      <WorkspaceSegment
        label={BOOKING_WORKSPACE_LABEL}
        href={bookingHref}
        current={active === "booking"}
      />
      <WorkspaceSegment
        label={HOSTING_WORKSPACE_LABEL}
        href={hostingHref}
        current={active === "hosting"}
      />
    </nav>
  );
}
