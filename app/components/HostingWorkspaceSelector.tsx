"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import OrganisationWorkspaceContext from "@/app/components/OrganisationWorkspaceContext";
import { hostingHref } from "@/lib/access/hosting-access";
import {
  HOSTING_OVERVIEW_PATH,
  isHostingDashboardPath,
  type HostingWorkspaceSelectorModel,
} from "@/lib/workspace-switch";
import type { ManageableOrganisation } from "@/lib/access/organisation-workspace";

function hostingPathWithSearch(
  pathname: string,
  searchParams: { toString(): string }
): string {
  const search = searchParams.toString();
  return search ? `${pathname}?${search}` : pathname;
}

export function hostingWorkspaceSwitchHref(input: {
  pathname: string;
  searchParams: { toString(): string };
  nextValue: string;
}): string {
  const search = input.searchParams.toString();
  const path = isHostingDashboardPath(input.pathname, search)
    ? hostingPathWithSearch(input.pathname, input.searchParams)
    : HOSTING_OVERVIEW_PATH;
  return hostingHref(path, input.nextValue);
}

export default function HostingWorkspaceSelector({
  model,
  size = "page",
  selectId = "hosting-workspace-select",
}: {
  model: HostingWorkspaceSelectorModel;
  size?: "page" | "compact";
  selectId?: string;
}) {
  const pathname = usePathname() || HOSTING_OVERVIEW_PATH;
  const searchParams = useSearchParams();
  const router = useRouter();
  const organisations: ManageableOrganisation[] = model.options.map(
    (option) => ({
      id: option.value,
      name: option.label,
      status: "active",
    })
  );

  return (
    <OrganisationWorkspaceContext
      name={model.selectedLabel}
      selectedId={model.selectedValue}
      organisations={organisations}
      size={size}
      selectId={selectId}
      selectLabel="Hosting workspace"
      onSelect={(nextValue) => {
        router.push(
          hostingWorkspaceSwitchHref({
            pathname,
            searchParams,
            nextValue,
          })
        );
      }}
    />
  );
}
