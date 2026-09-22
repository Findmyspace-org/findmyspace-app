"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { hostingContextFromSummary } from "@/lib/access/hosting-context";
import { ORGANISATION_QUERY_PARAM } from "@/lib/access/organisation-workspace";
import { fetchHostingWorkspaceDisplay } from "@/lib/hosting-access-client";
import {
  hostingOrganisationContextName,
  workspaceSelector,
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
        const context = hostingContextFromSummary(
          summary,
          requestedOrganisationId
        );
        const organisationId =
          context.kind === "organisation" ? context.organisationId : null;
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
  }, [kind, requestedOrganisationId]);

  return { selector, organisationName };
}
