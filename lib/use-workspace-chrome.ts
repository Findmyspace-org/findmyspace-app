"use client";

import { useEffect, useState } from "react";
import { resolveHostingOrganisationId } from "@/lib/access/hosting-access";
import { fetchHostingWorkspaceDisplay } from "@/lib/hosting-access-client";
import {
  hostingOrganisationContextName,
  workspaceSelector,
  type WorkspaceKind,
  type WorkspaceSelectorModel,
} from "@/lib/workspace-switch";

function requestedOrganisationId(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("organisation");
}

function selectorOrNull(model: WorkspaceSelectorModel): WorkspaceSelectorModel | null {
  return model.visible ? model : null;
}

export function useWorkspaceChrome(kind: WorkspaceKind | null) {
  const [selector, setSelector] = useState<WorkspaceSelectorModel | null>(() =>
    kind === "hosting"
      ? workspaceSelector({
          kind: "hosting",
          hasHostingAccess: true,
          organisationId: null,
        })
      : null
  );
  const [organisationName, setOrganisationName] = useState<string | null>(null);

  useEffect(() => {
    if (!kind) {
      setSelector(null);
      setOrganisationName(null);
      return;
    }

    setSelector(
      selectorOrNull(
        workspaceSelector({
          kind,
          hasHostingAccess: kind === "hosting",
          organisationId: null,
        })
      )
    );
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
        setSelector(
          selectorOrNull(
            workspaceSelector({
              kind,
              hasHostingAccess: summary.hasHostingAccess,
              organisationId,
            })
          )
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
        setSelector(
          kind === "hosting"
            ? workspaceSelector({
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

  return { selector, organisationName };
}
