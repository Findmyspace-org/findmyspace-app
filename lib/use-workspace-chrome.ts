"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  hostingContextFromSummary,
  hostingContextHrefOrganisationId,
} from "@/lib/access/hosting-context";
import { ORGANISATION_QUERY_PARAM } from "@/lib/access/organisation-workspace";
import { fetchHostingWorkspaceDisplay } from "@/lib/hosting-access-client";
import {
  hostingWorkspaceContextLabel,
  hostingWorkspaceSelectorModel,
  workspaceSelector,
  type HostingWorkspaceSelectorModel,
  type WorkspaceKind,
  type WorkspaceSelectorModel,
} from "@/lib/workspace-switch";


function selectorOrNull(model: WorkspaceSelectorModel): WorkspaceSelectorModel | null {
  return model.visible ? model : null;
}

export function useWorkspaceChrome(kind: WorkspaceKind | null) {
  const searchParams = useSearchParams();
  const requestedOrganisationId = searchParams.get(ORGANISATION_QUERY_PARAM);
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
  const [hostingWorkspace, setHostingWorkspace] =
    useState<HostingWorkspaceSelectorModel | null>(null);

  useEffect(() => {
    if (!kind) {
      setSelector(null);
      setOrganisationName(null);
      setHostingWorkspace(null);
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
    setHostingWorkspace(null);

    let mounted = true;
    fetchHostingWorkspaceDisplay(requestedOrganisationId)
      .then(({ summary, organisations }) => {
        if (!mounted) return;
        const context = hostingContextFromSummary(
          summary,
          requestedOrganisationId
        );
        const hrefOrganisationId = hostingContextHrefOrganisationId(
          context,
          requestedOrganisationId
        );
        setSelector(
          selectorOrNull(
            workspaceSelector({
              kind,
              hasHostingAccess: summary.hasHostingAccess,
              organisationId: hrefOrganisationId,
            })
          )
        );
        setOrganisationName(
          kind === "hosting"
            ? hostingWorkspaceContextLabel({
                context,
                organisations,
              })
            : null
        );
        setHostingWorkspace(
          kind === "hosting"
            ? hostingWorkspaceSelectorModel({
                summary,
                context,
                organisations,
                hrefOrganisationId,
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
        setHostingWorkspace(null);
      });

    return () => {
      mounted = false;
    };
  }, [kind, requestedOrganisationId]);

  return { selector, organisationName, hostingWorkspace };
}
