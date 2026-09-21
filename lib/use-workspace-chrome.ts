"use client";

import { useEffect, useState } from "react";
import { resolveHostingOrganisationId } from "@/lib/access/hosting-access";
import { fetchHostingWorkspaceDisplay } from "@/lib/hosting-access-client";
import {
  hostingOrganisationContextName,
  workspaceSwitch,
  type WorkspaceKind,
} from "@/lib/workspace-switch";

function requestedOrganisationId(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("organisation");
}

export function useWorkspaceChrome(kind: WorkspaceKind | null) {
  const [switchTarget, setSwitchTarget] = useState<{
    href: string;
    label: string;
  } | null>(() =>
    kind === "hosting"
      ? workspaceSwitch({
          kind: "hosting",
          hasHostingAccess: true,
          organisationId: null,
        })
      : null
  );
  const [organisationName, setOrganisationName] = useState<string | null>(null);

  useEffect(() => {
    if (!kind) {
      setSwitchTarget(null);
      setOrganisationName(null);
      return;
    }

    if (kind === "hosting") {
      setSwitchTarget(
        workspaceSwitch({
          kind: "hosting",
          hasHostingAccess: true,
          organisationId: null,
        })
      );
    } else {
      setSwitchTarget(null);
    }
    setOrganisationName(null);

    let mounted = true;
    fetchHostingWorkspaceDisplay()
      .then(({ summary, organisations }) => {
        if (!mounted) return;
        const organisationId = resolveHostingOrganisationId({
          requestedId: requestedOrganisationId(),
          organisationIds: summary.organisationIds,
          primaryOrganisationId: summary.primaryOrganisationId,
        });
        setSwitchTarget(
          workspaceSwitch({
            kind,
            hasHostingAccess: summary.hasHostingAccess,
            organisationId,
          })
        );
        setOrganisationName(
          kind === "hosting"
            ? hostingOrganisationContextName({
                organisationId,
                organisations,
              })
            : null
        );
      })
      .catch(() => {
        if (!mounted) return;
        setSwitchTarget(
          kind === "hosting"
            ? workspaceSwitch({
                kind: "hosting",
                hasHostingAccess: true,
                organisationId: null,
              })
            : null
        );
        setOrganisationName(null);
      });

    return () => {
      mounted = false;
    };
  }, [kind]);

  return { switchTarget, organisationName };
}
