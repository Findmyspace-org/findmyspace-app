"use client";

import { useEffect, useState } from "react";
import { GuardedLink } from "@/app/components/UnsavedChangesProvider";
import { resolveHostingOrganisationId } from "@/lib/access/hosting-access";
import { fetchHostingAccessSummary } from "@/lib/hosting-access-client";
import {
  workspaceSwitch,
  type WorkspaceKind,
} from "@/lib/workspace-switch";

function requestedOrganisationId(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("organisation");
}

export default function WorkspaceSwitch({ kind }: { kind: WorkspaceKind }) {
  const [target, setTarget] = useState(() =>
    kind === "hosting"
      ? workspaceSwitch({
          kind: "hosting",
          hasHostingAccess: true,
          organisationId: null,
        })
      : null
  );

  useEffect(() => {
    let mounted = true;

    fetchHostingAccessSummary()
      .then((summary) => {
        if (!mounted) return;
        const organisationId = resolveHostingOrganisationId({
          requestedId: requestedOrganisationId(),
          organisationIds: summary.organisationIds,
          primaryOrganisationId: summary.primaryOrganisationId,
        });
        setTarget(
          workspaceSwitch({
            kind,
            hasHostingAccess: summary.hasHostingAccess,
            organisationId,
          })
        );
      })
      .catch(() => {
        if (!mounted) return;
        setTarget(
          kind === "hosting"
            ? workspaceSwitch({
                kind: "hosting",
                hasHostingAccess: true,
                organisationId: null,
              })
            : null
        );
      });

    return () => {
      mounted = false;
    };
  }, [kind]);

  if (!target) return null;

  return (
    <GuardedLink
      href={target.href}
      className="shrink-0 text-[11px] font-medium text-gray-500 underline-offset-2 hover:text-[#0c1d2f] hover:underline sm:text-xs"
    >
      {target.label}
    </GuardedLink>
  );
}
